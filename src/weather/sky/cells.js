// Where and when a storm cell is born, and what it is (docs/briefs/clouds-weather-plan.md,
// "CELLS"): a closed form, so the same storms stand in the same places on every machine and at
// any jump of the clock, and no cell can appear because the traveller came near.
//
// A CANDIDATE is a (trigger site, half-hour slot) pair. It exists when a hash of the two falls
// under the chance the weather at that site and moment gives (instability and moisture, the
// local hour, higher over heated or windward high ground). Each candidate carries a priority,
// also from the hash, and is then
//   blocked  if a candidate of higher priority exists within `apart` whose life overlaps its own
//            (no two storms side by side), and
//   capped   if `maxAlive` unblocked candidates of higher priority have lives overlapping its
//            own (the world holds no more storms than that at once).
// Both tests look only at candidates within SLOT_REACH slots, and neither asks the time the
// question is put at, so a cell's existence is fixed for good the moment its slot is reached:
// nothing pops in or out as the clock runs, and a window split in two gives the same cells.
// (A cell lives at most grow + mature + decay = 90 min = 3 slots, so two cells alive at one
// moment were born within 3 slots of each other: the cap therefore holds at every moment, which
// is what scripts/sky-model-test.mjs measures.)
//
// Sites: the proud high ground and the sea-breeze line (land.js makeSites), and points along
// the fronts of the live lows (at any hour; the others only in the afternoon).
//
// Pure: no three, no DOM, no Math.random. Nothing here knows where the traveller is.
import { hash3 } from '../../terrain/height/noise.js';
import { CELL, CELL_KIND, cellLife, makeCellLife } from './format.js';
import { dirOf, latOf, lonOf, offsetDir, angleBetween } from './land.js';

export const CELL_DEFAULTS = Object.freeze({
  slot: 1800,                 // s: a site may fire once a slot
  hours: [13, 19],            // local solar hours over land (a front's cells: any hour)
  chance: 0.22,               // the most a site's slot can fire with
  instability: [0.5, 0.9],    // the chance climbs with instability x moisture between these
  boost: 1.6,                 // times that over heated or windward high ground
  apart: 40000,               // m: no two live cells nearer than this
  maxAlive: 8,                // the most alive in the world at one moment (the plan's cap within 200 km)
  radius: [2500, 5000],       // m
  top: [6500, 11000],         // m above the sea, by instability
  grow: 1200, mature: [1500, 2400], decay: 1800,     // s
  rain: [15, 45],             // mm/h in the core at its peak
  core: 0.6,                  // the core's radius, a share of the tower's
  flash: [2, 12],             // flashes a minute when mature
  downwind: [2000, 5000],     // m downwind of its site that it is born
  frontEvery: 50000,          // m along a front between its candidate points
  frontChance: 0.5,           // times the chance, on a front
});

export const SLOT_REACH = 3;          // slots: how far the blocking and the cap look

