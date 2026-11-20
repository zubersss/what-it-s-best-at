#!/usr/bin/env python3
"""Fit the catalogue's orbits and rotations (src/worlds/solarSystem.js) to JPL Horizons.

    python3 scripts/fit-orbits.py                 # every body: download (cached), fit, print JS, write the check data
    python3 scripts/fit-orbits.py io titan        # only these (the check data is then not rewritten)
    python3 scripts/fit-orbits.py --physical      # also print Horizons' own radius / GM / albedo lines
    python3 scripts/fit-orbits.py --refit-existing moon phobos   # what the same fit would give for bodies
                                                  # that were in the catalogue before (printed, not used)

What it does, per body:
  1. asks Horizons for osculating elements and position vectors (ICRF, relative to the
     parent's centre) at 600 random dates in 1950..2100. Random dates, because a regular
     grid aliases with the short periods of the inner moons;
  2. turns the elements into a first guess (mean motion, apse and node rates by a
     frequency scan, so nothing has to be unwrapped across the gaps), then refines the
     catalogue's own model (an ellipse whose six elements change linearly with time, see
     orbitPosition() in src/core/ephemeris.js) against the position vectors by least
     squares, and finally leans on the worst dates to lower the largest error.
     For moons the plane's pole (`framePole`) is fitted too: it is the axis the orbit's
     normal turns about (the Laplace plane's pole); and the ellipse's shape is fitted
     before its timing, so that a moon the model cannot follow in longitude (Mimas)
     still gets its true mean ellipse (see fit_orbit);
  3. asks Horizons for the pole and the sub-solar point seen from the Sun's centre at
     random dates in 2000..2040 and checks the IAU rotation constants against them, or
     fits linear ones where the IAU model has periodic terms the evaluator lacks;
  4. writes scripts/data/horizons-check.json: Horizons positions at 240 OTHER random
     dates and 12 sub-solar points per body, for scripts/check-ephemeris.mjs (which uses
     the game's own code and needs no network).

Every Horizons reply is cached in .cache/horizons/ (git-ignored) and never asked twice.
Needs numpy. Times are TDB/TT Julian days (the game's `jd` is TT; the difference is 2 ms).
"""
import hashlib
import json
import math
import os
import ssl
import sys
import time
import urllib.request
import uuid

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache', 'horizons')
OUT = os.path.join(ROOT, 'scripts', 'data', 'horizons-check.json')
API = 'https://ssd.jpl.nasa.gov/api/horizons_file.api'
CA_BUNDLE = '/root/.ccr/ca-bundle.crt'            # the cloud machine's proxy; ignored where absent

J2000 = 2451545.0
JD_1950, JD_2100 = 2433282.5, 2488069.5
JD_1990, JD_2060 = 2447892.5, 2473459.5
JD_2040 = 2466154.5
OBLIQUITY = 23.43928                               # as in src/core/ephemeris.js
AU = 149597870700.0
DEG = math.pi / 180
N_FIT, N_CHECK, N_ROT_CHECK, N_ROT_FIT = 600, 240, 12, 60

# id: (Horizons id, parent)
BODIES = {
    'mercury': ('199', 'sun'), 'venus': ('299', 'sun'), 'earth': ('399', 'sun'), 'moon': ('301', 'earth'),
    'mars': ('499', 'sun'), 'phobos': ('401', 'mars'), 'deimos': ('402', 'mars'),
    'ceres': ('1;', 'sun'),
    'jupiter': ('599', 'sun'), 'io': ('501', 'jupiter'), 'europa': ('502', 'jupiter'),
    'ganymede': ('503', 'jupiter'), 'callisto': ('504', 'jupiter'),
    'saturn': ('699', 'sun'), 'mimas': ('601', 'saturn'), 'enceladus': ('602', 'saturn'),
    'tethys': ('603', 'saturn'), 'dione': ('604', 'saturn'), 'rhea': ('605', 'saturn'),
    'titan': ('606', 'saturn'), 'iapetus': ('608', 'saturn'),
    'uranus': ('799', 'sun'),
    'neptune': ('899', 'sun'), 'triton': ('801', 'neptune'),
    # Pluto's own centre (999), not the system barycentre (9): Charon is then simply
    # relative to Pluto. The 2100 km wobble of Pluto about the barycentre (6.39 days) is
    # 0.00002 deg seen from the Sun and is left out of the ellipse.
    'pluto': ('999', 'sun'), 'charon': ('901', 'pluto'),
}
# In the catalogue before this script existed: downloaded for the check, not refitted
# (--refit-existing prints what the fit would give).
EXISTING = ('earth', 'moon', 'mars', 'phobos', 'deimos')
CENTRE = {'sun': '500@10'}
CENTRE.update({k: '500@' + v[0] for k, v in BODIES.items()})

