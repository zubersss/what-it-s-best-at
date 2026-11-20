#!/usr/bin/env python3
"""Earth's elevation for the game, from the open "Terrain Tiles" set on AWS (Mapzen's
terrarium tiles: SRTM, GMTED, ETOPO1, GEBCO and others merged; see docs/ASSETS.md for
the attribution). Tiles are cached in .cache/terrain-tiles.

    pip install numpy pillow
    python3 scripts/fetch-earth-terrain.py [global] [slopes] [sites]        (default: all)

Writes into public/data/:
    earth_dem_4ppd.i16      the whole Earth, 1440 x 720, metres (sea floor below 0)
    earth_slopes_4096.jpg   the land's slope everywhere (as the other worlds' slope maps)
    earth_dem_<site>.i16    sharper windows at the places the game opens on
All simple cylindrical, longitude 0..360 E from the left edge, latitude +90 at the top.
"""
import io, os, ssl, sys, math, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'data')
CACHE = os.path.join(HERE, '..', '.cache', 'terrain-tiles')
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt') if os.path.exists('/root/.ccr/ca-bundle.crt') else None

def tile(z, x, y):
    """One 256 x 256 tile as metres (float32)."""
    path = os.path.join(CACHE, str(z), str(x), f'{y}.png')
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(URL.format(z=z, x=x, y=y), timeout=60, context=CTX).read()
                break
            except Exception as e:
                if attempt == 3: raise
        with open(path, 'wb') as f: f.write(data)
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)
    return a[:, :, 0] * 256.0 + a[:, :, 1] + a[:, :, 2] / 256.0 - 32768.0

