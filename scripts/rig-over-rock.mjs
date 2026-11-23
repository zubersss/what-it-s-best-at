// Flight over a boulder (no browser, a second): the rig's height over the ground must stay the land's (the speed law goes by it), its floor the rock's. Fails otherwise.

const { CameraRig } = await import('../src/controls/cameraRig.js');
const world = { radius: 250000, gravity: 9.8, surface: {}, scene: { start: { lat: 0, lon: 0 } } };
let rise = 0; const tor = (d) => { const x = d[1] * 250000; rise = Math.abs(x - 300) < 10 ? 18 : 0; return 100 + rise; };
const rig = new CameraRig(world, tor); rig.riseAt = () => rise;
rig.pos.set(250000 + 160, 0, 0); let bad = 0;
for (const y of [0, 290, 300, 310, 600]) { rig.pos.set(250160, y, 0).setLength(250160); rig._snapToGround(null); console.log(`y ${y}: agl ${rig.agl.toFixed(1)} floor ${rig.floor.toFixed(1)}`); if (Math.abs(rig.agl - 60) > 0.5) bad++; if (y === 300 && Math.abs(rig.floor - 42) > 0.5) bad++; }
console.log(bad ? 'FAILED' : 'agl stays the height over the land; the floor follows the rock'); process.exit(bad ? 1 : 0);
