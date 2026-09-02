// Download the 3D assets this spike needs.
//
// They are NOT committed, deliberately. The Ready Player Me animation library
// licence, clause 3: "You may not redistribute, sell, or otherwise transfer the
// Animations, in whole or in part, to any third party." Committing them to a
// git repo is redistribution. So we fetch them from Ready Player Me's own
// public repos at setup time instead.
//
//   node fetch-assets.mjs
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(__filename);
const LIB  = 'https://cdn.jsdelivr.net/gh/readyplayerme/animation-library@master';
const ANIM = `${LIB}/feminine/glb`;

// avatar bodies -------------------------------------------------------------
// The two characters are the animation library's OWN T-pose bodies. That is the
// whole point: the clips were authored against this exact 70-bone rig, so they
// land on it correctly. Both ship as ONE merged material with zero morph
// targets, so each takes only an overall tint and neither has facial
// expressions — a limit of the free asset, not of the code.
const AVATARS = [
  ['models/rpm/Masculine.glb',
   `${LIB}/masculine/glb/Masculine_TPose.glb`],
  ['models/rpm/Feminine.glb',
   `${ANIM}/Feminine_TPose.glb`],
];

// animation clips -----------------------------------------------------------
// Only what is actually used. RPM's "Standing Expressions" set was dropped
// wholesale: measured across five joints, every one of them moves 0.8-1.4
// against 4.7-9.3 for the dances, so they read as near-static poses on a
// character this size.
const CLIPS = [
  ['idle',  ['F_Standing_Idle_001']],
  ['dance', ['F_Dances_001', 'F_Dances_004', 'F_Dances_005', 'F_Dances_006']],
  ['expression', ['M_Standing_Expressions_012', 'M_Standing_Expressions_007', 'F_Talking_Variations_001']],   // Angry, Lose, Laugh
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

console.log('avatars:');
for (const [dest, url] of AVATARS) await get(dest, url);

console.log('clips:');
for (const [folder, names] of CLIPS)
  for (const n of names) await get(`models/rpm/clips/${n}.glb`, `${ANIM}/${folder}/${n}.glb`);

console.log('\ndone. now: node serve.mjs');
