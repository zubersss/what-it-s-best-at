# Assets

Only assets we have the right to use go in, and every one is recorded here with its source
and licence. So far all of them are public-domain mission data (some ask to be cited: the
"Use constraints" of their USGS record). Everything else in the scene (ship, rocks, noise,
blue-noise dither pattern, strata colours, the banded faces of Saturn, Uranus and Neptune,
the clouds of Venus and the haze of Titan) is generated from code in this repository.

**Not used, on purpose**: the Neptune and Uranus pictures on the USGS map server are an
artist's paintings (J. Hastings-Trew) whose terms forbid passing the files on, and its
Saturn picture is credited to a private author (B. Jonsson) with no stated licence.

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
| `earth_lights_4096.jpg`, `earth_lights_512.jpg` | City lights at night, greyscale | NASA Global Imagery Browse Services (GIBS), `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`, one WMS request of 4096×2048 for the whole globe (`scripts/fetch-earth.py`), layer `VIIRS_Black_Marble` (Black Marble 2016, NASA Earth Observatory / NOAA NGDC), the warm bright part of it | Free to use without restriction (NASA's open data policy for its Earth science data, a United States Government work; credit requested: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)") |
| `earth_water_2048.jpg`, `earth_water_512.jpg` | Seas and lakes (white) against land, greyscale, for the Sun's glint; the larger one also tells the lake rule which large level stretches are water | NASA Global Imagery Browse Services (GIBS), `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`, one WMS request of 4096×2048 for the whole globe (`scripts/fetch-earth.py`), layer `MODIS_Water_Mask` (MOD44W, Terra MODIS) | Free to use without restriction (NASA's open data policy for its Earth science data, a United States Government work; credit requested: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)") |

### The worlds of milestone 6

All from the USGS Astrogeology planetary map server (`https://planetarymaps.usgs.gov/`,
which serves the public bucket `asc-pds-services`), downloaded whole and reduced by
`python3 scripts/fetch-worlds.py` (the originals, about 5 GB, stay in `.cache/maps`).
"USGS record" below is the product's FGDC metadata on that server: access constraints
"public domain" or none, use constraints "please cite authors" or none.

