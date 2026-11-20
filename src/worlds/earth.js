// Earth — numbers and recipe names only. Home, seen the way the other worlds are: real
// elevation, real colour, the true sky. The game opens on places that are bare in
// reality (canyon rock, high mountains, a volcano's summit, a dune sea): there are no
// trees, grass or buildings in this engine, and a forest from the ground would be a lie.
export default {
  id: 'earth',
  name: 'Earth',
  body: 'earth',
  radius: 6371000,
  gravity: 9.81,
  dayHours: 24,

  terrain: {
    maxLevel: 19,               // ~19 m chunks
    minAltitude: -100,          // the sea is the floor (see the last layer)
    maxAltitude: 9000,
    shadowRange: 200000,
    shadowHeadroom: 700,
    // The open "Terrain Tiles" elevation (SRTM and others; scripts/fetch-earth-terrain.py):
    // the globe at 28 km per pixel and five places at 90 to 190 m.
    dems: [
      { url: 'data/earth_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
      { url: 'data/earth_dem_grandcanyon.i16', width: 840, height: 600, lon0: 247.55, lon1: 248.25, lat0: 36.4, lat1: 35.9, feather: 0.06 },
      { url: 'data/earth_dem_everest.i16', width: 900, height: 660, lon0: 86.55, lon1: 87.30, lat0: 28.25, lat1: 27.7, feather: 0.06 },
      { url: 'data/earth_dem_hawaii.i16', width: 900, height: 900, lon0: 203.8, lon1: 205.3, lat0: 20.35, lat1: 18.85, feather: 0.12 },
      { url: 'data/earth_dem_namib.i16', width: 960, height: 720, lon0: 15.1, lon1: 15.9, lat0: -24.45, lat1: -25.05, feather: 0.06 },
      { url: 'data/earth_dem_alps.i16', width: 720, height: 420, lon0: 7.45, lon1: 8.05, lat0: 46.15, lat1: 45.8, feather: 0.06 },
    ],
    layers: [
      { op: 'dem' },
      // What the maps cannot resolve: relief that grows on slopes (water-cut ground).
      { op: 'fbm', seed: 3, maxWavelength: 60000, minWavelength: 0.8, roughness: 0.82, amp: 26, belowDem: 2.2, slopeGain: [0.04, 0.4, 0.15, 1.0], hetero: 0.5 },
      // Gullies and spurs on the mountain sides and canyon walls.
      { op: 'ridged', seed: 5, maxWavelength: 1400, minWavelength: 20, roughness: 0.9, amp: 260, slopeMask: [0.12, 0.4], warp: 0.3 },
      // Layered rock: beds stand as cliffs and benches wherever the ground is steep.
      { op: 'terrace', seed: 7, thickness: 150, cliff: 0.24, rise: 0.7, strength: 0.7, slopeMask: [0.14, 0.34], jitter: 0.35, warpAmp: 25, warpWavelength: 2200 },
      { op: 'terrace', seed: 9, thickness: 22, cliff: 0.18, rise: 0.76, strength: 0.6, slopeMask: [0.18, 0.4], jitter: 0.4, warpAmp: 4, warpWavelength: 260 },
      // The sea: nothing lies below sea level (this layer stays last).
      { op: 'sea', level: 0 },
    ],
  },

  surface: {
    roughness: 0.5,
    bounce: 1.0,
    reliefMap: { url: 'data/earth_slopes_4096.jpg', strength: 2.0, latFade: [84, 89] },
    // NASA's Blue Marble (the globe's own day map; its left edge is longitude -180): the
    // colour of the land from the air. `mean` is the land's mean, so deserts come out
    // bright, forests dark green and ice white.
    albedoMap: { url: 'data/earth_day_4096.jpg', lon0: -180, encoding: 'srgb', mean: [0.2059, 0.1801, 0.1354], strength: 1.0, chroma: 1.0, range: [0.2, 4.5] },
    meanAlbedo: [0.19, 0.17, 0.13],
    dust: [0.215, 0.185, 0.14],        // dry soil
    sand: [0.30, 0.25, 0.17],
    scree: [0.20, 0.18, 0.15],
    rock: [0.19, 0.17, 0.15],
    strata: { period: 310, contrast: 0.3, finePeriod: 36, fine: 0.14, flat: 0.1, colors: [[0.95, 0.78, 0.62], [0.72, 0.55, 0.45], [0.9, 0.82, 0.7], [0.6, 0.5, 0.45], [0.85, 0.6, 0.45]] },
    slopes: { dustMax: 0.36, screeMin: 0.55, screeMax: 0.8, rockMin: 1.0 },
    sandBelow: -20000, sandFade: 1500,
    ripples: { wavelength: 1, strength: 0 },
    detailStrength: 0.6,
    sea: { level: 0, color: [0.008, 0.030, 0.070], roughness: 0.10, ripples: 0.07 },
    rocks: { count: 300, radius: 110, size: [0.2, 1.6], albedo: [0.2, 0.18, 0.16] },
  },

  atmosphere: {
    topAltitude: 100000,
    surfaceDensity: 1.225,
    occluderAltitude: 0,
    rayleigh: { scattering: [5.8e-6, 13.5e-6, 33.1e-6], scaleHeight: 8000 },
    // haze: a clear day (visibility over 100 km)
    dust: { scattering: [3.0e-6, 3.0e-6, 3.0e-6], absorption: [0.3e-6, 0.3e-6, 0.3e-6], phaseG: [0.76, 0.76, 0.76], scaleHeight: 1200 },
    // ozone: takes orange light out of long light paths (the blue of dusk)
    absorber: { absorption: [0.65e-6, 1.88e-6, 0.085e-6], centerAltitude: 25000, halfWidth: 15000 },
  },

  // Clouds of one real day (the globe's own cloud map) as a layer overhead (see sky/clouds.js).
  clouds: { map: 'data/earth_clouds_4096.jpg', lon0: -180, altitude: 4500, cover: 0.85, shadow: 0.6 },

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2024-06-21T14:30:00Z',   // the June solstice, an hour and a half after sunrise at the canyon
    // Mather Point on the South Rim of the Grand Canyon: a mile down to the Colorado River
    // and sixteen kilometres across to the North Rim.
    start: { lat: 36.0617, lon: 247.8923, eye: 1.7, heading: 5, pitch: -8 },
    ship: { east: -40, north: -30, heading: 30 },
    exposure: { key: 0.18, min: 0.5, max: 2.0e5, speed: 1.6, shadowFloor: 0.2, highlight: 6 },
    bookmarks: {
      ledge: { label: 'The Grand Canyon from Mather Point', heading: 5, pitch: -8, fov: 60 },
      sun: { label: 'The morning Sun over the rim', heading: 70, pitch: 8, fov: 40 },
      wall: { label: 'The North Rim, sixteen kilometres away', heading: 350, pitch: -3, fov: 26 },
      ship: { label: 'The lander on the rim', east: -20, north: -12, heading: 230, pitch: 3, fov: 50 },
      dusk: { label: 'The canyon at sunset', heading: 300, pitch: -4, fov: 60, timeOffsetHours: 12.4 },
      everest: { label: 'Everest from Kala Patthar', lat: 27.9959, lon: 86.8285, heading: 80, pitch: 10, fov: 44, timeOffsetHours: -13 },
      maunakea: { label: 'The summit of Mauna Kea', lat: 19.8206, lon: 204.5319, heading: 200, pitch: -4, fov: 60, timeOffsetHours: 4 },
      namib: { label: 'The dunes of Sossusvlei', lat: -24.763, lon: 15.303, heading: 110, pitch: -4, fov: 60, timeOffsetHours: -9 },
      matterhorn: { label: 'The Matterhorn from the Gornergrat', lat: 45.983, lon: 7.785, heading: 255, pitch: 6, fov: 40, timeOffsetHours: -9 },
    },
  },
  places: [
    { id: 'grandcanyon', name: 'The Grand Canyon', fact: 'A mile deep: the Colorado River cut through two billion years of rock.', lat: 36.06, lon: 247.89 },
    { id: 'everest', name: 'Mount Everest', fact: 'The highest ground on Earth, 8 849 m, and still rising a few millimetres a year.', lat: 27.988, lon: 86.925 },
    { id: 'maunakea', name: 'Mauna Kea', fact: 'Measured from its foot on the sea floor it is taller than Everest.', lat: 19.82, lon: 204.53 },
    { id: 'namib', name: 'The Namib sand sea', fact: 'The oldest desert on Earth, with dunes over 300 m high.', lat: -24.76, lon: 15.30 },
    { id: 'matterhorn', name: 'The Matterhorn', fact: 'A horn of rock carved by four glaciers: its top is a piece of Africa.', lat: 45.976, lon: 7.659 },
    { id: 'sahara', name: 'The Sahara', fact: 'As large as the United States; green grassland only six thousand years ago.', lat: 23.0, lon: 12.0 },
    { id: 'antarctica', name: 'The South Pole', fact: 'Under your feet: 2 800 m of ice.', lat: -89.5, lon: 0 },
    { id: 'kilimanjaro', name: 'Kilimanjaro', fact: 'A volcano standing alone, with ice at the equator.', lat: -3.07, lon: 37.35 },
    { id: 'uluru', name: 'Uluru', fact: 'One rock, 348 m high and nine kilometres round.', lat: -25.345, lon: 131.036 },
    { id: 'canaveral', name: 'Cape Canaveral', fact: 'Where the journeys to every other world in this game began.', lat: 28.57, lon: 279.35 },
  ],
};
