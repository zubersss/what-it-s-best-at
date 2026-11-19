#!/usr/bin/env python3
"""Downloads and converts the public-domain global maps that are too large to fetch whole:
only the rows or windows that are needed are read, over HTTP range requests.

    pip install rasterio numpy pillow
    python3 scripts/fetch-maps.py [moon-dem] [landmarks] [relief] [moon-albedo] [mars-color]      (default: all)

Writes into public/data/ (see docs/ASSETS.md for sources and licences):
    moon_lola_4ppd.i16            global lunar elevation, 1440 x 720, int16 LE metres
    moon_sldem_apennine_64ppd.i16 regional inset around the Apennines and Hadley, 768 x 640, 0.5 m units
    moon_sldem_hadley_512ppd.i16  Hadley Rille at the full 59 m of SLDEM2015, 1024 x 1152, 0.5 m units
    mars_mola_olympus_32ppd.i16, mars_mola_olympus_summit_128ppd.i16, mars_mola_gale_128ppd.i16,
    moon_sldem_tycho_64ppd.i16, moon_sldem_taurus_littrow_256ppd.i16      landmark patches
    mars_slopes_4096.jpg, moon_slopes_4096.jpg   the ground's slope everywhere (relief shading from space)
    moon_albedo_4096.jpg          global lunar brightness (Clementine 750 nm), 4096 x 2048
    mars_color_4096.jpg           global Mars colour (Viking MDIM 2.1), 4096 x 2048
All rasters are simple cylindrical, longitude 0..360 E from the left edge, latitude +90 at
the top, matching the engine's planet-fixed frame.
"""
import os, sys, threading, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import rasterio
from rasterio.windows import Window
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
USGS = '/vsicurl/https://planetarymaps.usgs.gov/mosaic/'
PDS_LOLA = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/'
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', CPL_VSIL_CURL_CHUNK_SIZE='2097152', GDAL_HTTP_MAX_RETRY='5', GDAL_HTTP_RETRY_DELAY='2')
if os.path.exists('/root/.ccr/ca-bundle.crt'): os.environ.setdefault('CURL_CA_BUNDLE', '/root/.ccr/ca-bundle.crt')

