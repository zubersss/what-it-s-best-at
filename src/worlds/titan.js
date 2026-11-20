// Titan — numbers and recipe names only. Saturn's great moon, the only other world with a
// thick air and weather: an orange smog hides the Sun, methane rains on water-ice hills,
// and seas of dark sand drift into dunes a hundred metres high round the equator.
export default {
  id: 'titan',
  name: 'Titan',
  body: 'titan',
  radius: 2574700,
  gravity: 1.352,
  dayHours: 382.7,

  terrain: {
    maxLevel: 18,
    minAltitude: -700,
    maxAltitude: 2400,
    shadowRange: 60000,
    shadowHeadroom: 600,
    // A stand-in for the elevation (none is on the map server): made from the
    // near-infrared mosaic, bright uplands high and dark sand seas low.
    dems: [
      { url: 'data/titan_dem_4ppd.i16', width: 1440, height: 720, lon0: 0, lon1: 360, lat0: 90, lat1: -90, wrap: true },
    ],
    layers: [
      { op: 'dem' },
      { op: 'fbm', seed: 2, maxWavelength: 120000, minWavelength: 600, roughness: 0.75, amp: 9 },
      // The uplands: worn ridges of water ice, cut by river valleys.
      { op: 'ridged', seed: 5, maxWavelength: 14000, minWavelength: 60, roughness: 0.85, amp: 900, warp: 0.4, where: { alt: [220, 9000], altFade: 160 } },
      // The dune seas: straight dunes of dark organic sand, 100 m high and 3 km apart,
      // running east-west for hundreds of kilometres in the low ground near the equator.
      { op: 'lineaments', seed: 7, poles: [[90, 0]], spacing: 3100, width: 1350, height: 105, profile: 'dune', presence: 0.95, segment: 160000, segmentLevel: -0.5, wobble: [900, 26000], varied: 0.35, jitter: 0.12, where: { alt: [-900, -60], altFade: 70, lat: [0, 30], fade: 5 } },
      { op: 'lineaments', seed: 9, poles: [[90, 0]], spacing: 190, width: 80, height: 4, profile: 'dune', presence: 0.9, segment: 9000, segmentLevel: -0.4, wobble: [60, 1500], varied: 0.4, where: { alt: [-900, -60], altFade: 70, lat: [0, 30], fade: 5 } },
      // Dry river beds and their cobbles (where Huygens came down).
      { op: 'fbm', seed: 11, maxWavelength: 400, minWavelength: 0.8, roughness: 0.9, amp: 1.5, slopeGain: [0.08, 0.4, 0.5, 1.6], hetero: 0.4 },
    ],
  },

  surface: {
    roughness: 0.6,
    bounce: 1.0,
    albedoMap: { url: 'data/titan_color_4096.jpg', encoding: 'srgb', mean: [0.3082, 0.1566, 0.0483], strength: 0.8, chroma: 0.6, latFade: [80, 88], range: [0.35, 1.9] },
    meanAlbedo: [0.16, 0.11, 0.06],
    dust: [0.17, 0.12, 0.065],         // damp organic soil over water ice
    sand: [0.075, 0.050, 0.028],       // the dark dune sand
    scree: [0.20, 0.15, 0.09],
    rock: [0.26, 0.21, 0.15],          // water-ice bedrock, dirty
    strata: null,
    slopes: { dustMax: 0.30, screeMin: 0.45, screeMax: 0.65, rockMin: 0.85 },
    sandBelow: -60, sandFade: 120,     // sand fills the low ground
    cover: { sandLow: 0.92, sandMin: 0.02, contrast: 0.8 },
    ripples: { wavelength: 0.9, strength: 0.25, direction: 0, onDust: 0.2 },
    detailStrength: 0.5,
    // rounded cobbles of ice, as in the one picture from the ground
    rocks: { count: 520, radius: 60, size: [0.05, 0.45], albedo: [0.24, 0.19, 0.13] },
  },

  // Nitrogen air four times as dense at the ground as ours, with orange smog all the way
  // up: the Sun is a faint smear and all the light is the sky's.
  atmosphere: {
    topAltitude: 400000,
    surfaceDensity: 5.4,
    occluderAltitude: 0,
    rayleigh: { scattering: [0.6e-6, 1.4e-6, 3.3e-6], scaleHeight: 20000 },
    dust: {
      // the haze: optical depth about 3 in red light and 8 in blue from the ground up,
      // swallowing blue (which is why everything is orange)
      scattering: [5.2e-5, 5.8e-5, 6.0e-5],
      absorption: [0.25e-5, 1.3e-5, 5.0e-5],
      phaseG: [0.6, 0.6, 0.6],
      scaleHeight: 60000,
      fog: { density: 0.25, baseAltitude: -700, scaleHeight: 3000 },
    },
    absorber: null,
  },

  sky: { stars: { url: 'data/stars_bsc5.f32' } },

  scene: {
    dateUTC: '2005-01-14T11:30:00Z',   // the morning Huygens landed
    // Where Huygens came down: a dry lake bed strewn with ice cobbles on the edge of the
    // dark plain Shangri-La (10.3 S, 192.3 W).
    start: { lat: -10.3, lon: 167.7, eye: 1.7, heading: 160, pitch: 0 },
    ship: { east: 30, north: -22, heading: 120 },
    exposure: { key: 0.16, min: 0.5, max: 6.0e6, speed: 1.6, shadowFloor: 0.2, highlight: 6 },
    bookmarks: {
      ledge: { label: 'The Huygens landing place', heading: 160, pitch: 0, fov: 60 },
      sun: { label: 'The Sun through the smog', heading: 90, pitch: 30, fov: 60 },
      wall: { label: 'The hills to the north', heading: 350, pitch: 2, fov: 40 },
      ship: { label: 'The lander', east: 14, north: -8, heading: 120, pitch: 2, fov: 50 },
      dusk: { label: 'Dusk on Titan', heading: 270, pitch: 8, fov: 60, timeOffsetHours: 90 },
      dunes: { label: 'The Belet sand sea', lat: -6.0, lon: 105.0, heading: 20, pitch: -6, fov: 60, timeOffsetHours: 30 },
      xanadu: { label: 'Xanadu, the bright highland', lat: -8.0, lon: 255.0, heading: 60, pitch: -4, fov: 55, timeOffsetHours: -60 },
    },
  },
  places: [
    { id: 'huygens', name: 'Huygens landing place', fact: 'The farthest landing ever made: the Huygens probe came down here in January 2005.', lat: -10.3, lon: 167.7 },
    { id: 'belet', name: 'Belet sand sea', fact: 'A sea of dark sand dunes 100 m high, as large as the Sahara\'s.', lat: -6.0, lon: 105.0 },
    { id: 'xanadu', name: 'Xanadu', fact: 'A bright highland the size of Australia.', lat: -10.0, lon: 260.0 },
    { id: 'kraken', name: 'Kraken Mare (methane sea)', fact: 'A sea of liquid methane larger than the Caspian.', lat: 68.0, lon: 50.0 },
    { id: 'ligeia', name: 'Ligeia Mare', fact: 'A methane sea so calm that radar saw it as a mirror.', lat: 79.0, lon: 112.0 },
    { id: 'selk', name: 'Selk crater (Dragonfly\'s goal)', fact: 'The Dragonfly rotorcraft is due to explore this crater in the 2030s.', lat: 7.0, lon: 161.0 },
  ],
};
