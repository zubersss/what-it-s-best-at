#!/usr/bin/env python3
"""The weather of one real day on Earth, for the game's clouds, rain and storms.

The day is 8 September 2017: three hurricanes at once in the Atlantic (Irma north of
Cuba at its strongest, Jose behind it, Katia in the Gulf of Mexico), typhoons forming in
the western Pacific, the monsoon over India, fronts round both poles. From NASA GIBS:

  earth_clouds_4096.jpg, _512   where cloud is (grey), from the day's VIIRS true-colour
                                mosaic, the clear Earth taken out (as scripts/fetch-earth.py)
  earth_rain_2048.jpg           rain that day (IMERG, all satellites merged): byte = 60 * log2(1 + mm an hour)
  earth_cloudtop_1024.jpg       how high the cloud tops stand (MODIS Terra and Aqua): byte = 16 * km; 0 = not seen
  earth_storms.json             the day's tropical cyclones, found in the rain map: where, how wide, how hard it rains

  python3 scripts/fetch-earth-weather.py     (needs gibs.earthdata.nasa.gov; pip install numpy pillow)
"""
import io, json, os, re, subprocess
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.environ.get('MAP_CACHE', '/root/mapcache/gibs')
DAY = '2017-09-08'
OUT = os.path.join(ROOT, 'public', 'data')


def get(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path) or os.path.getsize(path) < 2000:
        os.makedirs(CACHE, exist_ok=True)
        print('downloading', name, flush=True)
        subprocess.run(['curl', '-sS', '-f', '-m', '600', '--retry', '2', '-o', path, url], check=True)
    return open(path, 'rb').read()


def wms(layer, w, h, fmt, time=None, name=None):
    url = ('https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0'
           f'&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH={w}&HEIGHT={h}&STYLES=&LAYERS={layer}&FORMAT=image/{fmt}' + (f'&TIME={time}' if time else ''))
    return Image.open(io.BytesIO(get(url, name or f'{layer}_{time or "x"}_{w}.{fmt.replace("jpeg", "jpg")}')))


def colour_map(file_url, cache_name):
    xml = get(file_url, cache_name).decode()
    out = []
    for rgb, val in re.findall(r'<ColorMapEntry rgb="(\d+,\d+,\d+)"[^>]*? value="\[([^"\]\)]+)[\]\)]"', xml):
        lo, hi = val.split(',') if ',' in val else (val, val)
        lo = float(lo) if 'INF' not in lo else 0.0
        hi = float(hi) if 'INF' not in hi else lo * 1.2
        out.append((tuple(int(c) for c in rgb.split(',')), (lo + hi) / 2))
    return out


def values(im, cm):
    a = np.asarray(im.convert('RGBA')).astype(np.int32)
    cols = np.array([c for c, _ in cm], dtype=np.int32); vals = np.array([v for _, v in cm])
    rgb = a[..., :3].reshape(-1, 1, 3); idx = np.empty(rgb.shape[0], dtype=np.int64); dist = np.empty(rgb.shape[0])
    for s in range(0, rgb.shape[0], 20000):
        d = ((rgb[s:s + 20000] - cols[None]) ** 2).sum(-1); idx[s:s + 20000] = d.argmin(-1); dist[s:s + 20000] = d.min(-1)
    v = vals[idx].reshape(a.shape[:2])
    ok = (a[..., 3] > 128) & (dist.reshape(a.shape[:2]) < 1500)
    return v, ok


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def caps_colormap(layer):
    t = open(os.path.join(CACHE, 'caps.xml')).read() if os.path.exists(os.path.join(CACHE, 'caps.xml')) else get('https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml', 'caps.xml').decode()
    i = t.find('<ows:Identifier>' + layer + '</ows:Identifier>'); a = t.rfind('<Layer>', 0, i); b = t.find('</Layer>', i)
    return re.findall(r"xlink:href='(https://gibs.earthdata.nasa.gov/colormaps/v1.3/[^']+)'", t[a:b])[0]