| File in `public/data/` | What | Source (under `mosaic/` unless a path is given) | Licence |
| --- | --- | --- | --- |
| `phobos_dem_4ppd.i16`, `phobos_slopes_1024.jpg` | Phobos' shape: metres above the 11.1 km sphere, 1440×720 (interpolated from 100 m per pixel), and its slopes | `Phobos_ME_HRSC_DEM_Global_2ppd.tif` (Mars Express HRSC; K. Willner et al., DLR) | USGS record: public domain, please cite authors (ESA / DLR / FU Berlin; Willner et al. 2014) |
| `phobos_color_2048.jpg`, `_512` | Phobos' brightness, greyscale | `Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif` (Viking Orbiter pictures) | USGS record: public domain, please cite authors (NASA / Viking; DLR control) |
| `deimos_color_2048.jpg`, `_512` | Deimos, a shaded map drawn from the Viking pictures | `wms_basemaps/Deimos/deimoscyl4.jpg` (P. Stooke's small-body maps, archived in NASA's PDS) | Public (NASA PDS archive; credit Philip Stooke / NASA) |
| `mercury_dem_4ppd.i16`, `mercury_slopes_4096.jpg` | Mercury's elevation above 2439.4 km and its slopes (from 16 px/deg) | `Mercury_Messenger_USGS_DEM_Global_665m_v2.tif` (MESSENGER MDIS stereo; Becker et al. 2016) | USGS record: please cite authors (NASA / JHUAPL / CIW / USGS) |
| `mercury_color_4096.jpg`, `_512` | Mercury's brightness and a quarter of its three-filter colour, sRGB | `Mercury_MESSENGER_MDIS_Basemap_MD3Color_Mosaic_Global_665m.tif` | Public domain (NASA / JHUAPL / CIW) |
| `venus_dem_4ppd.i16`, `venus_slopes_4096.jpg` | Venus' elevation above 6051 km and its slopes | `Venus_Magellan_Topography_Global_4641m_v02.tif` (Magellan radar altimeter) | USGS record: public domain, please cite authors (NASA / JPL) |
| `venus_color_4096.jpg`, `_512` | Venus' ground as the radar saw it, in the orange of the Venera pictures | `Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m.tif` | USGS record: public domain (NASA / JPL / USGS) |
| `io_color_4096.jpg`, `_512` | Io in colour | `Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif` | USGS record: public domain (NASA / JPL / USGS) |
| `europa_color_4096.jpg`, `_512` | Europa: the brightness mosaic, coloured here from blue-white ice to the red-brown of its lines | `Europa_Voyager_GalileoSSI_global_mosaic_500m.tif` | USGS record: no constraints (NASA / JPL / USGS) |
| `ganymede_color_2048.jpg`, `_512` | Ganymede in colour | `Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif` | Public domain (NASA / JPL / USGS) |
| `callisto_color_2048.jpg`, `_512` | Callisto: brightness mosaic, tinted here | `Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif` | Public domain (NASA / JPL / USGS) |
| `jupiter_color_4096.jpg`, `_512` | Jupiter's clouds, the whole planet (Cassini, December 2000; PIA07782) | `wms_basemaps/Jupiter/Jupiter/jupiter_rgb_cyl.jpg` | Public domain (NASA / JPL / Space Science Institute) |
| `enceladus_dem_4ppd.i16`, `enceladus_slopes_1024.jpg` | Enceladus' shape: metres above a 251.5 km sphere | `Enceladus/enceladus_cassini_iss_shapemodel_bland_2019/enceladus_2019pm_radius.tif` (Bland et al. 2019, USGS) | Public domain (USGS) |
| `enceladus_color_4096.jpg`, `_512` | Enceladus: brightness mosaic, tinted the blue-white of its ice | `Enceladus_Cassini_mosaic_global_110m.tif` | USGS record: public domain, please cite authors (NASA / JPL / SSI) |
| `mimas_`, `tethys_`, `dione_`, `rhea_`, `iapetus_color_2048.jpg`, `_512` | Saturn's other round moons, brightness mosaics | `wms_basemaps/Saturn/Mimas/Cassini/Mimas_PDS_8ppd_dd360.tif`, `Tethys_Cassini_mosaic_global_293m.tif`, `Dione_Cassini_Voyager_mosaic_global_154m.tif`, `Rhea_Cassini_Voyager_mosaic_global_417m.tif`, `Iapetus_Cassini_Voyager_mosaic_global_783m.tif` | USGS records: public domain, please cite authors (NASA / JPL / SSI) |
| `titan_color_4096.jpg`, `_512` | Titan's ground through the haze at 938 nm, tinted the browns of Huygens' pictures | `wms_basemaps/Saturn/Titan/Cassini/Titan_ISS_P19658_Mosaic_Global_4km_clon0.tif` (PIA19658) | Public domain (NASA / JPL-Caltech / SSI) |
| `triton_color_4096.jpg`, `_512` | Triton in colour (the filters rebalanced toward natural pink; the never-seen north filled with the mean of what was seen) | `Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif` | USGS record: public domain, please cite authors (NASA / JPL / USGS) |
| `pluto_dem_4ppd.i16`, `pluto_slopes_4096.jpg` | Pluto's elevation above 1188.3 km where New Horizons saw it (46 % of the globe; datum elsewhere) and its slopes | `Pluto_NewHorizons_Global_DEM_300m_Jul2017_16bit.tif` (Schenk et al. 2018) | USGS record: please cite authors (NASA / JHUAPL / SwRI) |
| `pluto_color_4096.jpg`, `_512` | Pluto: brightness mosaic, coloured here from dark red-brown to cream; the unseen south filled | `Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif` | USGS record: please cite authors (NASA / JHUAPL / SwRI) |
| `charon_dem_4ppd.i16`, `charon_slopes_4096.jpg`, `charon_color_4096.jpg`, `_512` | Charon: elevation above 606 km where seen, slopes, brightness | `Charon_NewHorizons_Global_DEM_300m_Jul2017_16bit.tif`, `Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif` | USGS record: please cite authors (NASA / JHUAPL / SwRI) |
| `ceres_dem_4ppd.i16`, `ceres_slopes_4096.jpg` | Ceres' shape: metres above a 470 km sphere (the flattened body: +12 km at the equator, −21 km at the poles) | `Ceres_Dawn_FC_HAMO_DTM_DLR_Global_60ppd_Oct2016.tif` (Preusker et al. 2016) | USGS record: please cite authors (NASA / JPL-Caltech / UCLA / MPS / DLR / IDA) |
| `ceres_color_4096.jpg`, `_512` | Ceres: brightness mosaic | `Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif` | USGS record: please cite authors (as above) |

### Earth's surface (milestone 9)

