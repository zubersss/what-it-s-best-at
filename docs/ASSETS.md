# Assets

Only public-domain or CC0 assets are allowed. Everything else in the scene (ship, rocks,
Phobos shape, noise, blue-noise dither pattern, strata colours) is generated from code in
this repository.

Two scripts produce the files below; originals are not stored in the repo.

- `npm run assets` (`scripts/fetch-assets.mjs`, Node only): the first three rows.
- `python3 scripts/fetch-maps.py` (needs `pip install rasterio numpy pillow`): everything
  else. The sources are single files of 2 to 22 GB, so the script reads only the rows or
  windows it needs over HTTP range requests.

All rasters are simple cylindrical, longitude 0 to 360° E from the left edge, north at the
top. Elevation files are int16 little-endian; the world file gives metres per unit
(`scale`, 1 when absent).

| File in `public/data/` | What | Source | Licence |
| --- | --- | --- | --- |
| `mars_mola_4ppd.i16` | Global Mars elevation, 1440×720, metres above the areoid | NASA PDS Geosciences Node, MGS MOLA MEGDR `MEGT90N000CB.IMG` (4 px/deg). `https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/` | Public domain (NASA / MOLA Science Team, D. E. Smith et al.). No copyright; credit requested. |
| `mars_mola_coprates_128ppd.i16` | Coprates Chasma, 1408×832, lon 291–302°E, lat −9.5→−16°, 463 m per pixel | Same data set, `MEGT00N270HB.IMG` (128 px/deg), cropped with HTTP range requests | Public domain (as above) |
| `stars_bsc5.f32` | 9 096 stars to V≈6.5–7: float32 LE records `[RA rad, Dec rad, Vmag, B−V]`, J2000 | Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), ASCII `bsc5.dat` mirrored at `http://tdc-www.harvard.edu/catalogs/bsc5.html` (originally NSSDC/ADC, CDS V/50) | Public domain: distributed without restriction by NASA's Astronomical Data Center; factual catalogue data. Credit: Hoffleit D., Warren W.H. Jr. |
| `mars_mola_olympus_32ppd.i16` | The Olympus Mons shield, 448×416, lon 219–233°E, lat 25→12°, 1.9 km per pixel (box average of the source) | USGS Astrogeology, `Mars_MGS_MOLA_DEM_mosaic_global_463m.tif` (MOLA MEGDR as one mosaic). `https://planetarymaps.usgs.gov/mosaic/` | CC0 / public domain (NASA / MOLA Science Team; the USGS record says "Access constraints: CC0 (public domain)") |
| `mars_mola_olympus_summit_128ppd.i16` | Olympus Mons summit calderas, 384×384, lon 224.75–227.75°E, lat 20→17°, 463 m per pixel | Same file | Public domain (as above) |
| `mars_mola_gale_128ppd.i16` | Gale crater and Mount Sharp, 512×512, lon 135.75–139.75°E, lat −3.25→−7.25°, 463 m per pixel | Same file | Public domain (as above) |
| `mars_color_4096.jpg` | Global Mars colour, 4096×2048, sRGB | USGS Astrogeology, Viking Orbiter colour mosaic `Mars_Viking_MDIM21_ClrMosaic_global_232m.tif`, box-averaged. `https://planetarymaps.usgs.gov/mosaic/` | Public domain (NASA / JPL / USGS; the USGS record says "Access constraints: public domain") |
| `mars_slopes_4096.jpg` | The slope of the ground everywhere on Mars (relief shading from space): greyscale 4096×4096, east slope in the top half, north slope in the bottom, each 127.5 + 127.5·sign(s)·√min(|s|,1) | NASA PDS Geosciences Node, MGS MOLA MEGDR `MEGT90N000EB.IMG` (16 px/deg, 3.7 km), box-averaged to 4096×2048 and differentiated. `https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/` | Public domain (NASA / MOLA Science Team) |
| `moon_lola_4ppd.i16` | Global lunar elevation, 1440×720, metres above the 1737.4 km sphere | NASA PDS Geosciences Node, LRO LOLA gridded data `LDEM_4.IMG` (4 px/deg, stored × 0.5 m; converted to whole metres). `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/` | Public domain (NASA / GSFC, LOLA Science Team, D. E. Smith et al.) |
| `moon_sldem_apennine_64ppd.i16` | The Apennines and the edge of Mare Imbrium, 768×640, lon 0–12°E, lat 31→21°, 474 m per pixel, 0.5 m units | USGS Astrogeology, SLDEM2015 `Lunar_LRO_LOLAKaguya_DEMmerge_60N60S_512ppd.tif` (LOLA altimetry merged with Kaguya Terrain Camera stereo, 59 m), box-averaged 8×8. `https://planetarymaps.usgs.gov/mosaic/LolaKaguya_Topo/` | Public domain per the USGS record ("Access constraints: public domain; use constraints: please cite authors"). Cite: Barker M. K. et al. (2016), Icarus 273, 346–355; LOLA and SELENE/Kaguya teams. |
| `moon_sldem_hadley_512ppd.i16` | Hadley Rille and the Apollo 15 site, 1024×1152, lon 2.5–4.5°E, lat 27→24.75°, 59 m per pixel, 0.5 m units | Same file, full resolution | Public domain (as above) |
| `moon_sldem_tycho_64ppd.i16` | Tycho, 400×320, lon 345.5–351.75°E, lat −40.75→−45.75°, 474 m per pixel, 0.5 m units | Same file, box-averaged 8×8 | Public domain (as above) |
| `moon_sldem_taurus_littrow_256ppd.i16` | The Taurus–Littrow valley (Apollo 17), 384×352, lon 30–31.5°E, lat 20.875→19.5°, 118 m per pixel, 0.5 m units | Same file, box-averaged 2×2 | Public domain (as above) |
| `moon_albedo_4096.jpg` | Global lunar brightness at 750 nm, 4096×2048, greyscale, linear values | USGS Astrogeology, Clementine UVVIS mosaic `Lunar_Clementine_UVVIS_750nm_Global_Mosaic_118m_v2.tif`, box-averaged. `https://planetarymaps.usgs.gov/mosaic/` | Public domain (NASA / DoD Clementine mission; the USGS record says "Use constraints: public domain") |
| `moon_slopes_4096.jpg` | The slope of the ground everywhere on the Moon, as `mars_slopes_4096.jpg` | NASA PDS Geosciences Node, LRO LOLA gridded data `LDEM_16.IMG` (16 px/deg, 1.9 km), box-averaged to 4096×2048 and differentiated. `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/` | Public domain (NASA / GSFC, LOLA Science Team) |
| `earth_day_4096.jpg`, `earth_day_512.jpg` | Earth's colour without clouds, equirectangular, longitude −180…180, sRGB | NASA Global Imagery Browse Services (GIBS), `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`, one WMS request of 4096×2048 for the whole globe (`scripts/fetch-earth.py`), layer `BlueMarble_NextGeneration` (Blue Marble Next Generation, R. Stöckli, NASA Earth Observatory) | Free to use without restriction (NASA's open data policy for its Earth science data, a United States Government work; credit requested: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)") |
| `earth_clouds_4096.jpg`, `earth_clouds_512.jpg` | The clouds of one real day (2016-09-22), greyscale: what is bright and white in that day's picture and not in the clear one | NASA Global Imagery Browse Services (GIBS), `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`, one WMS request of 4096×2048 for the whole globe (`scripts/fetch-earth.py`), layer `VIIRS_SNPP_CorrectedReflectance_TrueColor`, `TIME=2016-09-22` (Suomi NPP VIIRS), compared with the Blue Marble | Free to use without restriction (NASA's open data policy for its Earth science data, a United States Government work; credit requested: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)") |
| `earth_lights_2048.jpg`, `earth_lights_512.jpg` | City lights at night, greyscale | NASA Global Imagery Browse Services (GIBS), `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`, one WMS request of 4096×2048 for the whole globe (`scripts/fetch-earth.py`), layer `VIIRS_Black_Marble` (Black Marble 2016, NASA Earth Observatory / NOAA NGDC), the warm bright part of it | Free to use without restriction (NASA's open data policy for its Earth science data, a United States Government work; credit requested: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)") |
| `earth_water_2048.jpg`, `earth_water_512.jpg` | Seas and lakes (white) against land, greyscale, for the Sun's glint | NASA Global Imagery Browse Services (GIBS), `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`, one WMS request of 4096×2048 for the whole globe (`scripts/fetch-earth.py`), layer `MODIS_Water_Mask` (MOD44W, Terra MODIS) | Free to use without restriction (NASA's open data policy for its Earth science data, a United States Government work; credit requested: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)") |

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
