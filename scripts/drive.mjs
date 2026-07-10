import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const SHOT_DIR = 'C:/Users/jsale/AppData/Local/Temp/claude/c--Users-jsale-source-repos-hyperdims/ae00071b-26ff-431a-90ea-3b1c8ba94047/scratchpad';
const EEG = readFileSync('c:/xampp/htdocs/antz/toroids/math/hyperdims/o1o2p8p4pzp3p7.csv', 'utf8');

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

// Probe: drop the real 47k-row EEG CSV onto the window
await page.evaluate((csvText) => {
  const file = new File([csvText], 'o1o2p8p4pzp3p7.csv', { type: 'text/csv' });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, EEG);
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: `${SHOT_DIR}/05_eeg_csv_drop.png` });
console.log('shot 5: EEG CSV (7 channels) dropped');

// Probe: hover for tooltip — sweep pointer across the middle of the canvas
let tooltipText = '';
for (let x = 500; x <= 1100 && !tooltipText; x += 20) {
  await page.mouse.move(x, 500);
  await new Promise((r) => setTimeout(r, 60));
  tooltipText = await page.evaluate(() => {
    const t = document.getElementById('tooltip');
    return t.style.display !== 'none' ? t.textContent : '';
  });
}
console.log('tooltip:', tooltipText ? JSON.stringify(tooltipText.slice(0, 200)) : '(no point hit on sweep)');
await page.screenshot({ path: `${SHOT_DIR}/06_tooltip.png` });

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
