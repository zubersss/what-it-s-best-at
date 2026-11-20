#!/usr/bin/env python3
"""The maps of the worlds added in milestone 6, from the USGS planetary map server
(public mission data; sources and licences per file in docs/ASSETS.md).

    pip install rasterio numpy pillow
    python3 scripts/fetch-worlds.py [--cache DIR] [job ...]        (default: every job)

The originals (about 5 GB) are downloaded whole into the cache (default .cache/maps,
git-ignored) and only small products are written into public/data/:
    <id>_color_<W>.jpg, <id>_color_512.jpg    image map (albedoMap of the terrain; the globe seen from afar)
    <id>_dem_4ppd.i16                         global elevation, 1440 x 720, int16 LE (units in the world file)
    <id>_slopes_<W>.jpg                       the ground's slope everywhere (see slope_jpeg)
    <id>_dem_<site>.i16                       a sharper window of elevation at a site
Every raster is simple cylindrical, longitude 0..360 E from the left edge, latitude +90
at the top (the engine's planet-fixed frame). The script prints the numbers the world
files need (means, height ranges).
"""
import os, sys, ssl, urllib.request, warnings
import numpy as np
from PIL import Image
warnings.filterwarnings('ignore')
Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'data')
args = sys.argv[1:]
CACHE = os.path.join(HERE, '..', '.cache', 'maps')
if '--cache' in args: i = args.index('--cache'); CACHE = args[i + 1]; del args[i:i + 2]
BUCKET = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/'      # what planetarymaps.usgs.gov redirects to

def get(key):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, os.path.basename(key))
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        print('downloading', key, flush=True)
        ctx = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt') if os.path.exists('/root/.ccr/ca-bundle.crt') else None
        with urllib.request.urlopen(BUCKET + key, timeout=1800, context=ctx) as r, open(path + '.part', 'wb') as f:
            while True:
                b = r.read(1 << 22)
                if not b: break
                f.write(b)
        os.rename(path + '.part', path)
    return path

def read_global(key, width, height=None, lon_left=None, fill='interp'):
    """A whole-body cylindrical raster box-averaged to width x height, as float32
    (height, width, bands), longitude 0..360 E from the left, NaN where there is no data."""
    import rasterio
    from rasterio.enums import Resampling
    height = height or width // 2
    path = get(key)
    if path.lower().endswith(('.jpg', '.png')):
        im = Image.open(path).convert('RGB' if Image.open(path).mode not in ('L',) else 'L')
        a = np.asarray(im.resize((width, height), Image.BOX), dtype=np.float32)
        a = a[:, :, None] if a.ndim == 2 else a
        left = -180.0 if lon_left is None else lon_left
    else:
        with rasterio.open(path) as d:
            a = d.read(out_shape=(d.count, height, width), resampling=Resampling.average, masked=True).astype(np.float32)
            a = np.moveaxis(np.ma.filled(a, np.nan), 0, 2)
            a[a < -1e30] = np.nan                                       # (a float no-data value that misses its own label by a rounding)
            if d.nodata is not None and d.dtypes[0] == 'uint8': a[(a <= 0).all(axis=2)] = np.nan
            left = lon_left if lon_left is not None else left_longitude(d)
    # the longitude of the left edge decides how far the columns turn (0: none; -180 or 180: half)
    a = np.roll(a, int(round((left % 360.0) / 360.0 * width)), axis=1)
    return a

def left_longitude(d):
    """East longitude of a mosaic's left edge. The projection's centre longitude counts: a
    file whose x runs from -pi R is 0..360 when that centre is 180 and -180..180 when it is
    0 (reading only the x range put half the worlds 180 degrees round)."""
    try: c = d.crs.to_dict()
    except Exception: c = {}
    if c.get('proj') == 'eqc':
        R = c.get('a') or c.get('R')
        return (float(c.get('lon_0') or 0.0) + np.degrees(d.bounds.left / (R * np.cos(np.radians(float(c.get('lat_ts') or 0.0)))))) % 360.0
    if c.get('proj') == 'longlat': return d.bounds.left % 360.0
    return 0.0                                   # no georeference: taken as 0..360 (the server's "dd360" files)