# IAU WGCCRE 2015 report (Archinal et al. 2018), linear terms only:
#   ra: [a0, per century], dec: [d0, per century], w: [W0, deg per day]
# None = the IAU model is not linear (periodic terms too large to drop): fitted below.
# Nothing here is trusted as typed: fit_rotation() compares each with Horizons and
# replaces it by a fit if it is more than ROT_TOLERANCE off (Ceres: Horizons uses the
# Dawn mission's later model).
IAU = {
    'mercury': ((281.0103, -0.0328), (61.4155, -0.0049), (329.5988, 6.1385108)),
    'venus': ((272.76, 0.0), (67.16, 0.0), (160.20, -1.4813688)),
    'jupiter': ((268.056595, -0.006499), (64.495303, 0.002413), (284.95, 870.5360000)),
    'saturn': ((40.589, -0.036), (83.537, -0.004), (38.90, 810.7939024)),
    'uranus': ((257.311, 0.0), (-15.175, 0.0), (203.81, -501.1600928)),
    'neptune': None,                                 # 0.70 sin N, 0.51 cos N, 0.48 sin N
    'pluto': ((132.993, 0.0), (-6.163, 0.0), (302.695, 56.3625225)),
    'ceres': ((291.418, 0.0), (66.764, 0.0), (170.650, 952.1532)),
    'io': ((268.05, -0.009), (64.50, 0.003), (200.39, 203.4889538)),
    'europa': ((268.08, -0.009), (64.51, 0.003), (36.022, 101.3747235)),
    'ganymede': ((268.20, -0.009), (64.57, 0.003), (44.064, 50.3176081)),
    'callisto': ((268.72, -0.009), (64.83, 0.003), (259.51, 21.5710715)),
    'mimas': ((40.66, -0.036), (83.52, -0.004), (333.46, 381.9945550)),
    'enceladus': ((40.66, -0.036), (83.52, -0.004), (6.32, 262.7318996)),
    'tethys': ((40.66, -0.036), (83.52, -0.004), (8.95, 190.6979085)),
    'dione': ((40.66, -0.036), (83.52, -0.004), (357.6, 131.5349316)),
    'rhea': ((40.38, -0.036), (83.55, -0.004), (235.16, 79.6900478)),
    'titan': ((39.4827, 0.0), (83.4279, 0.0), (186.5855, 22.5769768)),
    'iapetus': ((318.16, -3.949), (75.03, -1.143), (355.2, 4.5379572)),
    'triton': None,                                  # the pole swings round in 688 years
    'charon': ((132.993, 0.0), (-6.163, 0.0), (122.695, 56.3625225)),
}
ROT_TOLERANCE = 0.5      # deg: an IAU linear model further than this from Horizons is replaced by a fit

# Moons whose IAU model has large periodic terms with SHORT periods (the pole circling
# with the orbit plane in 1 and 5 years, and the 70-year libration): a straight line
# through 2000..2040 would mean nothing outside it, so the IAU mean terms are kept and
# the error is reported.
KEEP_IAU_MEAN = ('mimas', 'tethys')

# Bodies whose error may be this many times larger outside 1990..2060 than inside it
# (Jupiter: the ellipse cannot follow Saturn's pull to 0.1 deg over 150 years, but can over 70).
OUTSIDE_WINDOW = {'jupiter': 1.3}

# Moons whose own eccentricity is negligible but whose mean longitude swings slowly (a
# libration the evaluator has no term for): the ellipse's apse is made to stand in for
# the swing. Costs a distance error of e (1.8 % for Tethys); see fit_orbit().
APSE_FOR_LIBRATION = ('tethys',)


# ----------------------------------------------------------------------------- Horizons
_last_fetch = [0.0]


def horizons(lines):
    """One Horizons request (POST of an input file, so long date lists fit); cached."""
    body = '!$$SOF\n' + '\n'.join(lines) + '\n'
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha1(body.encode()).hexdigest() + '.txt')
    if os.path.exists(path):
        with open(path) as f:
            return f.read()
    wait = 1.0 - (time.time() - _last_fetch[0])
    if wait > 0:
        time.sleep(wait)                                    # one at a time, politely
    bd = uuid.uuid4().hex
    data = ('--%s\r\nContent-Disposition: form-data; name="format"\r\n\r\ntext\r\n'
            '--%s\r\nContent-Disposition: form-data; name="input"; filename="input.txt"\r\n'
            'Content-Type: text/plain\r\n\r\n%s\r\n--%s--\r\n' % (bd, bd, body, bd)).encode()
    req = urllib.request.Request(API, data=data, headers={'Content-Type': 'multipart/form-data; boundary=' + bd})
    ctx = ssl.create_default_context(cafile=CA_BUNDLE if os.path.exists(CA_BUNDLE) else None)
    text = None
    for attempt in range(4):
        try:
            text = urllib.request.urlopen(req, context=ctx, timeout=300).read().decode()
            break
        except Exception as err:                            # noqa: BLE001 (network: retry, then fail loudly)
            sys.stderr.write('  Horizons request failed (%s), retrying\n' % err)
            time.sleep(5 * (attempt + 1))
    _last_fetch[0] = time.time()
    if text is None:
        raise SystemExit('Horizons could not be reached')
    if '$$SOE' not in text and "OBJ_DATA='YES'" not in body:
        raise SystemExit('Horizons returned no table for:\n' + body[:600] + '\n---\n' + text[-1500:])
    with open(path, 'w') as f:
        f.write(text)
    return text


def table(text, expect=None):
    rows = [[c.strip() for c in ln.split(',')] for ln in text[text.index('$$SOE') + 5:text.index('$$EOE')].strip().split('\n')]
    if expect is not None and len(rows) != expect:
        raise SystemExit('Horizons returned %d rows, expected %d' % (len(rows), expect))
    return rows


