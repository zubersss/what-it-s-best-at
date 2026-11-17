# Assets

Only public-domain or CC0 assets are allowed. Everything else in the scene (ship, rocks,
Phobos shape, noise, blue-noise dither pattern, strata colours) is generated from code in
this repository.

All files below are produced by `npm run assets` (`scripts/fetch-assets.mjs`), which
downloads the originals and converts them. Originals are not stored in the repo.

| File in `public/data/` | What | Source | Licence |
| --- | --- | --- | --- |
| `mars_mola_4ppd.i16` | Global Mars elevation, 1440×720, int16 little-endian metres above the areoid, simple cylindrical, lon 0–360°E, lat +90→−90 | NASA PDS Geosciences Node, MGS MOLA MEGDR `MEGT90N000CB.IMG` (4 px/deg). `https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/` | Public domain (NASA / MOLA Science Team, D. E. Smith et al.). No copyright; credit requested. |
| `mars_mola_coprates_128ppd.i16` | Regional inset, Coprates Chasma, 1408×832, int16 LE metres, lon 291–302°E, lat −9.5→−16° | Same data set, `MEGT00N270HB.IMG` (128 px/deg, ~463 m/px), cropped with HTTP range requests | Public domain (as above) |
| `stars_bsc5.f32` | 9 096 stars to V≈6.5–7: float32 LE records `[RA rad, Dec rad, Vmag, B−V]`, J2000 | Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), ASCII `bsc5.dat` mirrored at `http://tdc-www.harvard.edu/catalogs/bsc5.html` (originally NSSDC/ADC, CDS V/50) | Public domain: distributed without restriction by NASA's Astronomical Data Center; factual catalogue data. Credit: Hoffleit D., Warren W.H. Jr. |

Generated in-repo (CC0 by construction, no third-party input):

| File | What | Generator |
| --- | --- | --- |
| `src/post/blueNoiseData.js` | 64×64 blue-noise dither mask (void-and-cluster) | `scripts/gen-bluenoise.mjs` |

Orbital elements, rotation models, radii and albedos in `src/worlds/solarSystem.js` are
numerical facts taken from public NASA/JPL fact sheets and the IAU WGCCRE report
(JPL "Approximate Positions of the Planets", Standish; IAU 2009/2015 rotation elements).

Code-level attributions (not assets): the AgX tone-map fit follows the publicly
documented AgX matrices (Troy Sobotka) in the minimal form popularised by Benjamin
Wrensch (MIT); the atmosphere follows Sébastien Hillaire, "A Scalable and Production
Ready Sky and Atmosphere Rendering Technique" (EGSR 2020) — implemented from the paper.
