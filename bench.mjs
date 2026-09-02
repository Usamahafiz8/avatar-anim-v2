const pw = await import('/Users/cybillnerd/Desktop/zack/blackjack-pwa/node_modules/playwright/index.js');
const chromium = (pw.default ?? pw).chromium;
const browser = await chromium.launch({ args: ['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 3 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8088/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.getElementById('loading').classList.contains('done'));
// dev overlay is hidden by default; open it so the sweep can drive the controls
if (await page.evaluate(() => document.getElementById('dev').classList.contains('off')))
  await page.click('#devtoggle');

const renderer = await page.evaluate(() => {
  const gl = document.getElementById('gl').getContext('webgl2');
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('GPU:', renderer);
console.log('DPR: 3 (phone-like)  viewport: 420x900\n');

{
  console.log('--- RPM avatar ---');
  for (const n of [1, 2, 4, 6]) {
    await page.click(`#seg-count button[data-n="${n}"]`);
    await page.waitForTimeout(400);
    // keep everyone animating: worst realistic case, not an idle table
    const r = await page.evaluate(async (n) => {
      const S = window.__spike;
      const btns = [...document.querySelectorAll('#clip-buttons .act')];
      const iv = setInterval(() => btns[Math.floor(Math.random()*btns.length)].click(), 700);
      const t = [];
      let last = performance.now();
      await new Promise(res => {
        const loop = () => { const now = performance.now(); t.push(now - last); last = now;
          if (now - t0 < 3000) requestAnimationFrame(loop); else res(); };
        const t0 = performance.now(); requestAnimationFrame(loop);
      });
      clearInterval(iv);
      t.sort((a,b)=>a-b);
      const med = t[Math.floor(t.length/2)];
      const p95 = t[Math.floor(t.length*0.95)];
      return { fps: 1000/med, low: 1000/p95,
               calls: S.renderer.info.render.calls, tris: S.renderer.info.render.triangles };
    }, n);
    console.log(`  ${n} char  ${r.fps.toFixed(0).padStart(3)} fps   5% low ${r.low.toFixed(0).padStart(3)}   ${String(r.calls).padStart(3)} calls   ${r.tris.toLocaleString().padStart(7)} tris`);
  }
}
console.log('\nerrors:', errs.length ? errs : 'none');
await browser.close();
