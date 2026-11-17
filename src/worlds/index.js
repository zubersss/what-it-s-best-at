// World registry. Adding a world = adding one data file and one line here.
import mars from './mars.js';
import moon from './moon.js';

export const WORLDS = { mars, moon };

export function getWorld(id) {
  const w = WORLDS[id];
  if (!w) throw new Error(`Unknown world "${id}". Known: ${Object.keys(WORLDS).join(', ')}`);
  return w;
}
