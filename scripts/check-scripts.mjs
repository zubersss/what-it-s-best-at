// Every name a script imports from another file of this repository must be exported
// there. The build checks this for the game (src/), nothing did for scripts/: a helper
// rewritten under new names left the flicker check, the sketch and the relief probe
// unable to start for three deliveries, and nobody ran them to find out.
// Read as text, nothing is run.   node scripts/check-scripts.mjs   (part of build-check.sh)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name)) files.push(p); } };
walk(here);

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const cache = new Map();
// what a file exports: its names, whether it has a default, and whether it passes on all of another file's
function exportsOf(file) {
  if (cache.has(file)) return cache.get(file);
  const s = strip(fs.readFileSync(file, 'utf8')), names = new Set(); let all = false;
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // (several names in one statement: split at the commas that are not inside brackets)
  for (const m of s.matchAll(/export\s+(?:const|let|var)\s+/g)) {
    let depth = 0, part = '';
    const take = () => { const n = part.trim().match(/^[A-Za-z_$][\w$]*/); if (n) names.add(n[0]); part = ''; };
    for (let i = m.index + m[0].length; i < s.length; i++) {
      const ch = s[i];
      if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
      if (depth === 0 && ch === ',') take(); else if (depth === 0 && (ch === ';' || (ch === '\n' && /^\s*(export|import|function|const|let|class)\b/.test(s.slice(i + 1))))) { take(); break; } else part += ch;
    }
  }
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const t = n.trim().split(/\s+as\s+/).pop(); if (t) names.add(t); }
  if (/export\s+default\b/.test(s)) names.add('default');
  if (/export\s*\*\s*from/.test(s)) all = true;
  const r = { names, all }; cache.set(file, r); return r;
}

let bad = 0, checked = 0;
for (const f of files) {
  const s = strip(fs.readFileSync(f, 'utf8'));
  for (const m of s.matchAll(/import\s+([^;'"]*?)\s+from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(f), m[2]);
    const rel = `${path.relative(path.dirname(here), f)} imports from ${m[2]}`;
    if (!fs.existsSync(target)) { console.log(`${rel}: no such file`); bad++; continue; }
    if (!/\.m?js$/.test(target)) continue;
    const ex = exportsOf(target); if (ex.all) continue;
    const want = [];
    const braces = m[1].match(/\{([^}]*)\}/);
    if (braces) for (const n of braces[1].split(',')) { const t = n.trim().split(/\s+as\s+/)[0]; if (t) want.push(t); }
    const rest = m[1].replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+[\w$]+/, '').replace(/,/g, '').trim();
    if (rest) want.push('default');
    for (const n of want) { checked++; if (!ex.names.has(n)) { console.log(`${rel}: "${n}" is not exported there`); bad++; } }
  }
}
console.log(`scripts: ${files.length} files, ${checked} imported names checked, ${bad} missing`);
process.exit(bad ? 1 : 0);
