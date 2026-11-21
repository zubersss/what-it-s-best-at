#!/usr/bin/env python3
"""Earth's mean yearly rainfall, for the rivers (milestone 10).

NASA GIBS serves MERRA-2's bias-corrected total precipitation month by month as a
coloured picture; its colour map (also from GIBS) says what value each colour stands
for. This fetches twelve months at 0.5 degrees, turns the colours back into numbers,
averages them and writes public/data/earth_rain_720.u8: 720 x 360 bytes, the first row
at the north pole, the first column at longitude -180, byte = 3.2 * sqrt(mm a year)
(so 0..255 covers 0..6350 mm).

  python3 scripts/fetch-earth-climate.py        (needs gibs.earthdata.nasa.gov; pip install numpy pillow)
"""
import io, os, re, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.environ.get('MAP_CACHE', '/root/mapcache/gibs')
LAYER = 'MERRA2_Precipitation_Bias_Corrected_Monthly'
W, H = 720, 360
YEAR = 2023


def get(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(['curl', '-sS', '-f', '-m', '120', '--retry', '2', '-o', path, url], check=True)
    return open(path, 'rb').read()


def colour_map():
    xml = get(f'https://gibs.earthdata.nasa.gov/colormaps/v1.3/{LAYER}.xml', 'precip_cm.xml').decode()
    out = []
    for rgb, val in re.findall(r'<ColorMapEntry rgb="(\d+,\d+,\d+)"[^>]*? value="\[([^"\]\)]+)[\]\)]"', xml):
        lo, hi = val.split(',')
        lo = 0.0 if 'INF' in lo else float(lo)
        hi = lo * 1.3 if 'INF' in hi else float(hi)
        out.append((tuple(int(c) for c in rgb.split(',')), (max(lo, 0) + max(hi, 0)) / 2))
    return out


def main():
    cm = colour_map()
    cols = np.array([c for c, _ in cm], dtype=np.int32)
    vals = np.array([v for _, v in cm], dtype=np.float64)          # kg per m2 per s = mm per s
    total = np.zeros((H, W)); count = np.zeros((H, W))
    for month in range(1, 13):
        url = ('https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0'
               f'&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH={W}&HEIGHT={H}&STYLES=&LAYERS={LAYER}&FORMAT=image/png&TIME={YEAR}-{month:02d}-01')
        im = np.asarray(Image.open(io.BytesIO(get(url, f'precip_{YEAR}_{month:02d}.png'))).convert('RGBA')).astype(np.int32)
        rgb = im[..., :3].reshape(-1, 1, 3)
        idx = np.empty(rgb.shape[0], dtype=np.int64)
        for a in range(0, rgb.shape[0], 20000):                      # nearest colour of the map
            idx[a:a + 20000] = ((rgb[a:a + 20000] - cols[None]) ** 2).sum(-1).argmin(-1)
        v = vals[idx].reshape(H, W)
        ok = im[..., 3] > 128
        total += np.where(ok, v, 0); count += ok
    rate = total / np.maximum(count, 1)                               # mm per second, the year's mean
    mm = rate * 86400 * 365.25
    print('mm a year: mean %.0f, max %.0f; no data in %d cells' % (mm.mean(), mm.max(), int((count == 0).sum())))
    for name, la, lo in [('Sahara', 23, 12), ('Amazon', -3, -62), ('Grand Canyon', 36.1, -112.1), ('Rockies (Colorado headwaters)', 39.5, -106), ('Namib', -24.7, 15.3), ('Alps', 46, 7.7), ('Hawaii', 19.8, -155.5), ('Cherrapunji', 25.3, 91.7)]:
        print('  %-30s %5.0f mm' % (name, mm[int((90 - la) * 2), int((lo + 180) * 2)]))
    out = np.clip(np.round(3.2 * np.sqrt(mm)), 0, 255).astype(np.uint8)
    path = os.path.join(ROOT, 'public', 'data', 'earth_rain_720.u8')
    out.tofile(path)
    print('wrote', path, out.nbytes, 'bytes')


if __name__ == '__main__':
    main()