def tlist(jds):
    return ['TLIST_TYPE=\'JD\'', 'TLIST='] + ["'%.4f'" % j for j in jds]


def vectors(bid, jds):
    """Position of the body relative to its parent's centre, ICRF, metres, at TDB dates."""
    hid, parent = BODIES[bid]
    rows = table(horizons(["COMMAND='%s'" % hid, "OBJ_DATA='NO'", "MAKE_EPHEM='YES'", "EPHEM_TYPE='VECTORS'",
                           "CENTER='%s'" % CENTRE[parent], "REF_PLANE='FRAME'", "VEC_TABLE='1'", "CSV_FORMAT='YES'"] + tlist(jds)), len(jds))
    t = np.array([float(r[0]) for r in rows])
    if np.max(np.abs(t - jds)) > 1e-6:
        raise SystemExit('Horizons dates differ from the ones asked for (%s)' % bid)
    return np.array([[float(r[2]), float(r[3]), float(r[4])] for r in rows]) * 1000.0


def elements(bid, jds):
    """Osculating elements about the parent's centre, ICRF equator and equinox."""
    hid, parent = BODIES[bid]
    rows = table(horizons(["COMMAND='%s'" % hid, "OBJ_DATA='NO'", "MAKE_EPHEM='YES'", "EPHEM_TYPE='ELEMENTS'",
                           "CENTER='%s'" % CENTRE[parent], "REF_PLANE='FRAME'", "CSV_FORMAT='YES'"] + tlist(jds)), len(jds))
    col = lambda k: np.array([float(r[k]) for r in rows])   # noqa: E731
    return {'e': col(2), 'i': col(4), 'node': col(5), 'argp': col(6), 'n': col(8) * 86400.0, 'M': col(9), 'a': col(11) * 1000.0}


def observer(bid, jds):
    """Seen from the Sun's centre at TT dates: where the body is, its pole, the sub-solar point."""
    text = horizons(["COMMAND='%s'" % BODIES[bid][0], "OBJ_DATA='NO'", "MAKE_EPHEM='YES'", "EPHEM_TYPE='OBSERVER'",
                     "CENTER='500@10'", "TIME_TYPE='TT'", "CAL_FORMAT='JD'", "QUANTITIES='1,14,21,32'", "ANG_FORMAT='DEG'",
                     "EXTRA_PREC='YES'", "CSV_FORMAT='YES'"] + tlist(jds))
    rows = table(text, len(jds))
    head = text[:text.index('$$SOE')]
    conv = [ln for ln in head.split('\n') if ln.startswith('Target pole/equ')][0]
    radii = [ln for ln in head.split('\n') if ln.startswith('Target radii')][0]
    if 'West-longitude positive' in conv:
        west = True
    elif 'East-longitude positive' in conv:
        west = False
    else:
        raise SystemExit('No longitude convention in the Horizons header for ' + bid + ': ' + conv)
    abc = [float(x) for x in radii.split(':')[1].split('km')[0].split(',')]
    if any(r[5] == 'n.a.' for r in rows):
        raise SystemExit('Horizons has no rotation model for ' + bid)
    col = lambda k: np.array([float(r[k]) for r in rows])   # noqa: E731
    return {'jd': col(0), 'ra': col(3), 'dec': col(4), 'lon': col(5), 'lat': col(6), 'lt': col(-4) / 1440.0,
            'poleRa': col(-3), 'poleDec': col(-2), 'west': west, 'radii': abc, 'model': conv.split(':')[1].split('{')[0].strip()}


def physical(bid):
    text = horizons(["COMMAND='%s'" % BODIES[bid][0], "OBJ_DATA='YES'", "MAKE_EPHEM='NO'"])
    keys = ('radius', 'Radius', 'GM', 'lbedo', 'g_', 'gravity', 'Gravity')
    return [ln.rstrip() for ln in text.split('\n') if any(k in ln for k in keys)]


# ----------------------------------------------------------------------------- the game's model, in numpy
def pole_frame(ra, dec):
    """poleFrame() of ephemeris.js: rows X, Y, Z in ICRF."""
    ra, dec = ra * DEG, dec * DEG
    Z = np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])
    X = np.array([-math.sin(ra), math.cos(ra), 0.0])
    return np.array([X, np.cross(Z, X), Z])


ECLIPTIC_POLE = (270.0, 90.0 - OBLIQUITY)        # pole_frame() of this is exactly the game's ecliptic rotation

# parameter vector: framePole ra, dec, then value and rate per century of a, e, i, L, lonPeri, node
P_RA, P_DEC, P_A, P_A1, P_E, P_E1, P_I, P_I1, P_L, P_L1, P_LP, P_LP1, P_ND, P_ND1 = range(14)