// The slots that hold every cell alive at some time in [ta, tb] (the longest life is three
// slots): asked for as whole slots, so the answer holds for half an hour of game time and a
// question put every frame costs nothing.
export const slotsFor = (cfg, ta, tb) => [Math.floor((ta - (cfg.grow + cfg.mature[1] + cfg.decay)) / cfg.slot), Math.floor(tb / cfg.slot)];
const CH = { FIRE: 21, PRI: 22, RADIUS: 23, TOP: 24, MATURE: 25, RAIN: 26, FLASH: 27, WAY: 28, FAR: 29 };
const u01 = (a, b, ch, seed) => hash3(a, b * 7919 + ch, 0x3ab1, seed) / 4294967296;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// The candidates of the slots [k0 - SLOT_REACH, k1 + SLOT_REACH], each with where it is, when it
// is born and its priority; then blocked and capped worked out. Everything it needs of the
// weather comes through `ask(lat, lon, t)`, which must answer { instab, hum, lift, hour, land,
// prom, windE, windN } (the model's climate at a place and time).
// It must also answer `cold` (how near a cold front's line) for the front's own candidates.
//   cfg: CELL_DEFAULTS with the world's own numbers; sites: land.js makeSites' list;
//   fronts(t): the points of the live fronts at t (the model's), each { x, y, z, lat, lon, id };
//   R: the world's radius (m)
export function candidates(cfg, seed, sites, ask, fronts, k0, k1, R, hourOf) {
  const list = [];
  const slot = cfg.slot;
  for (let k = k0 - SLOT_REACH; k <= k1 + SLOT_REACH; k++) {
    const t = k * slot;
    // the fixed sites: the afternoon over land
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      // the cheap tests first, and the weather at the site last: it is the dear one, and all but
      // a few dozen of a thousand sites are out of the afternoon window or never fire at all
      const u = u01(i + 1, k, CH.FIRE, seed);
      if (u >= cfg.chance * cfg.boost) continue;
      const hour = hourOf(s.lon, t);
      if (hour < cfg.hours[0] || hour >= cfg.hours[1]) continue;
      const a = ask(s.lat, s.lon, t);
      if (a.land < 0.5) continue;
      const heated = s.prom > 400 || a.lift > 0.4;
      const p = ss(cfg.instability[0], cfg.instability[1], a.instab * a.hum) * cfg.chance * (heated ? cfg.boost : 1);
      if (u >= p) continue;
      list.push(make(cfg, seed, i + 1, k, t, s.lat, s.lon, a, s.kind === 1 ? CELL_KIND.SEA_BREEZE : CELL_KIND.HIGH_GROUND, s.prom, R));
    }
    // the fronts: at any hour, where the air is moist enough
    const fp = fronts ? fronts(t) : [];
    for (let i = 0; i < fp.length; i++) {
      const f = fp[i], site = -(1 + (((f.id * 131 + i) % 100000) | 0));
      const u = u01(site, k, CH.FIRE, seed);
      if (u >= cfg.chance * cfg.frontChance) continue;
      const a = ask(f.lat, f.lon, t);
      const p = ss(cfg.instability[0], cfg.instability[1], Math.max(a.instab, 0.45 * a.cold) * a.hum) * cfg.chance * cfg.frontChance;
      if (u >= p) continue;
      list.push(make(cfg, seed, site, k, t, f.lat, f.lon, a, CELL_KIND.FRONT, 0, R));
    }
  }
  // blocked: a stronger candidate too near, with a life that overlaps (a squared chord, so
  // nothing trigonometric is worked out for what can be thousands of pairs)
  const lim = (2 * Math.sin(Math.min(Math.PI / 2, cfg.apart / (2 * R)))) ** 2;
  const bySlot = new Map();
  for (const c of list) { const a = bySlot.get(c.slot) || []; a.push(c); bySlot.set(c.slot, a); }
  for (const c of list) {
    for (let k = c.slot - SLOT_REACH; k <= c.slot + SLOT_REACH && !c.blocked; k++) {
      const a = bySlot.get(k);
      if (!a) continue;
      for (const d of a) {
        if (d === c || d.pri <= c.pri) continue;
        const dx = d.x - c.x, dy = d.y - c.y, dz = d.z - c.z;
        if (dx * dx + dy * dy + dz * dz < lim) { c.blocked = true; break; }
      }
    }
  }
  // capped: too many stronger ones alive at the same time
  for (const c of list) {
    let n = 0;
    for (let k = c.slot - SLOT_REACH; k <= c.slot + SLOT_REACH; k++) {
      const a = bySlot.get(k);
      if (!a) continue;
      for (const d of a) if (d !== c && !d.blocked && d.pri > c.pri) n++;
    }
    c.capped = n >= cfg.maxAlive;
  }
  return list;
}

