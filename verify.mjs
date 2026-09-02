// Smoke test: no console errors, character framed correctly in BOTH framings,
// and every reaction returns to idle within the configured hold.
const pw = await import('/Users/cybillnerd/Desktop/zack/blackjack-pwa/node_modules/playwright/index.js');
const chromium = (pw.default ?? pw).chromium;
const browser = await chromium.launch({ args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'] });
const errors = [];
const page = await browser.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:3 });
page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: '+e.message));
await page.goto('http://127.0.0.1:8088/', { waitUntil:'networkidle' });
await page.waitForFunction(() => document.getElementById('loading').classList.contains('done'), {timeout:60000});
await page.evaluate(() => document.getElementById('devtoggle').click());

const geom = () => page.evaluate(() => {
  const S = window.__spike, THREE = S.THREE, a = S.avatars[0];
  const felt = document.getElementById('felt').getBoundingClientRect();
  a.root.updateMatrixWorld(true);
  const toPx = v => (1 - v.project(S.camera).y) / 2 * felt.height;
  let head=null, headTop=null;
  a.root.traverse(o => { if (o.name==='Head') head=o; if (o.name==='HeadTop_End') headTop=o; });
  const hp = head && headTop
    ? Math.round(toPx(new THREE.Vector3().setFromMatrixPosition(head.matrixWorld))
               - toPx(new THREE.Vector3().setFromMatrixPosition(headTop.matrixWorld))) : null;
  const bx = new THREE.Box3();
  a.root.traverse(o => { if (o.isSkinnedMesh) { o.computeBoundingBox(); bx.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  const feetPx = toPx(new THREE.Vector3(0, bx.min.y, 0));
  const deck = document.getElementById('deck').getBoundingClientRect();
  return { headPx: hp, headPct: hp ? +((hp/felt.height)*100).toFixed(1) : null,
           feetVsDeckTop: Math.round(feetPx - (deck.top - felt.top)) };
});

await page.click('#seg-framing button[data-f="portrait"]'); await page.waitForTimeout(400);
console.log('portrait :', JSON.stringify(await geom()), '  <- head size is what matters here');
await page.click('#seg-framing button[data-f="full"]');     await page.waitForTimeout(400);
console.log('full body:', JSON.stringify(await geom()), '  <- feet must sit on the deck');

console.log('buttons  :', await page.evaluate(() => [...document.querySelectorAll('#clip-buttons .act')].map(b=>b.textContent).join(', ')));

// every reaction must fade home inside the hold
for (const label of ['Dance 1','Dance 2','Dance 3','Celebrate','Angry','Laugh','Lose']) {
  const r = await page.evaluate(async (label) => {
    const a = window.__spike.avatars[0], idle = 'F_Standing_Idle_001';
    const t0 = performance.now();
    [...document.querySelectorAll('#clip-buttons .act')].find(b=>b.textContent===label).click();
    let saw=false;
    while (performance.now()-t0 < 6000) {
      await new Promise(r=>requestAnimationFrame(r));
      const c = a.current?.getClip().name;
      if (c && c !== idle) saw = true;
      if (saw && c === idle) return { label, backMs: Math.round(performance.now()-t0) };
    }
    return { label, backMs: null };
  }, label);
  console.log(`  ${r.label.padEnd(11)} home at ${r.backMs}ms`);
  await page.waitForTimeout(400);
}
console.log('errors   :', errors.length ? errors : 'none');
await browser.close();