def model_icrf(p, T):
    """orbitPosition() + the frame rotation of positionICRF(); T in Julian centuries from the epoch."""
    a = p[P_A] + p[P_A1] * T
    e = p[P_E] + p[P_E1] * T
    inc = (p[P_I] + p[P_I1] * T) * DEG
    L = (p[P_L] + p[P_L1] * T) * DEG
    lp = (p[P_LP] + p[P_LP1] * T) * DEG
    node = (p[P_ND] + p[P_ND1] * T) * DEG
    w = lp - node
    M = np.mod(L - lp + math.pi, 2 * math.pi) - math.pi
    E = M + e * np.sin(M)
    for _ in range(12):
        E = E - (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
    xp, yp = a * (np.cos(E) - e), a * np.sqrt(1 - e * e) * np.sin(E)
    cw, sw, cn, sn, ci, si = np.cos(w), np.sin(w), np.cos(node), np.sin(node), np.cos(inc), np.sin(inc)
    x = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp
    y = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp
    z = (sw * si) * xp + (cw * si) * yp
    return np.stack([x, y, z], axis=1) @ pole_frame(p[P_RA], p[P_DEC])


def errors(model, truth):
    """Angle between the two directions (deg) and the distance error (%), per date."""
    rm, rt = np.linalg.norm(model, axis=1), np.linalg.norm(truth, axis=1)
    cross = np.linalg.norm(np.cross(model, truth), axis=1)
    return np.degrees(np.arctan2(cross, np.sum(model * truth, axis=1))), 100 * (rm / rt - 1)


# ----------------------------------------------------------------------------- fitting
def scan_rate(z, t, lo, hi, step):
    """The rate r (deg/day) that makes z * exp(-i r t) add up best; and that sum's mean."""
    best = (-1.0, 0.0)
    rates = np.arange(lo, hi + step, step)
    for k in range(0, len(rates), 2000):
        r = rates[k:k + 2000]
        amp = np.abs(np.exp(-1j * DEG * np.outer(r, t)) @ z)
        j = int(np.argmax(amp))
        if amp[j] > best[0]:
            best = (amp[j], r[j])
    rate = best[1]
    for _ in range(3):                               # polish: straight line through what is left of the phase
        mean = np.mean(z * np.exp(-1j * DEG * rate * t))
        res = np.angle(z * np.exp(-1j * DEG * rate * t) / mean) / DEG
        wgt = np.abs(z)
        A = np.stack([np.ones_like(t), t], axis=1) * wgt[:, None]
        c = np.linalg.lstsq(A, res * wgt, rcond=None)[0]
        if abs(c[1]) > step:                         # the residual wrapped: the scan's answer stands
            break
        rate += c[1]
    mean = np.mean(z * np.exp(-1j * DEG * rate * t))
    return rate, mean


def first_guess(el, t_days, F, moon):
    """Elements in the frame F from Horizons' osculating elements (which are in ICRF)."""
    i, O, w = el['i'] * DEG, el['node'] * DEG, el['argp'] * DEG
    n = np.stack([np.sin(i) * np.sin(O), -np.sin(i) * np.cos(O), np.cos(i)], axis=1)
    N = np.stack([np.cos(O), np.sin(O), np.zeros_like(O)], axis=1)
    peri = np.cos(w)[:, None] * N + np.sin(w)[:, None] * np.cross(n, N)
    nf, pf = n @ F.T, peri @ F.T
    node = np.arctan2(nf[:, 0], -nf[:, 1])
    Nf = np.stack([np.cos(node), np.sin(node), np.zeros_like(node)], axis=1)
    argp = np.arctan2(np.sum(pf * np.cross(nf, Nf), axis=1), np.sum(pf * Nf, axis=1))
    lp = node + argp
    L = lp + el['M'] * DEG
    span = t_days.max() - t_days.min()
    fine = 0.05 * 360 / span
    n0 = float(np.median(el['n']))
    nL, mL = scan_rate(np.exp(1j * L), t_days, n0 * 0.98, n0 * 1.02, fine)
    lim = 1.5 if moon else 0.001                     # deg/day: apse and node rates searched within this
    nP, mP = scan_rate(el['e'] * np.exp(1j * lp), t_days, -lim, lim, fine)
    nN, mN = scan_rate(np.sqrt(np.maximum(0, 1 - nf[:, 2] ** 2)) * np.exp(1j * node), t_days, -lim, lim, fine)
    p = np.zeros(14)
    p[P_A] = float(np.median(el['a']))
    p[P_E], p[P_LP], p[P_LP1] = abs(mP), np.angle(mP) / DEG, nP * 36525
    p[P_I], p[P_ND], p[P_ND1] = math.degrees(math.asin(min(1.0, abs(mN)))), np.angle(mN) / DEG, nN * 36525
    p[P_L], p[P_L1] = np.angle(mL) / DEG, nL * 36525
    return p


STEP = np.array([1e-4, 1e-4, 1e-7, 1e-7, 1e-7, 1e-7, 1e-5, 1e-5, 1e-5, 1e-5, 1e-5, 1e-5, 1e-5, 1e-5])


def levenberg(f, p, free, iters=80):
    """Levenberg-Marquardt on the residual vector f(p), moving only the `free` parameters."""
    idx = np.flatnonzero(free)
    step = STEP.copy()
    step[P_A] = step[P_A1] = 1e-7 * p[P_A]
    r = f(p)
    cost, lam = r @ r, 1e-3
    for _ in range(iters):
        J = np.empty((len(r), len(idx)))
        for k, j in enumerate(idx):
            d = np.zeros(14)
            d[j] = step[j]
            J[:, k] = (f(p + d) - f(p - d)) / (2 * step[j])
        A, g = J.T @ J, J.T @ r
        D = np.diag(A).copy()
        D[D == 0] = 1e-30
        improved = False
        while lam < 1e12:
            try:
                dp = np.linalg.solve(A + lam * np.diag(D), -g)
            except np.linalg.LinAlgError:
                lam *= 10
                continue
            q = p.copy()
            q[idx] += dp
            if 0 <= q[P_E] < 0.9 and abs(q[P_E1]) < 0.5:
                r2 = f(q)
                c2 = r2 @ r2
                if c2 < cost:
                    gain = (cost - c2) / cost
                    p, r, cost, lam, improved = q, r2, c2, lam / 3, True
                    break
            lam *= 4
        if not improved or gain < 1e-13:
            break
    return p


def refine(p, free, T, truth, weight=None, iters=80):
    """Least squares on (model - truth) / distance: where the body is at each date."""
    rt = np.linalg.norm(truth, axis=1)[:, None]
    sw = np.ones((len(T), 1)) if weight is None else np.sqrt(weight)[:, None]
    return levenberg(lambda q: ((model_icrf(q, T) - truth) / rt * sw).ravel(), p, free, iters)


def minimax(p, free, T, truth, allow=None, rounds=40):
    """Lower the largest angular error (Lawson: lean on the worst dates, refit, repeat).
    `allow` scales the error per date (1.3 = that date may be 1.3 times further off)."""
    allow = np.ones(len(T)) if allow is None else allow
    w = np.ones(len(T))
    best, best_max, q = p, None, p
    for k in range(rounds + 1):
        ang = errors(model_icrf(q, T), truth)[0] / allow
        if best_max is None or ang.max() < best_max:
            best, best_max = q, ang.max()
        if k == rounds:
            break
        w = w * (ang / ang.max() + 0.02)
        w /= w.mean()
        q = refine(q, free, T, truth, weight=w, iters=20)
    return best


def plane_coords(p, T, truth):
    """Each Horizons position in the model ellipse's own axes at that date: along the
    apse line, across it in the plane, and out of the plane."""
    x = truth @ pole_frame(p[P_RA], p[P_DEC]).T
    node, inc = (p[P_ND] + p[P_ND1] * T) * DEG, (p[P_I] + p[P_I1] * T) * DEG
    w = (p[P_LP] + p[P_LP1] * T) * DEG - node
    N = np.stack([np.cos(node), np.sin(node), np.zeros_like(node)], axis=1)
    n = np.stack([np.sin(inc) * np.sin(node), -np.sin(inc) * np.cos(node), np.cos(inc)], axis=1)
    peri = np.cos(w)[:, None] * N + np.sin(w)[:, None] * np.cross(n, N)
    return np.sum(x * peri, axis=1), np.sum(x * np.cross(n, peri), axis=1), np.sum(x * n, axis=1)


def refine_shape(p, free, T, truth):
    """Fit the ellipse and its plane without using WHEN the body is where: each Horizons
    position is compared with the ellipse point in the same direction. Timing errors (a
    moon librating about its mean longitude) cannot leak into the shape this way."""
    rt = np.linalg.norm(truth, axis=1)
    free = free.copy()
    free[[P_L, P_L1]] = False

    def f(q):
        xi, eta, zeta = plane_coords(q, T, truth)
        r = q[P_A] * (1 - q[P_E] ** 2) / (1 + q[P_E] * xi / np.hypot(xi, eta))
        return np.concatenate([(np.hypot(xi, eta) - r) / rt, zeta / rt])
    return levenberg(f, p, free)


def mean_longitude(p, T, truth):
    """The mean longitude each Horizons position implies on the model ellipse (deg)."""
    xi, eta, _ = plane_coords(p, T, truth)
    e = p[P_E]
    E = 2 * np.arctan2(math.sqrt(1 - e) * eta, math.sqrt(1 + e) * (np.hypot(xi, eta) + xi))
    return np.degrees(E - e * np.sin(E)) + p[P_LP] + p[P_LP1] * T


def libration(p, T, truth):
    """One sine through what a linear mean longitude leaves: amplitude (deg), period
    (years), phase at J2000 (deg), the largest residual after it (deg), and the change
    to the straight line (deg, deg per century) that goes with it."""
    res = wrap(mean_longitude(p, T, truth) - (p[P_L] + p[P_L1] * T))
    best = None
    for period in np.arange(2.0, 150.0, 0.05):
        om = 2 * math.pi / (period / 100)
        A = np.stack([np.sin(om * T), np.cos(om * T), np.ones_like(T), T], axis=1)
        c = np.linalg.lstsq(A, res, rcond=None)[0]
        left = res - A @ c
        if best is None or left.std() < best[0]:
            best = (left.std(), math.hypot(c[0], c[1]), period, math.degrees(math.atan2(c[1], c[0])), np.abs(left).max(), c[2], c[3])
    return best[1:]


def tidy(p):
    """Same orbit, with e >= 0, i >= 0 and the angles at the epoch in 0..360."""
    p = p.copy()
    if p[P_I] < 0 and p[P_I1] == 0:
        p[P_I], p[P_ND] = -p[P_I], p[P_ND] + 180
    for k in (P_L, P_LP, P_ND, P_RA):
        p[k] %= 360.0
    return p


def fit_orbit(bid, verbose=True):
    parent = BODIES[bid][1]
    moon = parent != 'sun'
    rng = np.random.default_rng(1000 + sorted(BODIES).index(bid))
    jd = np.sort(np.round(rng.uniform(JD_1950, JD_2100, N_FIT), 4))
    truth, el = vectors(bid, jd), elements(bid, jd)
    T, t_days = (jd - J2000) / 36525, jd - J2000
    allow = np.where((jd > JD_1990) & (jd < JD_2060), 1.0, OUTSIDE_WINDOW.get(bid, 1.0))
    free = np.ones(14, bool)
    note = ''
    if not moon:
        free[[P_RA, P_DEC]] = False
        p = first_guess(el, t_days, pole_frame(*ECLIPTIC_POLE), moon)
        p[P_RA], p[P_DEC] = ECLIPTIC_POLE
        ang0 = errors(model_icrf(p, T), truth)[0]
        p = refine(p, free, T, truth)
        lsq = errors(model_icrf(p, T), truth)[0].max()
        p = minimax(p, free, T, truth, allow)
    else:
        # the frame's pole: the axis the orbit normal turns about = the direction along
        # which the normals vary least (for a normal that hardly moves this is the normal)
        i, O = el['i'] * DEG, el['node'] * DEG
        nrm = np.stack([np.sin(i) * np.sin(O), -np.sin(i) * np.cos(O), np.cos(i)], axis=1)
        axis = np.linalg.eigh(np.cov(nrm.T))[1][:, 0]
        if axis @ nrm.mean(axis=0) < 0:
            axis = -axis
        pole = (math.degrees(math.atan2(axis[1], axis[0])) % 360, math.degrees(math.asin(axis[2])))
        free[[P_A1, P_E1, P_I1]] = False             # a moon's ellipse keeps its size, shape and tilt
        p = first_guess(el, t_days, pole_frame(*pole), moon)
        p[P_RA], p[P_DEC] = pole
        ang0 = errors(model_icrf(p, T), truth)[0]
        # 1. the "mean" solution: shape and plane first (pole held, then free), then the timing
        fixed_pole = free.copy()
        fixed_pole[[P_RA, P_DEC]] = False
        p = refine_shape(p, fixed_pole, T, truth)
        p = refine_shape(p, free, T, truth)
        only_L = np.zeros(14, bool)
        only_L[[P_L, P_L1]] = True
        Lj = mean_longitude(p, T, truth)
        rate, mean = scan_rate(np.exp(1j * Lj * DEG), t_days, p[P_L1] / 36525 * 0.995, p[P_L1] / 36525 * 1.005, 0.05 * 360 / (t_days.max() - t_days.min()))
        p[P_L], p[P_L1] = np.angle(mean) / DEG, rate * 36525
        p = refine(p, only_L, T, truth)
        lsq = errors(model_icrf(p, T), truth)[0].max()
        mean_sol = minimax(p, only_L, T, truth, allow)
        m_ang, m_dist = errors(model_icrf(mean_sol, T), truth)
        # 2. everything free, judged by position: better whenever the model can follow the
        #    moon. Where it cannot (a large libration) the fit bends the ellipse to chase the
        #    longitude and the distance goes wrong: then the mean solution stands.
        q = minimax(refine(p, free, T, truth), free, T, truth, allow)
        f_ang, f_dist = errors(model_icrf(q, T), truth)
        if f_ang.max() < m_ang.max() and np.abs(f_dist).max() < max(2 * np.abs(m_dist).max(), 0.3):
            p = q
        else:
            p = mean_sol
            amp, period, phase, left, dL, dL1 = libration(p, T, truth)
            note = ('\n            mean elements kept (the free fit gave %.2f deg but %.1f %% in distance). The mean longitude swings by'
                    '\n            %.2f deg * sin(360 deg * T / %.4f + %.1f deg), T = centuries from J2000; with that one term %.2f deg would be left'
                    % (f_ang.max(), np.abs(f_dist).max(), amp, period / 100, phase, left))
            if bid in APSE_FOR_LIBRATION:
                # 2 e sin(M) = amp sin(360 T / period + phase): an "eccentricity" whose apse
                # line turns almost with the moon gives the same swing in longitude
                q = p.copy()
                q[P_L], q[P_L1] = q[P_L] + dL, q[P_L1] + dL1
                q[P_E] = amp * DEG / 2
                q[P_LP], q[P_LP1] = q[P_L] - phase, q[P_L1] - 360 / (period / 100)
                held = free.copy()
                held[[P_A, P_E]] = False             # the size stays the real one, e stays the swing
                p = minimax(refine(q, held, T, truth), held, T, truth, allow)
                note += '\n            -> the apse stands in for that swing (e = %.4f is not the real eccentricity)' % p[P_E]
    p = tidy(p)
    ang, dist = errors(model_icrf(p, T), truth)
    if verbose:
        print('  %-9s fit on %d dates: first guess %.3f, least squares %.3f, final largest %.4f deg, rms %.4f deg, distance %.3f %%%s'
              % (bid, len(T), ang0.max(), lsq, ang.max(), math.sqrt(np.mean(ang ** 2)), np.abs(dist).max(), note))
    return p


# ----------------------------------------------------------------------------- rotation
def rot_basis(ra, dec):
    """Q (node), R, P (pole) of rotationMatrix() in ephemeris.js, for arrays of degrees."""
    a, d = np.asarray(ra) * DEG, np.asarray(dec) * DEG
    Q = np.stack([-np.sin(a), np.cos(a), np.zeros_like(a)], axis=-1)
    P = np.stack([np.cos(d) * np.cos(a), np.cos(d) * np.sin(a), np.sin(d)], axis=-1)
    return Q, np.cross(P, Q), P


def sub_point(rot, jd, s):
    """East longitude and planetocentric latitude of direction s (ICRF) under a linear model."""
    d = jd - J2000
    Q, R, P = rot_basis(rot[0][0] + rot[0][1] * d / 36525, rot[1][0] + rot[1][1] * d / 36525)
    W = (rot[2][0] + rot[2][1] * d) * DEG
    q, r = np.sum(s * Q, axis=1), np.sum(s * R, axis=1)
    lon = np.degrees(np.arctan2(r, q) - W)
    return lon, np.degrees(np.arcsin(np.clip(np.sum(s * P, axis=1), -1, 1)))


def wrap(x):
    return (np.asarray(x) + 180.0) % 360.0 - 180.0


def rotation_data(bid):
    """Horizons' pole and sub-solar point, as east longitude / planetocentric latitude at the body's own time."""
    rng = np.random.default_rng(5000 + sorted(BODIES).index(bid))
    jd = np.sort(np.round(rng.uniform(J2000, JD_2040, N_ROT_CHECK + N_ROT_FIT), 4))
    o = observer(bid, jd)
    ra, dec = o['ra'] * DEG, o['dec'] * DEG
    s = -np.stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)], axis=1)   # body -> Sun
    a, b, c = o['radii']
    # Horizons' latitude is planetodetic (the ellipsoid's normal); the game's is from the centre
    # (for three-axis moons Horizons uses the long axis a: checked against its own pole)
    lat = np.degrees(np.arctan(np.tan(o['lat'] * DEG) * (c / a) ** 2))
    lon = wrap(-o['lon'] if o['west'] else o['lon'])
    Q, R, P = rot_basis(o['poleRa'], o['poleDec'])
    lat_from_pole = np.degrees(np.arcsin(np.sum(s * P, axis=1)))
    W = np.degrees(np.arctan2(np.sum(s * R, axis=1), np.sum(s * Q, axis=1))) - lon
    check = np.zeros(len(jd), bool)
    check[rng.choice(len(jd), N_ROT_CHECK, replace=False)] = True
    return {'jd': o['jd'] - o['lt'], 's': s, 'lon': lon, 'lat': lat, 'poleRa': o['poleRa'], 'poleDec': o['poleDec'], 'W': W,
            'check': check, 'west': o['west'], 'model': o['model'], 'latSelf': float(np.abs(lat - lat_from_pole).max())}