| File in `public/data/` | What | Source | Licence |
| --- | --- | --- | --- |
| `earth_dem_4ppd.i16` | Earth's elevation, 1440×720, metres (sea floor below 0) | "Terrain Tiles" on the AWS Open Data registry (Mapzen's terrarium tiles, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`), zoom 4, resampled from Web-Mercator by `scripts/fetch-earth-terrain.py` | Open data with attribution (below) |
| `earth_slopes_4096.jpg` | The land's slope everywhere (the sea flat), as the other slope maps | Same, zoom 5 | As above |
| `earth_dem_grandcanyon.i16`, `_everest`, `_hawaii`, `_namib`, `_alps` | Sharper elevation at five places, 93 m per pixel (Hawaii 186 m) | Same, zoom 11 (Hawaii 10). These windows come from SRTM (NASA / USGS, public domain), USGS 3DEP (public domain) and, for the Alps, EU-DEM | As above |

| `earth_rain_720.u8` | Earth's mean yearly rainfall (2023), 720×360 bytes, byte = 3.2 × sqrt(mm a year), north first, from longitude −180: what the rivers are fed by | NASA GIBS, layer `MERRA2_Precipitation_Bias_Corrected_Monthly` (twelve months through WMS, colours turned back into values with the layer's colour map), `scripts/fetch-earth-climate.py` | NASA (MERRA-2, GMAO): public domain |

| `earth_clouds_4096.jpg`, `_512` (replaced), `earth_rain_2048.jpg`, `earth_cloudtop_1024.jpg`, `earth_storms.json` | The weather of 8 September 2017: where cloud was (VIIRS true colour, the clear Earth taken out), the day's rain (IMERG: byte = 60 × log2(1 + mm an hour)), cloud-top heights (MODIS Terra and Aqua: byte = 16 × km), and the tropical cyclones found in the rain map; Irma, Jose and Katia carry the positions and winds of the US National Hurricane Center's advisories of that day | NASA GIBS (`VIIRS_SNPP_CorrectedReflectance_TrueColor`, `IMERG_Precipitation_Rate`, `MODIS_Terra/Aqua_Cloud_Top_Height_Day`), `scripts/fetch-earth-weather.py` | NASA: public domain; NHC advisories: US government work, public domain |
| `earth_cover_palette.json` | What the colours of the land-cover and canopy-height tiles mean (17 classes; 91 heights) | GIBS colour maps `MODIS_IGBP_Land_Cover_Type` and `GEDI_RH100_Mean_Color_Index` | NASA: public domain |

### Streamed while the game runs (not in the repository)

On Earth the game fetches map tiles round the traveller from two public services that
need no key and no account and answer any web page (`src/worlds/earth.js`,
`terrain.tiles`; `docs/ARCHITECTURE.md`, "Map tiles round the traveller"). Nothing is
stored; the player's browser asks the services directly. The credits are in the game's
MENU.

| What | From | Rights |
| --- | --- | --- |
| Elevation at 2.4 km, 300 m and 30 m a pixel (zoom 6, 9, 12) | "Terrain Tiles" on the AWS Open Data registry, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | Open data with attribution (below) |
| The land's colour at 600 m | NASA GIBS, layer `BlueMarble_NextGeneration` (Web Mercator, level 8), `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/...` | NASA imagery: free to use; GIBS asks to be acknowledged: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)." |
| Land-cover class at 500 m and canopy height at 1 km: where forest is, of what kind, how tall | NASA GIBS, layers `MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual` (2022) and `GEDI_ISS_L3_Canopy_Height_Mean_RH100_201904-202303` | NASA (MODIS land team; GEDI, University of Maryland and NASA Goddard): free to use, GIBS acknowledged as above |

The tree species are not data either: land cover and height are measured, and the species is the region's dominant one for that class, from a table written for the game (`src/life/cover.js`).

The bed of coastal water is not data: the elevation set leaves the sea at zero near the
shore, and the tile worker gives it a bed that falls away from the land.

Attribution required by the Terrain Tiles set (its sources, as listed on
`https://registry.opendata.aws/terrain-tiles/`): ArcticDEM terrain data DEM(s) were created
from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards
1043681, 1559691, and 1542736; Australia terrain data © Commonwealth of Australia
(Geoscience Australia) 2017; Austria terrain data © offene Daten Österreichs – Digitales
Geländemodell (DGM) Österreich; Canada terrain data contains information licensed under the
Open Government Licence – Canada; Europe terrain data produced using Copernicus data and
information funded by the European Union – EU-DEM layers; Global ETOPO1 terrain data U.S.
National Oceanic and Atmospheric Administration; Mexico terrain data source: INEGI,
Continental relief, 2016; New Zealand terrain data Copyright 2011 Crown copyright (c) Land
Information New Zealand and the New Zealand Government (All rights reserved); Norway
terrain data © Kartverket; United Kingdom terrain data © Environment Agency copyright
and/or database right 2015. All rights reserved; United States 3DEP (formerly NED) and
global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.

The colour of Earth's ground and its clouds are the globe's own maps (Blue Marble, the
VIIRS day: rows above).

Orbits and spin of every body are fitted to and checked against NASA JPL Horizons
(`scripts/fit-orbits.py`, `scripts/check-ephemeris.mjs`): facts, not an asset.

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

## The painted look (milestone 11)

No asset was added for it. The tree shapes, the grass, the leaf patterns and the grades
are made in code for this game. The owner's reference pictures (screenshots of a
published game) are a direction, not an asset: they are not in the repository, nothing
is traced or sampled from them, and no texture, model, palette file or interface element
of that game is used.

## The trees' picture (`public/data/tree_atlas.png`)

Made here, by rule, with no outside artwork: `node scripts/make-tree-atlas.mjs` runs
`src/life/treeAtlasGen.js`, which draws sprays of foliage (needled boughs, bursts of
needles, twigs of leaves) and every tree shape seen whole from its own mesh. Nothing in
it is copied or traced from the owner's reference pictures or from any other source; the
references set the manner (finely cut foliage on a skeleton, crowns shaded as one mass,
far trees as silhouettes), not the drawings. Ours to use without condition.

