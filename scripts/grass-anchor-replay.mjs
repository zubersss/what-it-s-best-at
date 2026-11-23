// How far a tuft stands from the ground its height was taken from, by the height D of the
// grass's anchor plane over the ground, on a world of radius R (no browser; plain arithmetic
// of life/grass.js: a place x metres out on the plane is sampled along the line from the
// world's centre through it, and drawn x metres from the anchor's own line at the ground).
//   node scripts/grass-anchor-replay.mjs [--radius 250000]
const ri = process.argv.indexOf('--radius'), R = ri > 0 ? +process.argv[ri + 1] : 250000;
let bad = false;
for (const D of [0, 500, 1000]) {
  const row = [];
  for (const x of [34, 200, 520]) {
    const sampled = R * Math.atan2(x, R + D);          // the ground place the line through the plane's point meets (arc from the anchor's foot)
    const drawn = R * Math.atan2(x, R);               // where the tuft is drawn: x metres from the anchor's line, on the ground
    row.push(`${x} m out: ${(drawn - sampled).toFixed(3)} m`);
    if (D === 0 && Math.abs(drawn - sampled) > 0.01) bad = true;
  }
  // a step of 200 m (the old rule) or 60 m (now): the field's shift when the plane's foot moves
  console.log(`anchor ${D} m over the ground: ${row.join(', ')}; the whole field aside at a step of 200 m: ${(200 * D / (R + D)).toFixed(3)} m, of 60 m: ${(60 * D / (R + D)).toFixed(3)} m`);
}
if (bad) { console.error('FAILED: with the anchor on the ground a tuft must stand where its height was taken'); process.exit(1); }
