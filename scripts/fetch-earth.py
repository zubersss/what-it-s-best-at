#!/usr/bin/env python3
"""Earth's maps for the game, from NASA GIBS (public domain; see docs/ASSETS.md).

  python3 scripts/fetch-earth.py [--cache DIR] [--out public/data]      (needs: pip install numpy pillow; curl)

Writes, as equirectangular maps (longitude -180..180 left to right, north at the top):
  earth_day_4096.jpg      the day side's colour: Blue Marble Next Generation (no clouds)
  earth_clouds_4096.jpg   clouds of a real day (2016-09-22), from a VIIRS true-colour mosaic (grey)
  earth_lights_2048.jpg   city lights, from the Black Marble 2016 (grey)
  earth_water_2048.jpg    water, from the MODIS water mask, for the oceans' glint (grey)
  earth_*_512.jpg         small copies of the four, always loaded (Earth far away)
"""
import argparse, os, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter

WMS = ('https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0'
       '&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048&STYLES=')
LAYERS = {
    'day.jpg': 'LAYERS=BlueMarble_NextGeneration&FORMAT=image/jpeg',
    'night.jpg': 'LAYERS=VIIRS_Black_Marble&FORMAT=image/jpeg',
    'water.png': 'LAYERS=MODIS_Water_Mask&FORMAT=image/png',
    'clouds.jpg': 'LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&FORMAT=image/jpeg&TIME=2016-09-22',
}

def fetch(cache):
    os.makedirs(cache, exist_ok=True)
    for name, q in LAYERS.items():
        path = os.path.join(cache, name)
        if os.path.exists(path) and os.path.getsize(path) > 50000: continue
        print('downloading', name, flush=True)
        subprocess.run(['curl', '-sS', '--fail', '--max-time', '600', '-o', path, WMS + '&' + q], check=True)

def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default='/tmp/earth-maps'); ap.add_argument('--out', default='public/data')
    a = ap.parse_args()
    fetch(a.cache)
    load = lambda n: np.asarray(Image.open(os.path.join(a.cache, n)).convert('RGB'), dtype=np.float32) / 255
    day, night, water, sky = load('day.jpg'), load('night.jpg'), load('water.png'), load('clouds.jpg')

    # Clouds: what is bright and white in the real day's picture and is not so in the clear
    # one (deserts and ice are bright too; over ice nothing is added: white on white).
    white = sky.min(axis=2) - 0.25 * (sky.max(axis=2) - sky.min(axis=2))
    clear = day.min(axis=2)
    cloud = smooth(white - 0.75 * clear, 0.30, 0.80)
    # (the satellite's strips leave grey streaks of sun-glint on the sea: below the threshold
    # mostly, and softened here; nothing was recorded in the polar night: no cloud there)
    cloud = np.asarray(Image.fromarray((cloud * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255

    # City lights: warm and bright on the Black Marble's dim blue ground.
    r, g, b = night[..., 0], night[..., 1], night[..., 2]
    lights = np.clip((r - 0.95 * b - 0.02) / 0.45, 0, 1) + np.clip(((r + g + b) / 3 - 0.45) / 0.5, 0, 1)
    lights = np.clip(lights, 0, 1) ** 0.8

    wat = (water[..., 2] > 0.5).astype(np.float32)
    wat = np.asarray(Image.fromarray((wat * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), dtype=np.float32) / 255

    # (each map is its own grey picture: packed into the three colours of one, the picture
    # format leaked the clouds' detail into the city lights as a blocky glow)
    os.makedirs(a.out, exist_ok=True)
    grey = lambda x: Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8), 'L')
    day_im = Image.fromarray((day * 255).astype(np.uint8))
    out = {
        'earth_day_4096.jpg': (day_im, dict(quality=88, subsampling=1)),
        'earth_clouds_4096.jpg': (grey(cloud), dict(quality=82)),
        'earth_lights_2048.jpg': (grey(lights).resize((2048, 1024), Image.LANCZOS), dict(quality=90)),
        'earth_water_2048.jpg': (grey(wat).resize((2048, 1024), Image.LANCZOS), dict(quality=85)),
        'earth_day_512.jpg': (day_im.resize((512, 256), Image.LANCZOS), dict(quality=88)),
        'earth_clouds_512.jpg': (grey(cloud).resize((512, 256), Image.LANCZOS), dict(quality=85)),
        'earth_lights_512.jpg': (grey(lights).resize((512, 256), Image.BOX), dict(quality=90)),
        'earth_water_512.jpg': (grey(wat).resize((512, 256), Image.LANCZOS), dict(quality=85)),
    }
    for n, (im, kw) in out.items():
        im.save(os.path.join(a.out, n), optimize=True, **kw)
        print(n, os.path.getsize(os.path.join(a.out, n)) // 1024, 'kB')
    print('mean cloud cover %.2f, lit share %.4f, water %.2f' % (cloud.mean(), (lights > 0.2).mean(), wat.mean()))

if __name__ == '__main__':
    sys.exit(main())