function make(cfg, seed, site, k, t, lat, lon, a, kind, prom, R) {
  const u = (ch) => u01(site, k, ch, seed);
  // born a few km downwind of its site
  const windL = Math.hypot(a.windE, a.windN) || 1;
  const bearing = Math.atan2(a.windE / windL, a.windN / windL);
  const dist = cfg.downwind[0] + (cfg.downwind[1] - cfg.downwind[0]) * u(CH.WAY);
  const d = offsetDir(dirOf(lat, lon), bearing, dist, R, [0, 0, 0]);
  const instab = clamp(a.instab, 0, 1);
  return {
    site, slot: k, born: t, pri: u01(site, k, CH.PRI, seed), blocked: false, capped: false, kind,
    x: d[0], y: d[1], z: d[2], lat: latOf(d), lon: lonOf(d), prom,
    radius: cfg.radius[0] + (cfg.radius[1] - cfg.radius[0]) * (0.35 * u(CH.RADIUS) + 0.65 * instab),
    top: cfg.top[0] + (cfg.top[1] - cfg.top[0]) * clamp(0.3 * u(CH.TOP) + 0.7 * instab, 0, 1),
    grow: cfg.grow, mature: cfg.mature[0] + (cfg.mature[1] - cfg.mature[0]) * u(CH.MATURE), decay: cfg.decay,
    rain: cfg.rain[0] + (cfg.rain[1] - cfg.rain[0]) * clamp(0.4 * u(CH.RAIN) + 0.6 * a.hum, 0, 1),
    core: cfg.core, flash: cfg.flash[0] + (cfg.flash[1] - cfg.flash[0]) * clamp(0.4 * u(CH.FLASH) + 0.6 * instab, 0, 1),
    seedOwn: (hash3(site, k, 0x7f4a, seed) >>> 0),
  };
}
// The records (format.js CELL) of every cell born in the slots [k0, k1], in a fixed order: the
// caller asks for the slots a window needs (slotsFor below), so that a window moving on by a
// frame asks the same question and the answer can be kept.
export function cellRecords(cfg, seed, sites, ask, fronts, k0, k1, R, hourOf) {
  const list = candidates(cfg, seed, sites, ask, fronts, k0, k1, R, hourOf);
  const out = [];
  for (const c of list) {
    if (c.blocked || c.capped) continue;
    if (c.slot < k0 || c.slot > k1) continue;
    out.push(
      (c.site > 0 ? c.site : 1000000 - c.site) * 1048576 + (((c.slot % 1048576) + 1048576) % 1048576),
      c.seedOwn, c.born, c.x, c.y, c.z, c.radius, c.top, c.grow, c.mature, c.decay, c.rain, c.core, c.flash,
      c.site, c.kind,
    );
  }
  return Float64Array.from(out);
}

// Where a cell is at t: carried rigidly by the cell layer's steering from its birth point.
export function cellPlace(steer, rec, o, t, out = [0, 0, 0]) {
  if (rec[o + CELL.KIND] === CELL_KIND.STILL) { out[0] = rec[o + CELL.X]; out[1] = rec[o + CELL.Y]; out[2] = rec[o + CELL.Z]; return out; }
  return steer.carry('cell', rec[o + CELL.BORN], t, [rec[o + CELL.X], rec[o + CELL.Y], rec[o + CELL.Z]], out);
}

// The cells alive at t as plain objects (the field's cells(t)): their place, their life, the base
// and top of their tower. baseAt(lat, lon): the low cloud's base there (the model's).
export function cellsAlive(steer, rec, t, baseAt, R) {
  const out = [];
  const life = makeCellLife(), at = [0, 0, 0];
  for (let o = 0; o < rec.length; o += CELL.STRIDE) {
    cellLife(rec, o, t, life);
    if (!life.alive) continue;
    cellPlace(steer, rec, o, t, at);
    const lat = latOf(at), lon = lonOf(at), base = baseAt(lat, lon);
    const topMax = rec[o + CELL.TOP];
    out.push({
      id: rec[o + CELL.ID], seed: rec[o + CELL.SEED], born: rec[o + CELL.BORN], site: rec[o + CELL.SITE], kind: rec[o + CELL.KIND],
      x: at[0], y: at[1], z: at[2], lat, lon, age: life.age, phase: life.phase, stage: life.stage, strength: life.strength,
      rise: life.rise, radius: life.radius, core: life.core, rain: life.rain, rainPeak: rec[o + CELL.RAIN],
      flash: life.flash, end: life.end, base, topMax, top: base + life.rise * (topMax - base),
    });
  }
  void R;
  return out;
}