def fill_rows(a):
    """Empty cells take the value of their nearest filled neighbours along the row, then
    along the column (for maps with small gaps)."""
    a = a.copy()
    for b in range(a.shape[2]):
        ch = a[:, :, b]
        for row in ch:
            e = np.isnan(row)
            if e.any() and not e.all(): row[e] = np.interp(np.flatnonzero(e), np.flatnonzero(~e), row[~e], period=len(row))
        for col in ch.T:
            e = np.isnan(col)
            if e.any() and not e.all(): col[e] = np.interp(np.flatnonzero(e), np.flatnonzero(~e), col[~e])
    return a

def fill_unseen(a, feather=40):
    """Ground no spacecraft has seen (a winter pole in the dark): it takes the colour of the
    nearest ground that was seen at that longitude, smoothed along the latitude circle so no
    feature is invented, and the seen ground fades into it over a few cells."""
    from PIL import ImageFilter
    seen = ~np.isnan(a[:, :, 0])
    h, w = seen.shape
    if seen.all(): return a
    out = np.nan_to_num(a.copy())
    rows = np.arange(h)[:, None] * np.ones((1, w), dtype=int)
    up = np.maximum.accumulate(np.where(seen, rows, -1), axis=0)                        # nearest seen row above
    dn = np.minimum.accumulate(np.where(seen, rows, 10 ** 9)[::-1], axis=0)[::-1]       # ... and below
    pick = np.where((up >= 0) & ((dn >= 10 ** 9) | (rows - up <= dn - rows)), up, np.where(dn < 10 ** 9, dn, 0))
    cols = np.arange(w)[None, :] * np.ones((h, 1), dtype=int)
    edge = out[pick, cols]
    k = max(8, w // 12)
    for c in range(a.shape[2]):
        ch = np.concatenate([edge[:, -k:, c], edge[:, :, c], edge[:, :k, c]], axis=1)
        csum = np.cumsum(ch, axis=1)
        edge[:, :, c] = (csum[:, 2 * k:] - csum[:, :-2 * k]) / (2 * k)
    # (the edge of the seen ground is where the pictures are worst, dark and off-colour:
    # mostly the mean of everything seen, a little of the local edge)
    edge = 0.35 * edge + 0.65 * out[seen].mean(axis=0)
    m = np.asarray(Image.fromarray((seen * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather)), dtype=np.float32) / 255.0
    wgt = (np.clip((m - 0.5) * 2, 0, 1) * seen)[:, :, None]
    return out * wgt + edge * (1 - wgt)

def blur(a, sigma):
    """Gaussian blur of a float image (wrapping in longitude)."""
    r = max(1, int(sigma * 3)); x = np.arange(-r, r + 1); k = np.exp(-x * x / (2 * sigma * sigma)); k /= k.sum()
    b = np.concatenate([a[:, -r:], a, a[:, :r]], axis=1)
    b = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 1, b)
    b = np.concatenate([np.repeat(b[:1], r, axis=0), b, np.repeat(b[-1:], r, axis=0)], axis=0)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 0, b).astype(np.float32)

def save_jpg(a, name, quality=88):
    a = np.clip(np.round(a), 0, 255).astype(np.uint8)
    im = Image.fromarray(a[:, :, 0] if a.shape[2] == 1 else a[:, :, :3])
    im.save(os.path.join(OUT, name), quality=quality, optimize=True)
    return os.path.getsize(os.path.join(OUT, name)) / 1e6

