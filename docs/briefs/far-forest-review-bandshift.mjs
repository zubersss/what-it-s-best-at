// Does the main thread's tile selection (farForest.update) find the tile that really owns each block?
import { blockDeg, blockLon } from '../../src/life/treeBlock.js';
const BASE_BLOCKS = 8, BAND = 4, LEVELS = 4;
const band = (level) => [level >= LEVELS - 1 ? 0 : BAND ** -(level + 1), BAND ** -level];
function run(name, R, lat, lon, full = 450, radius = 5600) {
  const DEG = blockDeg(R), M = R * Math.PI / 180, cosLat = Math.cos(lat * Math.PI / 180);
  console.log(`\n${name}: R ${R / 1000} km, lat ${lat}, lon ${lon}; a block is ${DEG.toFixed(5)} deg`);
  for (let L = 0; L < LEVELS; L++) {
    const [lo] = band(L), blocks = BASE_BLOCKS * 2 ** L, side = blocks * DEG * M;
    const reach = Math.min(radius, lo > 0 ? full / Math.sqrt(lo) : radius);
    const tDeg = blocks * DEG, ti0 = Math.floor(lat / tDeg), nt = Math.ceil(reach / side) + 1;
    const want = new Set();
    for (let ti = ti0 - nt; ti <= ti0 + nt; ti++) {
      const dLon = blockLon(ti * blocks, DEG), tLon = dLon * blocks, rows = Math.ceil(Math.round(360 / dLon) / blocks), tj0 = Math.floor(lon / tLon);
      for (let tu = tj0 - nt; tu <= tj0 + nt; tu++) {
        const dy = ((ti + 0.5) * tDeg - lat) * M, dx = ((tu + 0.5) * tLon - lon) * M * cosLat;
        const near = Math.hypot(Math.max(0, Math.abs(dx) - side / 2), Math.max(0, Math.abs(dy) - side / 2));
        if (near > reach) continue;
        const tj = ((tu % rows) + rows) % rows; want.add(ti + ':' + tj);
      }
    }
    // sample the ground within this level's reach: which tile really owns the block there?
    let n = 0, miss = 0, worst = 0; const inner = L ? reach / 2 : 0;
    for (let y = -reach; y <= reach; y += 37) for (let x = -reach; x <= reach; x += 37) {
      const d = Math.hypot(x, y); if (d > reach * 0.98 || d < inner) continue;
      const la = lat + y / M, lo2 = lon + x / (M * Math.cos(la * Math.PI / 180));
      const bi = Math.floor(la / DEG), bj = Math.floor(lo2 / blockLon(bi, DEG));
      const key = Math.floor(bi / blocks) + ':' + Math.floor(bj / blocks);
      n++; if (!want.has(key)) { miss++; }
    }
    // how far a straddling tile's rows are apart
    let shift = 0;
    for (let ti = ti0 - 1; ti <= ti0 + 1; ti++) { const a = blockLon(ti * blocks, DEG), b = blockLon(ti * blocks + blocks - 1, DEG); const bj = Math.floor(lon / a); shift = Math.max(shift, Math.abs(bj * (a - b)) * M * cosLat); }
    console.log(`  level ${L}: tile ${(side).toFixed(0)} m, reach ${reach} m, ${want.size} tiles wanted; ground in reach whose owning tile is NOT wanted: ${(miss / n * 100).toFixed(1)} % ; first and last row of a tile here stand up to ${shift.toFixed(0)} m apart in longitude`);
  }
}
run('Haven, the opening place', 250000, -48.56367, 49.04424);
run('Haven, the north wood', 250000, 22.983, 129.507);
run('Haven, the golden shore', 250000, 18.501, 132.671);
run('Haven, near longitude 0', 250000, -48.56367, 1.0);
run('Earth, Vermont 44.02N 287.2E (2 km from the 44th parallel)', 6371000, 44.02, 287.2);
run('Earth, Vermont 44.5N', 6371000, 44.5, 287.2);
