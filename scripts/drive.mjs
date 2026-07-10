import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOT_DIR = process.env.SHOT_DIR ?? join(repo, 'shots');
mkdirSync(SHOT_DIR, { recursive: true });
const EEG = readFileSync(join(repo, 'samples', 'eeg_7ch.csv'), 'utf8');
const TANGENT = readFileSync(join(repo, 'samples', 'tangent.csv'), 'utf8');

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--window-size=1600,1000'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const consoleMsgs = [];
page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${SHOT_DIR}/01_default_sine.png` });
console.log('shot 1: default sine demo');

// Helper: set a lil-gui select by visible option text
async function selectDemo(text) {
  await page.evaluate((t) => {
    const sel = [...document.querySelectorAll('.lil-gui select')].find((s) =>
      [...s.options].some((o) => o.text === t),
    );
    const opt = [...sel.options].find((o) => o.text === t);
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, text);
  await new Promise((r) => setTimeout(r, 1800));
}

// Probe: tangent demo — values passing through ±Infinity
await selectDemo('Tangent (through ±∞)');
await page.screenshot({ path: `${SHOT_DIR}/02_tangent_infinity.png` });
console.log('shot 2: tangent through infinity');

// Probe: line 1→100 (the PDF's first example)
await selectDemo('Line 1→100');
await page.screenshot({ path: `${SHOT_DIR}/03_line_demo.png` });
console.log('shot 3: line 1-100');

// Probe: logistic chaos at 7 dimensions, 10k points (the performance case)
await selectDemo('Logistic map (chaos)');
const genMs = await page.evaluate(() => {
  const t0 = performance.now();
  window.hyperdims.set({ dims: 7, numPoints: 10000 });
  return performance.now() - t0;
});
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: `${SHOT_DIR}/04_logistic_7d_10k.png` });
console.log(`shot 4: logistic 7D x 10k points — regenerate took ${genMs.toFixed(0)} ms`);

// Measure FPS with 10k points
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      function count() {
        frames++;
        if (performance.now() - start < 2000) requestAnimationFrame(count);
        else resolve((frames / (performance.now() - start)) * 1000);
      }
      requestAnimationFrame(count);
    }),
);
console.log(`FPS with 10k points x 7 dims: ${fps.toFixed(1)}`);

// Probe: drop the sample EEG CSV (2000 rows x 7 channels) onto the window
await page.evaluate((csvText) => {
  const file = new File([csvText], 'eeg_7ch.csv', { type: 'text/csv' });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, EEG);
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: `${SHOT_DIR}/05_eeg_csv_drop.png` });
console.log('shot 5: EEG CSV (7 channels) dropped');

// Probe: hover for tooltip — sweep pointer across the middle of the canvas
let tooltipText = '';
outer: for (const y of [400, 480, 560, 640]) {
  for (let x = 400; x <= 1200; x += 10) {
    await page.mouse.move(x, y);
    await new Promise((r) => setTimeout(r, 40));
    tooltipText = await page.evaluate(() => {
      const t = document.getElementById('tooltip');
      return t.style.display !== 'none' ? t.textContent : '';
    });
    if (tooltipText) break outer;
  }
}
console.log('tooltip:', tooltipText ? JSON.stringify(tooltipText.slice(0, 200)) : '(no point hit on sweep)');
await page.screenshot({ path: `${SHOT_DIR}/06_tooltip.png` });

// Probe: tangent sample with literal Infinity cells, lag-embedded to 3 dims
const infinityCheck = await page.evaluate((csvText) => {
  window.hyperdims.loadCSVText(csvText, 'tangent.csv');
  window.hyperdims.set({ csvMode: 'embed', csvColumn: 0, dims: 3, lag: 20, numPoints: 1400 });
  return { hasInfinity: csvText.includes('Infinity') };
}, TANGENT);
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: `${SHOT_DIR}/07_tangent_csv_embed.png` });
console.log('shot 7: tangent.csv embed mode, Infinity cells present:', infinityCheck.hasInfinity);

// Probe: 3D stereo cross-eyed mode — two side-by-side views
await page.evaluate(() => window.hyperdims.set({ stereo: true }));
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${SHOT_DIR}/08_stereo_crosseyed.png` });
console.log('shot 8: stereo cross-eyed mode');
await page.evaluate(() => window.hyperdims.set({ stereo: false }));

// Probe: GlyphViz export — build the CSVs in-page and sanity check them
const gv = await page.evaluate(() => {
  const files = window.hyperdims.buildGlyphViz();
  return {
    rows: files.rowsExported,
    nodes: files.nodeCount,
    nodeHeader: files.node.split('\n')[0],
    nodeLine1: files.node.split('\n')[1],
    tagHeader: files.tag.split('\n')[0],
    trackHeader: files.chTracks.split('\n')[0],
    nodeLines: files.node.trim().split('\n').length,
  };
});
const dims = 3;
const expectedNodes = 1 + gv.rows * (dims + 1) + (dims + 1);
console.log(
  `GlyphViz export: ${gv.rows} rows -> ${gv.nodes} nodes (expected ${expectedNodes}: ${gv.nodes === expectedNodes ? 'OK' : 'MISMATCH'})`,
);
console.log('  node header ok:', gv.nodeHeader.startsWith('id,type,parent_id,branch_level,translate_x'));
console.log('  tag header ok:', gv.tagHeader === 'id,table_id,record_id,title');
console.log('  track header ok:', gv.trackHeader.startsWith('cyclecount,ch0'));
console.log('  first node:', gv.nodeLine1);

// Probe: empty/garbage CSV drop — should not crash
await page.evaluate(() => {
  const file = new File(['not,a\nvalid file,"x'], 'garbage.csv', { type: 'text/csv' });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await new Promise((r) => setTimeout(r, 1500));
const aliveAfterGarbage = await page.evaluate(() => !!document.querySelector('canvas'));
console.log('garbage CSV drop survived:', aliveAfterGarbage);

console.log('--- console messages ---');
console.log(consoleMsgs.length ? consoleMsgs.join('\n') : '(none)');

await browser.close();
