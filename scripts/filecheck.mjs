import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const msgs = [];
page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));

await page.goto('file:///C:/Users/jsale/source/repos/hyperdims/dist/index.html', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2500));

const check = await page.evaluate(() => ({
  canvas: !!document.querySelector('canvas'),
  guiSelects: document.querySelectorAll('.lil-gui select').length,
  demoOptions: [...(document.querySelector('.lil-gui select')?.options ?? [])].map((o) => o.text),
  api: typeof window.hyperdims?.set === 'function',
}));
console.log(JSON.stringify(check, null, 2));

// Switch to the Lissajous demo through the real UI to prove interactivity works from file://
await page.evaluate(() => {
  const sel = document.querySelector('.lil-gui select');
  sel.value = [...sel.options].find((o) => o.text.startsWith('Lissajous')).value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({
  path: 'C:/Users/jsale/source/repos/hyperdims/shots/08_filedirect_lissajous.png',
});
console.log('screenshot saved (Lissajous via file://)');
console.log('console:', msgs.length ? msgs.join('\n') : '(clean)');
await browser.close();
