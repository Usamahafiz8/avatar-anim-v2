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
// Only what is actually used — and only after being screenshot-verified on
// this rig, not picked by filename alone. RPM's "Standing Expressions" set
// (Angry, Lose) mostly stays dropped: 012's "Angry" is a literal thumbs-up,
// 015's replacement held its pose for well under a second before settling
// back to neutral, and Lose's bow/facepalm had the same problem — neither
// read as its label. Every Talking_Variations file tried reads as generic
// talking/shrugging, never a laugh — no "Laugh"/"Talking" entry exists for
// that reason. F_Dances_005 (Celebrate) was re-tried and DOES read as a
// genuine cheer this time — a fresh look overturned the old verdict on that
// one specifically. A second pass added 4 more Dance 2-5 clips (also
// screenshot-verified) after a further sweep of Standing_Expressions and
// jump/locomotion clips came up empty again; see CLIP_FILES in index.html
// for the reasoning per clip. A third pass reviewed full motion-arc filmstrips
// (not just single frames) of the remaining untried Standing_Expressions
// clips and found two that finally read as distinct: 006 (arms flare out,
// fists clench — Angry) and 007 (leans forward, hand to face — Stressed).
// A fourth pass gave the same filmstrip treatment to all 10 Talking_Variations
// clips (never fully reviewed before) — masculine/feminine glb/expression
// folders turned out byte-identical to what's already covered, but two of
// the 10 talking clips had sustained motion: 004 (hands clasp at chest) and
// 009 (arm raises, hailing) were left out as redundant with Stressed/Wave;
// 010 (both arms out, open-palm shrug) is genuinely new — no reaction here
// reads as "I don't know"/confused — so it's in as Confused. The 6
// feminine-specific Talking_Variations clips were checked too: 001/002/005
// are static, 004 duplicates the male hands-clasped pose, and 003/006 are
// near-duplicates of each other (arms flung wide, held — "ta-da!"). Only
// one of that duplicate pair is worth adding: 003, as Ta-da.
//
// Fifth pass: explicitly asked for EVERY remaining clip in expression/,
// regardless of the quality bar above — so every M_Standing_Expressions,
// M_Talking_Variations and F_Talking_Variations file not already covered is
// now included too. Many of these are the ones earlier passes screened out
// (brief pose that settles back to neutral within ~1s, or near-static) —
// that verdict doesn't change just because they're now in the picker, so
// don't be surprised if some buttons look like they barely do anything.
const CLIPS = [
  ['idle',       ['F_Standing_Idle_001']],
  ['dance',      ['F_Dances_001', 'F_Dances_005', 'F_Dances_007', 'M_Dances_008',
                  'M_Dances_004', 'M_Dances_006', 'M_Dances_007', 'M_Dances_009']],
  ['locomotion', ['F_Walk_002']],
  ['expression', ['M_Standing_Expressions_001', 'M_Standing_Expressions_002',
                  'M_Standing_Expressions_004', 'M_Standing_Expressions_005',
                  'M_Standing_Expressions_006', 'M_Standing_Expressions_007',
                  'M_Standing_Expressions_008', 'M_Standing_Expressions_009',
                  'M_Standing_Expressions_010', 'M_Standing_Expressions_011',
                  'M_Standing_Expressions_012', 'M_Standing_Expressions_013',
                  'M_Standing_Expressions_014', 'M_Standing_Expressions_015',
                  'M_Standing_Expressions_016', 'M_Standing_Expressions_017',
                  'M_Standing_Expressions_018',
                  'M_Talking_Variations_001', 'M_Talking_Variations_002',
                  'M_Talking_Variations_003', 'M_Talking_Variations_004',
                  'M_Talking_Variations_005', 'M_Talking_Variations_006',
                  'M_Talking_Variations_007', 'M_Talking_Variations_008',
                  'M_Talking_Variations_009', 'M_Talking_Variations_010',
                  'F_Talking_Variations_001', 'F_Talking_Variations_002',
                  'F_Talking_Variations_003', 'F_Talking_Variations_004',
                  'F_Talking_Variations_005', 'F_Talking_Variations_006']],
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