def lin(c): c = c / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def color_maps(wid, a, width, far=512, quality=88, note=''):
    """Writes <id>_color_<width>.jpg and <id>_color_512.jpg and prints the linear mean."""
    h, w = a.shape[:2]
    full = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8).squeeze()).resize((width, width // 2), Image.LANCZOS if w < width else Image.BOX), dtype=np.float32)
    full = full[:, :, None] if full.ndim == 2 else full
    mb = save_jpg(full, f'{wid}_color_{width}.jpg', quality)
    small = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8).squeeze()).resize((far, far // 2), Image.BOX), dtype=np.float32)
    save_jpg(small[:, :, None] if small.ndim == 2 else small, f'{wid}_color_{far}.jpg', 90)
    # area-weighted mean of the linear values (what albedoMap.mean wants)
    lat = (np.arange(h) + 0.5) / h * np.pi - np.pi / 2
    wgt = np.cos(lat)[:, None, None] * np.ones_like(a)
    mean = (lin(a) * wgt).sum(axis=(0, 1)) / wgt.sum(axis=(0, 1))
    print(f'{wid}_color_{width}.jpg {mb:.2f} MB  linear mean {np.round(mean, 4).tolist()} {note}', flush=True)

def ramp(grey, stops):
    """Colours a one-band map by its brightness: stops = [(value 0..255, (r, g, b)), ...]."""
    xs = [s[0] for s in stops]
    return np.stack([np.interp(grey[:, :, 0], xs, [s[1][c] for s in stops]) for c in range(3)], axis=2)

def dem_products(wid, h, radius, unit=1.0, slopes_width=4096, quality=90):
    """h: float metres (height, width), 0..360 E. Writes the 4 px/deg global raster (in
    `unit` metres per count) and the slope map; prints the range."""
    H, W = h.shape
    # (a coarser source is interpolated smoothly: repeated pixels would be steps in the ground)
    g = np.asarray(Image.fromarray(h.astype(np.float32), mode='F').resize((1440, 720), Image.BOX if W >= 1440 else Image.BICUBIC), dtype=np.float32)
    g = calm_poles(g)
    np.round(g / unit).astype('<i2').tofile(os.path.join(OUT, f'{wid}_dem_4ppd.i16'))
    print(f'{wid}_dem_4ppd.i16 metres {float(h.min()):.0f} .. {float(h.max()):.0f} (4 px/deg: {float(g.min()):.0f} .. {float(g.max()):.0f}), unit {unit}', flush=True)
    slope_jpeg(wid, h, radius, slopes_width, quality)

def calm_poles(g):
    """Toward a pole the columns of a cylindrical raster crowd together, and the noise of the
    last rows becomes a star of ridges round the pole: each row is averaged along itself
    over the same distance on the ground as two cells at the equator."""
    g = g.copy(); H, W = g.shape
    for j in range(H):
        lat = 90.0 - (j + 0.5) * 180.0 / H
        n = int(round(1.0 / max(np.cos(np.radians(lat)), 1e-3)))
        if n < 2: continue
        n = min(n, W // 2)
        row = np.concatenate([g[j, -n:], g[j], g[j, :n]])
        c = np.cumsum(np.insert(row, 0, 0.0))
        g[j] = (c[2 * n + 1:] - c[:-(2 * n + 1)])[:W] / (2 * n + 1)
    return g

def slope_jpeg(wid, h, radius, width, quality=90):
    """The ground's slope everywhere, for relief shading from space: one greyscale JPEG
    twice as tall as wide, east slope in the top half, north slope in the bottom half,
    each stored as 127.5 + 127.5 sign(s) sqrt(min(|s|, 1)) (as fetch-maps.py does)."""
    hh = np.asarray(Image.fromarray(h.astype(np.float32), mode='F').resize((width, width // 2), Image.BOX if h.shape[1] >= width else Image.BICUBIC), dtype=np.float64)
    hh = calm_poles(hh)
    rows = width // 2
    lat = 90.0 - (np.arange(rows) + 0.5) * 180.0 / rows
    dx = 2 * np.pi * radius * np.maximum(np.cos(np.radians(lat)), 0.05)[:, None] / width
    dy = np.pi * radius / rows
    sE = (np.roll(hh, -1, axis=1) - np.roll(hh, 1, axis=1)) / (2 * dx)
    hn = np.vstack([hh[:1], hh, hh[-1:]])
    sN = (hn[:-2] - hn[2:]) / (2 * dy)
    enc = lambda s: np.clip(np.round(127.5 + 127.5 * np.sign(s) * np.sqrt(np.minimum(np.abs(s), 1.0))), 0, 255).astype(np.uint8)
    name = f'{wid}_slopes_{width}.jpg'
    Image.fromarray(np.vstack([enc(sE), enc(sN)])).save(os.path.join(OUT, name), quality=quality)
    print(f'{name} p99 slope {float(np.percentile(np.abs(sE), 99)):.3f}  {os.path.getsize(os.path.join(OUT, name)) / 1e6:.2f} MB', flush=True)

def window(key, lon0, lon1, lat0, lat1, name, unit=1.0, scale=1.0, offset=0.0, avg=1, base=None):
    """A window of an elevation mosaic at its own resolution (box-averaged avg x avg):
    longitudes east 0..360, lat0 the northern edge. base(lat) adds metres per row."""
    import rasterio
    from rasterio.windows import Window
    with rasterio.open(get(key)) as d:
        left = left_longitude(d)
        ppd = d.width / 360.0
        c0, r0 = round(((lon0 - left) % 360.0) * ppd), round((90 - lat0) * ppd)
        if c0 + (lon1 - lon0) * ppd > d.width + 1: raise SystemExit(f'{name}: the window crosses the edge of the mosaic')
        w, h = round((lon1 - lon0) * ppd / avg) * avg, round((lat0 - lat1) * ppd / avg) * avg
        a = d.read(1, window=Window(c0, r0, w, h), masked=True).astype(np.float32)
        a = np.ma.filled(a, np.nan) * scale + offset
    h, w = (a.shape[0] // avg) * avg, (a.shape[1] // avg) * avg          # (what was really read, in whole cells)
    a = a[:h, :w]
    if np.isnan(a).all(): raise SystemExit(f'{name}: no data in this window')
    if np.isnan(a).any(): a = fill_rows(a[:, :, None])[:, :, 0]
    if avg > 1: a = a.reshape(h // avg, avg, w // avg, avg).mean(axis=(1, 3))
    if base is not None:
        lat = lat0 - (np.arange(a.shape[0]) + 0.5) * (lat0 - lat1) / a.shape[0]
        a = a + base(lat)[:, None]
    np.round(a / unit).astype('<i2').tofile(os.path.join(OUT, name))
    print(f"{{ url: 'data/{name}', width: {a.shape[1]}, height: {a.shape[0]}, lon0: {lon0}, lon1: {lon0 + w / ppd}, lat0: {lat0}, lat1: {lat0 - h / ppd}, feather: 0.25{'' if unit == 1 else f', scale: {unit}'} }},   // {a.min():.0f} .. {a.max():.0f} m, {np.pi * 2 / 360 / ppd * avg:.6f} rad/px", flush=True)

M = 'mosaic/'
DEIMOS_LEFT = JUPITER_LEFT = 0.0      # (their world files: the left edge is longitude 0)
W = 'wms_basemaps/'

# ---- jobs --------------------------------------------------------------------------------
def phobos():
    a = fill_rows(read_global(M + 'Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif', 4096))
    color_maps('phobos', a, 2048)
    h = fill_rows(read_global(M + 'Phobos_ME_HRSC_DEM_Global_2ppd.tif', 720, 360))[:, :, 0]
    dem_products('phobos', h, 11100.0, slopes_width=1024)

def deimos():
    a = read_global(W + 'Deimos/deimoscyl4.jpg', 2048, lon_left=DEIMOS_LEFT)
    color_maps('deimos', a, 2048)

def mercury():
    a = fill_rows(read_global(M + 'Mercury_MESSENGER_MDIS_Basemap_MD3Color_Mosaic_Global_665m.tif', 4096))
    # (the mosaic's colour is three far-apart filters: most of it is taken out, toward the
    # grey-brown the eye would see)
    grey = a.mean(axis=2, keepdims=True)
    a = (grey * 0.75 + a * 0.25) * np.array([1.03, 0.99, 0.93])
    color_maps('mercury', a, 4096)
    # (the product's numbers are half metres: its range is -10.8 .. +8.9 thousand, Mercury's
    # is -5.4 .. +4.5 km)
    h = fill_rows(read_global(M + 'Mercury_Messenger_USGS_DEM_Global_665m_v2.tif', 5760))[:, :, 0] * 0.5
    dem_products('mercury', h, 2439400.0)

def venus():
    a = fill_rows(read_global(M + 'Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m.tif', 4096))
    color_maps('venus', a, 4096)
    h = fill_rows(read_global(M + 'Venus_Magellan_Topography_Global_4641m_v02.tif', 4096))[:, :, 0]
    dem_products('venus', h, 6051800.0, slopes_width=4096)

def io():
    a = fill_rows(read_global(M + 'Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif', 4096))
    color_maps('io', a, 4096)

def io_dem():
    """Io has no elevation map, but its lava is plain to see: the dark floors of its paterae
    (volcanic depressions), flat and about a kilometre below the plains. Elevation made from
    the colour mosaic: 0 on the plains, down to -1100 m where the picture is dark lava,
    8 px/deg. (Its mountains are added by name in the world file.)"""
    from PIL import ImageFilter
    a = fill_rows(read_global(M + 'Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif', 2880))
    L = a.mean(axis=2)
    L = blur(L, 1.2)
    m = np.clip((92.0 - L) / 34.0, 0, 1); m = m * m * (3 - 2 * m)
    lat = np.abs(90 - (np.arange(1440) + 0.5) / 8)[:, None]
    m = m * np.clip((78 - lat) / 8, 0, 1)                      # (the mosaic's poles are dark for want of light, not lava)
    h = -1100.0 * m
    np.round(h).astype('<i2').tofile(os.path.join(OUT, 'io_dem_8ppd.i16'))
    print('io_dem_8ppd.i16 2880x1440, lava floors cover', float((m > 0.5).mean()))

def titan_dem():
    """Titan's elevation is not on the map server. A stand-in made from the near-infrared
    mosaic: the bright uplands (Xanadu and the like) a few hundred metres up, the dark sand
    seas low, 4 px/deg and smooth. Enough for the dunes to lie where the real ones do."""
    from PIL import ImageFilter
    g = np.load(os.path.join(CACHE, 'titan_grey.npy'))
    g = blur(np.asarray(Image.fromarray(g.astype(np.float32), mode='F').resize((1440, 720), Image.BOX), dtype=np.float32), 2.5)
    lo, hi = np.percentile(g, [8, 92])
    t = np.clip((g - lo) / (hi - lo), 0, 1)
    h = -250.0 + 800.0 * t * t * (3 - 2 * t)
    np.round(h).astype('<i2').tofile(os.path.join(OUT, 'titan_dem_4ppd.i16'))
    print('titan_dem_4ppd.i16 metres', float(h.min()), float(h.max()), 'share below -100 m (sand seas):', float((h < -100).mean()))

def europa():
    g = fill_rows(read_global(M + 'Europa_Voyager_GalileoSSI_global_mosaic_500m.tif', 4096))
    # ice from blue-white to the red-brown of the lineae and the chaos regions
    color_maps('europa', ramp(g, [(0, (38, 22, 14)), (70, (110, 72, 50)), (130, (178, 150, 124)), (190, (226, 220, 208)), (255, (252, 252, 255))]), 4096)
    np.save(os.path.join(CACHE, 'europa_grey.npy'), g[:, :, 0])

def ganymede():
    color_maps('ganymede', fill_rows(read_global(M + 'Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif', 2048)), 2048)

def callisto():
    g = fill_rows(read_global(M + 'Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif', 2048))
    color_maps('callisto', ramp(g, [(0, (20, 16, 12)), (110, (112, 98, 82)), (200, (205, 196, 180)), (255, (255, 252, 244))]), 2048)

def jupiter():
    a = read_global(W + 'Jupiter/Jupiter/jupiter_rgb_cyl.jpg', 4096, lon_left=JUPITER_LEFT)
    color_maps('jupiter', a, 4096, quality=90)

def enceladus():
    g = fill_rows(read_global(M + 'Enceladus_Cassini_mosaic_global_110m.tif', 4096))
    color_maps('enceladus', ramp(g, [(0, (60, 66, 76)), (120, (176, 184, 194)), (200, (232, 238, 244)), (255, (255, 255, 255))]), 4096)
    # the shape model's radius, in metres above the 252.1 km mean sphere (Bland et al. 2019):
    # the whole flattened shape, 5 km high at the sub-Saturn point and 4 km low at the poles
    r = read_global(M + 'Enceladus/enceladus_cassini_iss_shapemodel_bland_2019/enceladus_2019pm_radius.tif', 720, 360)
    lat = np.cos((np.arange(360) + 0.5) / 360 * np.pi - np.pi / 2)[:, None] * ~np.isnan(r[:, :, 0])
    print('enceladus radius product: area mean', float(np.nansum(r[:, :, 0] * lat) / lat.sum()), 'coverage', float((~np.isnan(r)).mean()))
    dem_products('enceladus', fill_rows(r)[:, :, 0], 252100.0, slopes_width=1024)

def saturn_moons():
    for wid, key, kw in [('mimas', W + 'Saturn/Mimas/Cassini/Mimas_PDS_8ppd_dd360.tif', dict(lon_left=0.0)), ('tethys', M + 'Tethys_Cassini_mosaic_global_293m.tif', {}),
                         ('dione', M + 'Dione_Cassini_Voyager_mosaic_global_154m.tif', {}), ('rhea', M + 'Rhea_Cassini_Voyager_mosaic_global_417m.tif', {}),
                         ('iapetus', M + 'Iapetus_Cassini_Voyager_mosaic_global_783m.tif', {})]:
        color_maps(wid, fill_rows(read_global(key, 2048, **kw)), 2048, quality=85)

def titan():
    g = read_global(W + 'Saturn/Titan/Cassini/Titan_ISS_P19658_Mosaic_Global_4km_clon0.tif', 4096)
    np.save(os.path.join(CACHE, 'titan_grey.npy'), g[:, :, 0])
    # the ground as the 938 nm camera saw it through the haze, in the browns of Huygens' pictures
    color_maps('titan', ramp(g, [(0, (30, 18, 8)), (90, (104, 70, 36)), (170, (190, 140, 78)), (255, (244, 208, 150))]), 4096)

def triton():
    a = read_global(M + 'Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif', 4096)
    # Voyager's orange, green and blue filters, shown as red, green, blue, come out green:
    # toward the pale pink of the natural-colour pictures. The winter north was never seen.
    a = np.stack([a[:, :, 0] * 1.10 + 6, a[:, :, 1] * 0.94, a[:, :, 2] * 0.90], axis=2)
    color_maps('triton', fill_unseen(a, 60), 4096)

def pluto():
    g = read_global(M + 'Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif', 4096)
    g = fill_unseen(g, 50)
    # Cthulhu's dark red-brown, the tan middle ground, the cream of Sputnik Planitia
    color_maps('pluto', ramp(g, [(0, (40, 18, 12)), (60, (110, 60, 40)), (130, (188, 150, 118)), (200, (232, 214, 190)), (255, (255, 250, 240))]), 4096)
    h = read_global(M + 'Pluto_NewHorizons_Global_DEM_300m_Jul2017_16bit.tif', 5760)[:, :, 0]
    print('pluto DEM coverage', float((~np.isnan(h)).mean()))
    h = np.nan_to_num(soften_edges(h))
    dem_products('pluto', h, 1188300.0)

def charon():
    g = fill_unseen(read_global(M + 'Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif', 4096), 50)
    color_maps('charon', ramp(g, [(0, (30, 28, 28)), (110, (120, 114, 108)), (200, (206, 200, 192)), (255, (250, 248, 244))]), 4096)
    h = read_global(M + 'Charon_NewHorizons_Global_DEM_300m_Jul2017_16bit.tif', 4096)[:, :, 0]
    print('charon DEM coverage', float((~np.isnan(h)).mean()))
    dem_products('charon', np.nan_to_num(soften_edges(h)), 606000.0)

def soften_edges(h, px=24):
    """Elevation known for part of a world only: heights fall to the datum over a few
    cells at the edge of the data instead of ending in a cliff."""
    from PIL import ImageFilter
    known = ~np.isnan(h)
    m = np.asarray(Image.fromarray((known * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(px)), dtype=np.float32) / 255.0
    w = np.clip((m - 0.5) * 2, 0, 1) * known
    return np.nan_to_num(h) * w

def ceres():
    g = fill_rows(read_global(M + 'Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif', 4096))
    color_maps('ceres', ramp(g, [(0, (18, 17, 16)), (118, (104, 100, 94)), (200, (190, 186, 178)), (255, (255, 255, 255))]), 4096)
    h = fill_rows(read_global(M + 'Ceres_Dawn_FC_HAMO_DTM_DLR_Global_60ppd_Oct2016.tif', 5760))[:, :, 0]
    print('ceres DTM mean by latitude band (equator, 45, pole):', [float(h[r].mean()) for r in (1440, 720, 20)])
    dem_products('ceres', h, 470000.0)

def sites():
    """Sharper windows of elevation at the places the game opens on and names."""
    MERC = M + 'Mercury_Messenger_USGS_DEM_Global_665m_v2.tif'          # 64 px/deg, metres
    window(MERC, 300, 314, 64, 52, 'mercury_dem_carnegie.i16', scale=0.5)            # Carnegie Rupes cutting Duccio crater
    window(MERC, 156, 170, 37, 25, 'mercury_dem_caloris.i16', scale=0.5)             # Pantheon Fossae and Apollodorus, the middle of Caloris
    window(MERC, 51, 64, 33, 22, 'mercury_dem_rachmaninoff.i16', scale=0.5)          # the Rachmaninoff double-ring basin
    window(MERC, 322, 335, -6, -16, 'mercury_dem_kuiper.i16', scale=0.5)             # Kuiper, the bright rayed crater
    VEN = M + 'Venus_Magellan_Topography_Global_4641m_v02.tif'            # 22.7 px/deg: already close to the 4 px/deg global; windows at full detail
    window(VEN, 0, 12, 70, 60, 'venus_dem_maxwell.i16')                   # Maxwell Montes, 11 km high
    window(VEN, 190, 202, 5, -3, 'venus_dem_maat.i16')                    # Maat Mons
    PLU = M + 'Pluto_NewHorizons_Global_DEM_300m_Jul2017_16bit.tif'       # 69 px/deg
    window(PLU, 168, 184, 32, 8, 'pluto_dem_sputnik.i16', avg=2)          # the west shore of Sputnik Planitia: al-Idrisi, Hillary and Tenzing Montes
    window(PLU, 170, 178, -8, -20, 'pluto_dem_wright.i16')                # Wright Mons and the south end of the ice plain
    CHA = M + 'Charon_NewHorizons_Global_DEM_300m_Jul2017_16bit.tif'      # 35 px/deg
    window(CHA, 0, 30, 30, 0, 'charon_dem_serenity.i16')                  # Serenity Chasma and Kubrick Mons (the mountain in a moat)
    CER = M + 'Ceres_Dawn_FC_HAMO_DTM_DLR_Global_60ppd_Oct2016.tif'       # 60 px/deg, metres above 470 km
    window(CER, 233, 246, 26, 14, 'ceres_dem_occator.i16')                # Occator crater and its bright spots
    window(CER, 310, 322, -5, -16, 'ceres_dem_ahuna.i16')                 # Ahuna Mons, the lone ice volcano

def far_copies():
    """Small copies of the two older worlds' maps, for their globes seen from afar."""
    for src, dst in [('mars_color_4096.jpg', 'mars_color_512.jpg'), ('moon_albedo_4096.jpg', 'moon_albedo_512.jpg')]:
        im = Image.open(os.path.join(OUT, src)); im.resize((512, 256), Image.BOX).save(os.path.join(OUT, dst), quality=90)
        print(dst)

JOBS = dict(phobos=phobos, deimos=deimos, mercury=mercury, venus=venus, io=io, europa=europa, ganymede=ganymede, callisto=callisto,
            jupiter=jupiter, enceladus=enceladus, sites=sites, far_copies=far_copies, io_dem=io_dem, titan_dem=titan_dem, saturn_moons=saturn_moons, titan=titan, triton=triton, pluto=pluto, charon=charon, ceres=ceres)
if __name__ == '__main__':
    for job in (args or list(JOBS)):
        JOBS[job]()