def main():
    grey = lambda x: Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8))
    # --- cloud
    sky = np.asarray(wms('VIIRS_SNPP_CorrectedReflectance_TrueColor', 4096, 2048, 'jpeg', DAY).convert('RGB'), dtype=np.float32) / 255
    day = np.asarray(wms('BlueMarble_NextGeneration', 4096, 2048, 'jpeg').convert('RGB'), dtype=np.float32) / 255
    white = sky.min(axis=2) - 0.25 * (sky.max(axis=2) - sky.min(axis=2))
    cloud = smooth(white - 0.75 * day.min(axis=2), 0.16, 0.92)
    cloud = np.asarray(grey(cloud).filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255
    n = cloud.shape[1] * 6 // 360
    w = smooth(np.arange(n, dtype=np.float32), 0, n - 1)[None, :]
    left, right = cloud[:, :n].copy(), cloud[:, -n:][:, ::-1].copy(); mean = 0.5 * (left + right)
    cloud[:, :n] = mean + (left - mean) * w; cloud[:, -n:] = (mean + (right - mean) * w)[:, ::-1]
    # --- rain
    cm = colour_map(caps_colormap('IMERG_Precipitation_Rate'), 'cm_imerg.xml')
    rate, ok = values(wms('IMERG_Precipitation_Rate', 2048, 1024, 'png', DAY), cm)
    rate = np.where(ok, rate, 0.0)
    print('rain: mm/h max %.1f, raining on %.1f %% of the globe' % (rate.max(), 100 * (rate > 0.2).mean()))
    rain = np.clip(60 * np.log2(1 + rate), 0, 255) / 255
    # (where it rains hard there is cloud, whatever the picture's swath edges and glint did)
    big = np.asarray(grey(rain).resize((4096, 2048), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 255
    cloud = np.maximum(cloud, smooth(big, 0.12, 0.6) * 0.95)
    # --- cloud tops
    cm = colour_map(caps_colormap('MODIS_Terra_Cloud_Top_Height_Day'), 'cm_cth.xml')
    top = np.zeros((512, 1024)); seen = np.zeros((512, 1024), dtype=bool)
    for layer in ('MODIS_Terra_Cloud_Top_Height_Day', 'MODIS_Aqua_Cloud_Top_Height_Day'):
        v, ok = values(wms(layer, 1024, 512, 'png', DAY), cm)
        top = np.where(ok & (~seen | (v > top)), v, top); seen |= ok
    unit = 1000.0 if top.max() > 100 else 1.0                       # metres or kilometres in the colour map
    top = top / unit
    print('cloud tops: max %.1f km, seen on %.0f %% of the globe' % (top.max(), 100 * seen.mean()))
    # --- storms: the wettest wide patches over the tropical seas
    k = np.asarray(grey(np.clip(rate / 30, 0, 1)).filter(ImageFilter.GaussianBlur(4)), dtype=np.float32) / 255 * 30
    storms = []
    work = k.copy(); lat = 90 - (np.arange(1024) + 0.5) * 180 / 1024
    work[(np.abs(lat) < 7) | (np.abs(lat) > 38), :] = 0
    for _ in range(12):
        j, i = np.unravel_index(work.argmax(), work.shape)
        if work[j, i] < 3.0: break
        la, lo = 90 - (j + 0.5) * 180 / 1024, -180 + (i + 0.5) * 360 / 2048
        r = 14
        ys, xs = np.ogrid[-r:r + 1, -r:r + 1]
        patch = rate[max(0, j - r):j + r + 1, max(0, i - r):i + r + 1]
        storms.append({'lat': round(float(la), 2), 'lon': round(float(lo), 2), 'rain': round(float(work[j, i]), 1), 'peak': round(float(patch.max()), 1)})
        work[max(0, j - 40):j + 41, max(0, i - 40):i + 41] = 0
    # The three that had names, where the hurricane centre's advisories put them at midday
    # UTC, with their strongest steady wind (m/s); the others are taken for tropical
    # disturbances, their wind guessed from how hard it rains.
    named = [('Hurricane Irma', 21.7, -75.3, 69), ('Hurricane Jose', 16.3, -56.2, 67), ('Hurricane Katia', 21.3, -95.6, 44)]
    for s in storms:
        s['wind'] = round(min(30.0, 6 + 2.2 * s['rain']), 1)
        for name, la, lo, wind in named:
            if abs(s['lat'] - la) < 4 and abs(s['lon'] - lo) < 5: s['name'] = name; s['wind'] = wind
    for name, la, lo, wind in named:
        if not any(s.get('name') == name for s in storms): storms.append({'lat': la, 'lon': lo, 'rain': 6.0, 'peak': 12.0, 'wind': wind, 'name': name})
    for s in storms: print(s.get('name', '(unnamed)'), end=' ')
    print()
    for s in storms: print('  storm at %6.2f, %7.2f: %4.1f mm/h over its core, %5.1f at its worst' % (s['lat'], s['lon'], s['rain'], s['peak']))
    grey(cloud).save(os.path.join(OUT, 'earth_clouds_4096.jpg'), quality=82)
    grey(cloud).resize((512, 256), Image.LANCZOS).save(os.path.join(OUT, 'earth_clouds_512.jpg'), quality=85)
    grey(rain).save(os.path.join(OUT, 'earth_rain_2048.jpg'), quality=85)
    Image.fromarray(np.clip(top * 16, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'earth_cloudtop_1024.jpg'), quality=85)
    json.dump({'day': DAY, 'storms': storms}, open(os.path.join(OUT, 'earth_storms.json'), 'w'))
    for f in ('earth_clouds_4096.jpg', 'earth_rain_2048.jpg', 'earth_cloudtop_1024.jpg', 'earth_storms.json'): print(f, os.path.getsize(os.path.join(OUT, f)))


if __name__ == '__main__':
    main()