def mosaic(z, x0, x1, y0, y1):
    """Tiles x0..x1, y0..y1 (inclusive) of zoom z as one array."""
    n = 1 << z
    jobs = [(x % n, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    with ThreadPoolExecutor(16) as pool: tiles = list(pool.map(lambda j: tile(z, j[0], j[1]), jobs))
    w = x1 - x0 + 1
    rows = [np.hstack(tiles[r * w:(r + 1) * w]) for r in range(y1 - y0 + 1)]
    return np.vstack(rows)

def merc_y(lat, z):
    """Pixel row (float) of a latitude in the zoom-z world mosaic (256 * 2^z rows)."""
    s = np.sin(np.radians(np.clip(lat, -85.0511, 85.0511)))
    return (0.5 - np.log((1 + s) / (1 - s)) / (4 * np.pi)) * 256 * (1 << z)

def cylindrical(z, lon0, lon1, lat0, lat1, width, height):
    """A window (longitudes east, -180..180 or 0..360 given as lon0 < lon1; lat0 the north
    edge) resampled from Web-Mercator tiles to simple cylindrical, width x height, by area
    averaging in x and in y."""
    n = 256 * (1 << z)
    px0, px1 = (lon0 + 180.0) / 360.0 * n, (lon1 + 180.0) / 360.0 * n
    py0, py1 = float(merc_y(lat0, z)), float(merc_y(lat1, z))
    tx0, tx1, ty0, ty1 = int(math.floor(px0 / 256)), int(math.floor((px1 - 1e-6) / 256)), max(0, int(math.floor(py0 / 256))), min((1 << z) - 1, int(math.floor((py1 - 1e-6) / 256)))
    m = mosaic(z, tx0, tx1, ty0, ty1)
    ox, oy = tx0 * 256, ty0 * 256
    # rows: each output row covers a band of latitude -> a band of mercator rows
    lats = lat0 + (lat1 - lat0) * (np.arange(height + 1) / height)
    ys = np.clip(merc_y(lats, z) - oy, 0, m.shape[0])
    c = np.vstack([np.zeros((1, m.shape[1]), np.float64), np.cumsum(m.astype(np.float64), axis=0)])
    def rows_between(a, b):
        b = np.maximum(b, a + 1e-3)
        ia, ib = np.minimum(a.astype(int), m.shape[0] - 1), np.minimum(b.astype(int), m.shape[0] - 1)
        top = c[ia] + (a - ia)[:, None] * m[ia]; bot = c[ib] + (b - ib)[:, None] * m[ib]
        return (bot - top) / (b - a)[:, None]
    r = rows_between(ys[:-1], ys[1:])
    xs = np.clip(px0 - ox + (px1 - px0) * (np.arange(width + 1) / width), 0, m.shape[1])
    cx = np.hstack([np.zeros((height, 1)), np.cumsum(r, axis=1)])
    a, b = xs[:-1], np.maximum(xs[1:], xs[:-1] + 1e-3)
    ia, ib = np.minimum(a.astype(int), m.shape[1] - 1), np.minimum(b.astype(int), m.shape[1] - 1)
    left = cx[:, ia] + (a - ia)[None, :] * r[:, ia]; right = cx[:, ib] + (b - ib)[None, :] * r[:, ib]
    return ((right - left) / (b - a)[None, :]).astype(np.float32)

def whole(z, width):
    a = cylindrical(z, -180.0, 180.0, 90.0, -90.0, width, width // 2)
    return np.roll(a, width // 2, axis=1)                      # -180..180 -> 0..360

def global_dem():
    h = whole(4, 1440)
    np.round(h).astype('<i2').tofile(os.path.join(OUT, 'earth_dem_4ppd.i16'))
    print('earth_dem_4ppd.i16 metres', float(h.min()), float(h.max()), 'land share', float((h > 0).mean()))

def slopes(width=4096):
    h = np.maximum(whole(5, width).astype(np.float64), 0.0)    # the sea is flat
    rows, R = width // 2, 6371000.0
    lat = 90.0 - (np.arange(rows) + 0.5) * 180.0 / rows
    dx = 2 * np.pi * R * np.maximum(np.cos(np.radians(lat)), 0.05)[:, None] / width
    dy = np.pi * R / rows
    sE = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * dx)
    hn = np.vstack([h[:1], h, h[-1:]])
    sN = (hn[:-2] - hn[2:]) / (2 * dy)
    enc = lambda s: np.clip(np.round(127.5 + 127.5 * np.sign(s) * np.sqrt(np.minimum(np.abs(s), 1.0))), 0, 255).astype(np.uint8)
    Image.fromarray(np.vstack([enc(sE), enc(sN)])).save(os.path.join(OUT, 'earth_slopes_4096.jpg'), quality=88)
    print('earth_slopes_4096.jpg p99 slope', float(np.percentile(np.abs(sE), 99)), f"{os.path.getsize(os.path.join(OUT, 'earth_slopes_4096.jpg')) / 1e6:.2f} MB")

def site(name, z, lon0, lon1, lat0, lat1, ppd):
    """A window at ppd pixels per degree (longitudes -180..180)."""
    w, h = int(round((lon1 - lon0) * ppd)), int(round((lat0 - lat1) * ppd))
    a = cylindrical(z, lon0, lon1, lat0, lat1, w, h)
    np.round(a).astype('<i2').tofile(os.path.join(OUT, f'earth_dem_{name}.i16'))
    e0, e1 = lon0 % 360, lon0 % 360 + (lon1 - lon0)
    print(f"{{ url: 'data/earth_dem_{name}.i16', width: {w}, height: {h}, lon0: {e0:.4f}, lon1: {e1:.4f}, lat0: {lat0}, lat1: {lat1}, feather: 0.1 }},   // {a.min():.0f} .. {a.max():.0f} m, {111320 / ppd:.0f} m per pixel north-south")

def sites():
    site('grandcanyon', 11, -112.45, -111.75, 36.40, 35.90, 1200)      # Grand Canyon: the South Rim, Bright Angel, the river
    site('everest', 11, 86.55, 87.30, 28.25, 27.70, 1200)              # Everest, Lhotse, the Khumbu
    site('hawaii', 10, -156.20, -154.70, 20.35, 18.85, 600)            # Mauna Kea and Mauna Loa
    site('namib', 11, 15.10, 15.90, -24.45, -25.05, 1200)              # the great dunes of Sossusvlei
    site('alps', 11, 7.45, 8.05, 46.15, 45.80, 1200)                   # the Matterhorn and Monte Rosa

JOBS = {'global': global_dem, 'slopes': slopes, 'sites': sites}
if __name__ == '__main__':
    for job in (sys.argv[1:] or list(JOBS)): JOBS[job]()