def moon_dem():
    # Global, 4 px/deg: the PDS product itself (2 MB). DN x 0.5 = metres above 1737.4 km.
    raw = urllib.request.urlopen(PDS_LOLA + 'ldem_4.img', timeout=120).read()
    g = np.frombuffer(raw, dtype='<i2').reshape(720, 1440)
    np.round(g * 0.5).astype('<i2').tofile(os.path.join(OUT, 'moon_lola_4ppd.i16'))
    print('moon_lola_4ppd.i16', g.shape, 'metres', float(g.min()) * 0.5, float(g.max()) * 0.5)
    # Insets from SLDEM2015 (LOLA altimetry merged with Kaguya stereo: 512 px/deg, 59 m,
    # latitude 60 S..60 N, longitude from -180). Stored as the product's own numbers:
    # 0.5 m per unit (the world file says scale: 0.5).
    lon0, lon1, lat0, lat1 = 0, 12, 31, 21                   # the Apennines, box-averaged 8 x 8 -> 64 px/deg
    a = sldem_window(lon0, lon1, lat0, lat1)
    a = a.reshape(a.shape[0] // 8, 8, a.shape[1] // 8, 8).mean(axis=(1, 3))
    np.round(a).astype('<i2').tofile(os.path.join(OUT, 'moon_sldem_apennine_64ppd.i16'))
    print('moon_sldem_apennine_64ppd.i16', a.shape[::-1], 'metres', float(a.min()) * 0.5, float(a.max()) * 0.5)
    b = sldem_window(2.5, 4.5, 27, 24.75)                    # Hadley Rille, full resolution
    np.round(b).astype('<i2').tofile(os.path.join(OUT, 'moon_sldem_hadley_512ppd.i16'))
    print('moon_sldem_hadley_512ppd.i16', b.shape[::-1], 'metres', float(b.min()) * 0.5, float(b.max()) * 0.5)

SLDEM = 'LolaKaguya_Topo/Lunar_LRO_LOLAKaguya_DEMmerge_60N60S_512ppd.tif'      # 512 px/deg, rows from 60 N, 0.5 m units
MOLA = 'Mars_MGS_MOLA_DEM_mosaic_global_463m.tif'                               # 128 px/deg, rows from 90 N, metres

def window_rows(name, lon0, lon1, lat0, lat1, ppd, top):
    """Reads a window of an uncompressed global mosaic (longitude from -180, first row at
    latitude `top`) row by row: each row is one small range request."""
    if lon0 >= 180: lon0, lon1 = lon0 - 360, lon1 - 360
    c0, r0, w, h = round((lon0 + 180) * ppd), round((top - lat0) * ppd), round((lon1 - lon0) * ppd), round((lat0 - lat1) * ppd)
    local = threading.local()
    env = dict(ENV, CPL_VSIL_CURL_CHUNK_SIZE='16384')
    def row(j):
        if not hasattr(local, 'ds'):
            local.env = rasterio.Env(**env); local.env.__enter__(); local.ds = rasterio.open(USGS + name)
        return j, local.ds.read(1, window=Window(c0, r0 + j, w, 1))[0]
    out = np.zeros((h, w), np.float32)
    with ThreadPoolExecutor(12) as pool:
        for n, (j, v) in enumerate(pool.map(row, range(h))):
            out[j] = v
            if n % 512 == 0: print(f'  {name.split("/")[-1][:24]} rows {n}/{h}', flush=True)
    return out

def sldem_window(lon0, lon1, lat0, lat1):
    return window_rows(SLDEM, lon0, lon1, lat0, lat1, 512, 60)

def inset(src, out, lon0, lon1, lat0, lat1, ppd, top, avg):
    """One landmark patch: a window of a mosaic, box-averaged avg x avg, in the mosaic's own units."""
    a = window_rows(src, lon0, lon1, lat0, lat1, ppd, top)
    if avg > 1: a = a.reshape(a.shape[0] // avg, avg, a.shape[1] // avg, avg).mean(axis=(1, 3))
    np.round(a).astype('<i2').tofile(os.path.join(OUT, out))
    print(out, a.shape[::-1], 'units', float(a.min()), float(a.max()))

def landmarks():
    # Mars (MOLA): the Olympus Mons shield, its summit calderas, and Gale crater with Mount Sharp
    inset(MOLA, 'mars_mola_olympus_32ppd.i16', 219, 233, 25, 12, 128, 90, 4)
    inset(MOLA, 'mars_mola_olympus_summit_128ppd.i16', 224.75, 227.75, 20, 17, 128, 90, 1)
    inset(MOLA, 'mars_mola_gale_128ppd.i16', 135.75, 139.75, -3.25, -7.25, 128, 90, 1)
    # Moon (SLDEM2015): Tycho, and the Taurus-Littrow valley where Apollo 17 landed
    inset(SLDEM, 'moon_sldem_tycho_64ppd.i16', 345.5, 351.75, -40.75, -45.75, 512, 60, 8)
    inset(SLDEM, 'moon_sldem_taurus_littrow_256ppd.i16', 30.0, 31.5, 20.875, 19.5, 512, 60, 2)

def global_map(name, out, width=2880, rows_per=2, quality=88):
    """Box-averages a huge uncompressed mosaic down to width x width/2 by reading rows_per
    evenly spaced source rows for every output row (each row is one small range request)."""
    height = width // 2
    local = threading.local()
    with rasterio.Env(**ENV), rasterio.open(USGS + name) as probe:
        W, H, bands = probe.width, probe.height, probe.count
        left = probe.bounds.left
    fx, fy = W // width, H / height
    def handle():
        if not hasattr(local, 'ds'):
            local.env = rasterio.Env(**ENV); local.env.__enter__(); local.ds = rasterio.open(USGS + name)
        return local.ds
    def row(j):
        ds, acc = handle(), None
        for k in range(rows_per):
            r = min(H - 1, int((j + (k + 0.5) / rows_per) * fy))
            a = ds.read(window=Window(0, r, fx * width, 1)).astype(np.float32)[:, 0, :]      # bands x W
            a = a.reshape(bands, width, fx)
            valid = (a > 0).any(axis=0)                                                       # 0 = no data
            s = (a * valid).sum(axis=2) / np.maximum(valid.sum(axis=1), 1)
            acc = s if acc is None else acc + s
        return j, acc / rows_per
    img = np.zeros((height, width, bands), np.float32)
    with ThreadPoolExecutor(12) as pool:
        for n, (j, v) in enumerate(pool.map(row, range(height))):
            img[j] = v.T
            if n % 240 == 0: print(f'  {name}: row {n}/{height}', flush=True)
    # fill the few empty cells (no data) from their neighbours along the row
    for b in range(bands):
        ch = img[:, :, b]; empty = ch <= 0
        if empty.any(): ch[empty] = np.interp(np.flatnonzero(empty), np.flatnonzero(~empty), ch[~empty])
    if left < -1: img = np.roll(img, width // 2, axis=1)       # -180..180 -> 0..360
    arr = np.clip(np.round(img), 0, 255).astype(np.uint8)
    Image.fromarray(arr[:, :, 0] if bands == 1 else arr[:, :, :3]).save(os.path.join(OUT, out), quality=quality, optimize=True)
    print(out, arr.shape, 'mean', arr.reshape(-1, bands).mean(axis=0))

MOLA16 = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img'
LOLA16 = PDS_LOLA + 'ldem_16.img'

def slope_map(world, url, dtype, unit, radius, out, width=4096, quality=90):
    """The ground's slope everywhere (16 px/deg elevation box-averaged to width x width/2),
    for relief shading from space. One greyscale JPEG twice as tall as wide: east slope in
    the top half, north slope in the bottom half, each stored as 127.5 + 127.5 sign(s)
    sqrt(min(|s|, 1)), so gentle slopes keep their precision. Greyscale, because JPEG
    compresses colour channels much more coarsely."""
    raw = urllib.request.urlopen(url, timeout=600).read()
    H = np.frombuffer(raw, dtype=dtype).reshape(2880, 5760).astype(np.float32) * unit
    h = np.asarray(Image.fromarray(H, mode='F').resize((width, width // 2), Image.BOX), dtype=np.float64)
    rows = width // 2
    lat = 90.0 - (np.arange(rows) + 0.5) * 180.0 / rows
    dx = 2 * np.pi * radius * np.maximum(np.cos(np.radians(lat)), 0.05)[:, None] / width
    dy = np.pi * radius / rows
    sE = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * dx)
    hn = np.vstack([h[:1], h, h[-1:]])
    sN = (hn[:-2] - hn[2:]) / (2 * dy)
    enc = lambda s: np.clip(np.round(127.5 + 127.5 * np.sign(s) * np.sqrt(np.minimum(np.abs(s), 1.0))), 0, 255).astype(np.uint8)
    Image.fromarray(np.vstack([enc(sE), enc(sN)])).save(os.path.join(OUT, out), quality=quality)
    print(out, 'p99 slope', float(np.percentile(np.abs(sE), 99)), f'{os.path.getsize(os.path.join(OUT, out)) / 1e6:.2f} MB')

JOBS = {
    'moon-dem': moon_dem,
    'landmarks': landmarks,
    'relief': lambda: (slope_map('mars', MOLA16, '>i2', 1.0, 3389500.0, 'mars_slopes_4096.jpg'),
                       slope_map('moon', LOLA16, '<i2', 0.5, 1737400.0, 'moon_slopes_4096.jpg')),
    'moon-albedo': lambda: global_map('Lunar_Clementine_UVVIS_750nm_Global_Mosaic_118m_v2.tif', 'moon_albedo_4096.jpg', width=4096),
    'mars-color': lambda: global_map('Mars_Viking_MDIM21_ClrMosaic_global_232m.tif', 'mars_color_4096.jpg', width=4096),
}
for job in (sys.argv[1:] or list(JOBS)):
    JOBS[job]()