def rot_error(rot, d, sel=slice(None)):
    lon, lat = sub_point(rot, d['jd'][sel], d['s'][sel])
    return float(np.abs(wrap(lon - d['lon'][sel]) * np.cos(d['lat'][sel] * DEG)).max()), float(np.abs(lat - d['lat'][sel]).max())


def fit_rotation(bid, verbose=True):
    """IAU linear constants if they match Horizons, otherwise a linear fit to Horizons 2000..2040."""
    d = rotation_data(bid)
    use = ~d['check']
    days = d['jd'] - J2000
    A = np.stack([np.ones(use.sum()), days[use] / 36525], axis=1)
    ra_un = d['poleRa'][0] + wrap(d['poleRa'] - d['poleRa'][0])
    cra, cdec = np.linalg.lstsq(A, ra_un[use], rcond=None)[0], np.linalg.lstsq(A, d['poleDec'][use], rcond=None)[0]
    # W: take out a rate first (IAU's, else the one that lines the samples up), then a straight line
    iau = IAU.get(bid)
    if iau:
        rate = iau[2][1]
    else:
        guess = {'neptune': 541.14, 'triton': -61.257}[bid]
        rate = scan_rate(np.exp(1j * d['W'][use] * DEG), days[use], guess - 0.5, guess + 0.5, 0.05 * 360 / (JD_2040 - J2000))[0]
    res = d['W'] - rate * days
    res = res[0] + wrap(res - res[0])
    cw = np.linalg.lstsq(np.stack([np.ones(use.sum()), days[use]], axis=1), res[use], rcond=None)[0]
    fitted = ((cra[0] % 360, cra[1]), (cdec[0], cdec[1]), (cw[0] % 360, rate + cw[1]))
    chosen, origin = fitted, 'fitted'
    e_fit = rot_error(fitted, d)
    e_iau = rot_error(iau, d) if iau else None
    if iau and (max(e_iau) <= ROT_TOLERANCE or bid in KEEP_IAU_MEAN):
        chosen, origin = iau, 'IAU'
    if verbose:
        print('  %-9s %s  %s  IAU linear: %s  linear fit: lon %.3f lat %.3f  -> %s   (latitude self-check %.4f)'
              % (bid, d['model'], 'W+' if d['west'] else 'E+',
                 'lon %.3f lat %.3f' % e_iau if iau else 'none (periodic)        ', e_fit[0], e_fit[1], origin, d['latSelf']))
        if iau and origin == 'fitted':
            print('            fitted W0 %.3f (IAU %.3f), rate %.7f (IAU %.7f), pole %.3f %.3f (IAU %.3f %.3f)'
                  % (fitted[2][0], iau[2][0], fitted[2][1], iau[2][1], fitted[0][0], fitted[1][0], iau[0][0], iau[1][0]))
    return chosen, origin, d, (e_iau, e_fit)


