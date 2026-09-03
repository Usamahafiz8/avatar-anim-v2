// Download EVERY clip in two source folders of Ready Player Me's animation
// library, for the browse-all reference pages (dance-gallery.html /
// expression-gallery.html) — as opposed to fetch-assets.mjs, which only
// pulls the handful of clips demo.html/index.html actually use.
//
// Same licence situation as fetch-assets.mjs (RPM animation-library licence
// clause 3: no redistributing the Animations) — these are NOT committed
// either. See .gitignore.
//
//   node fetch-gallery-assets.mjs
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(__filename);
const LIB  = 'https://cdn.jsdelivr.net/gh/readyplayerme/animation-library@master';

// Every file in feminine/glb/dance (readme.md excluded).
const DANCE = [
  'F_Dances_001','F_Dances_004','F_Dances_005','F_Dances_006','F_Dances_007',
  'M_Dances_001','M_Dances_002','M_Dances_003','M_Dances_004','M_Dances_005',
  'M_Dances_006','M_Dances_007','M_Dances_008','M_Dances_009','M_Dances_011',
];
// Every file in masculine/glb/expression (readme.md excluded). That folder
// mixes F_/M_ Talking Variations with M_ Standing Expressions — that's how
// the source repo organizes it.
const EXPRESSION = [
  'F_Talking_Variations_001','F_Talking_Variations_002','F_Talking_Variations_003',
  'F_Talking_Variations_004','F_Talking_Variations_005','F_Talking_Variations_006',
  'M_Standing_Expressions_001','M_Standing_Expressions_002','M_Standing_Expressions_004',
  'M_Standing_Expressions_005','M_Standing_Expressions_006','M_Standing_Expressions_007',
  'M_Standing_Expressions_008','M_Standing_Expressions_009','M_Standing_Expressions_010',
  'M_Standing_Expressions_011','M_Standing_Expressions_012','M_Standing_Expressions_013',
  'M_Standing_Expressions_014','M_Standing_Expressions_015','M_Standing_Expressions_016',
  'M_Standing_Expressions_017','M_Standing_Expressions_018',
  'M_Talking_Variations_001','M_Talking_Variations_002','M_Talking_Variations_003',
  'M_Talking_Variations_004','M_Talking_Variations_005','M_Talking_Variations_006',
  'M_Talking_Variations_007','M_Talking_Variations_008','M_Talking_Variations_009',
  'M_Talking_Variations_010',
];

const FOLDERS = [
  ['dance',      'feminine/glb/dance',        DANCE],
  ['expression', 'masculine/glb/expression',  EXPRESSION],
];

const exists = async p => { try { await stat(p); return true; } catch { return false; } };

async function get(dest, url) {
  const full = join(ROOT, dest);
  if (await exists(full)) { console.log(`  skip   ${dest}`); return; }
  await mkdir(dirname(full), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) { console.error(`  FAIL   ${dest}  (${res.status})`); return; }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString() !== 'glTF') {
    console.error(`  FAIL   ${dest}  (not a GLB — LFS pointer or an error page?)`);
    return;
  }
  await writeFile(full, buf);
  console.log(`  ok     ${dest}  ${(buf.length / 1024).toFixed(0)} KB`);
}

for (const [localFolder, repoFolder, names] of FOLDERS) {
  console.log(`${localFolder}:`);
  for (const n of names)
    await get(`models/rpm/gallery/${localFolder}/${n}.glb`, `${LIB}/${repoFolder}/${n}.glb`);
}

console.log('\ndone. open dance-gallery.html / expression-gallery.html via `node serve.mjs`.');
