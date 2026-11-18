// Download the BodyParts3D STL files that build.mjs uses (about 190 MB) into <outDir>.
// usage: node fetch.mjs <outDir>
// Source: BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 Japan
//         (STL mirror: https://github.com/Kevin-Mattheus-Moerman/BodyParts3D)
import fs from 'node:fs';

const outDir = process.argv[2] || 'stl';
const BASE = 'https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/main/assets/BodyParts3D_data/stl/';
const src = fs.readFileSync(new URL('./build.mjs', import.meta.url), 'utf8');
const ids = [...new Set(src.match(/\b(FMA\d+|BP\d+)\b/g))];

fs.mkdirSync(outDir, { recursive: true });
for (const id of ids) {
  const file = `${outDir}/${id}.stl`;
  if (fs.existsSync(file)) continue;
  const res = await fetch(BASE + id + '.stl');
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log('fetched', id);
}
console.log(ids.length, 'parts ready in', outDir);