# ----------------------------------------------------------------------------- output
def js_orbit(bid, p):
    moon = BODIES[bid][1] != 'sun'
    if moon:
        day = lambda v: '%.9f * DAYS_PER_CENTURY' % (v / 36525)   # noqa: E731
        return ("    orbit: {\n      frame: 'pole', framePole: { ra: %.4f, dec: %.4f },\n"
                "      a: [%.2fe3, 0], e: [%.6f, 0], i: [%.4f, 0],\n"
                "      L: [%.4f, %s], lonPeri: [%.3f, %s],\n      node: [%.3f, %s],\n    },"
                % (p[P_RA], p[P_DEC], p[P_A] / 1e3, p[P_E], p[P_I], p[P_L], day(p[P_L1]), p[P_LP], day(p[P_LP1]), p[P_ND], day(p[P_ND1])))
    return ("    orbit: {\n      frame: 'ecliptic',\n      a: [%.8f * AU, %.8f * AU], e: [%.8f, %.8f],\n"
            "      i: [%.6f, %.6f], L: [%.6f, %.6f],\n      lonPeri: [%.6f, %.6f], node: [%.6f, %.6f],\n    },"
            % (p[P_A] / AU, p[P_A1] / AU, p[P_E], p[P_E1], p[P_I], p[P_I1], p[P_L], p[P_L1], p[P_LP], p[P_LP1], p[P_ND], p[P_ND1]))


def js_rotation(rot, origin):
    def num(v, digits):                              # shortest form that keeps a decimal point; never "-0.0"
        s = ('%.*f' % (digits, v)).rstrip('0')
        s = s + '0' if s.endswith('.') else s
        return '0.0' if s in ('-0.0', '0.0') else s
    d = 7 if origin == 'IAU' else 4
    return '    rotation: { ra: [%s, %s], dec: [%s, %s], w: [%s, %.7f] },' % (
        num(rot[0][0], d), num(rot[0][1], d), num(rot[1][0], d), num(rot[1][1], d), num(rot[2][0], d), rot[2][1])


def pack(xyz):
    """Whole numbers of `unit` metres, seven digits at most: small on disc, 0.00001 deg."""
    unit = 10.0 ** max(0, math.ceil(math.log10(np.abs(xyz).max() / 9.9e6)))
    return unit, [int(v) for v in np.rint(xyz / unit).ravel()]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    todo = args or list(BODIES)
    for bid in todo:
        if bid not in BODIES:
            raise SystemExit('unknown body: ' + bid)
    if '--physical' in sys.argv:
        print('Horizons object data (radius, GM, albedo, gravity lines):')
        for bid in todo:
            print('  ' + bid)
            for ln in physical(bid):
                print('      ' + ln.strip())

    rng = np.random.default_rng(77)
    check_jd = np.sort(np.round(rng.uniform(JD_1950, JD_2100, N_CHECK), 4))
    out = {'source': 'JPL Horizons (ssd.jpl.nasa.gov), written by scripts/fit-orbits.py',
           'notes': ['jd: TDB Julian days, shared by every body',
                     'xyz: x,y,z per date, ICRF, relative to the parent centre, in whole numbers of `unit` metres',
                     'rot: sub-solar point at the body (jd = the body own time, light time removed): east longitude and planetocentric latitude, deg'],
           'jd': [float(j) for j in check_jd], 'bodies': {}}

    print('Orbits (new bodies fitted; existing ones only downloaded for the check):')
    fits = {}
    refit = '--refit-existing' in sys.argv
    for bid in todo:
        if bid not in EXISTING or refit:
            fits[bid] = fit_orbit(bid)
    print('\nRotation, against Horizons at %d dates in 2000..2040 (largest error of the sub-solar point, deg; lon is on the sphere):' % (N_ROT_CHECK + N_ROT_FIT))
    rots = {}
    for bid in todo:
        if bid in EXISTING:
            if bid in ('earth', 'moon', 'mars'):
                rots[bid] = (None, 'existing', rotation_data(bid), None)
            continue
        rots[bid] = fit_rotation(bid)

    print('\nFor src/worlds/solarSystem.js:\n')
    for bid in todo:
        if bid in fits:
            print('  %s: {%s' % (bid, '      // already in the catalogue with other numbers: a proposal only' if bid in EXISTING else ''))
            print(js_orbit(bid, fits[bid]))
            if bid not in EXISTING:
                print(js_rotation(rots[bid][0], rots[bid][1]) + ('' if rots[bid][1] == 'IAU' else '   // fitted to Horizons 2000-2040'))
            print('  },')

    for bid in todo:
        unit, ints = pack(vectors(bid, check_jd))
        entry = {'parent': BODIES[bid][1], 'unit': unit, 'xyz': ints}
        if bid in rots:
            d = rots[bid][2]
            c = d['check']
            entry['rot'] = {'model': d['model'], 'jd': [round(float(v), 6) for v in d['jd'][c]],
                            'lon': [round(float(v), 4) for v in d['lon'][c]], 'lat': [round(float(v), 4) for v in d['lat'][c]]}
        out['bodies'][bid] = entry
    if args:
        print('\n(only some bodies were asked for: %s is left as it is)' % os.path.relpath(OUT, ROOT))
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
        f.write('\n')
    print('\nwrote %s (%d KB): %d dates per body, %d bodies' % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) // 1024, N_CHECK, len(out['bodies'])))


if __name__ == '__main__':
    main()
