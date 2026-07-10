import GUI from 'lil-gui';
import { HCSViewer } from './render/viewer';
import { computePositions, type HCSConfig } from './hcs/geometry';
import { medianAbs, valueToAngle } from './hcs/mapping';
import { DEMO_NAMES, generateDemo, type Dataset, type DemoName } from './data/demos';
import { parseCSVText, datasetFromColumns, datasetFromEmbedding, type ParsedCSV } from './data/csv';

const container = document.getElementById('app')!;
const tooltip = document.getElementById('tooltip')!;
const dropHint = document.getElementById('drophint')!;
const viewer = new HCSViewer(container);

interface State {
  source: DemoName | 'CSV';
  numPoints: number;
  dims: number;
  lag: number;
  csvMode: 'columns' | 'embed';
  csvColumn: number;
  globalScale: number;
  autoScale: boolean;
  baseRadius: number;
  radiusRatio: number;
  pointSize: number;
  showLine: boolean;
  showGuides: boolean;
  probeIndex: number;
  play: boolean;
  speed: number;
}

const state: State = {
  source: 'Sine wave',
  numPoints: 2000,
  dims: 4,
  lag: 8,
  csvMode: 'columns',
  csvColumn: 0,
  globalScale: 1,
  autoScale: true,
  baseRadius: 100,
  radiusRatio: 0.4,
  pointSize: 1.2,
  showLine: true,
  showGuides: true,
  probeIndex: 0,
  play: false,
  speed: 200,
};

let csv: ParsedCSV | null = null;
let csvName = '';
let dataset: Dataset = { rows: [], columnNames: [] };
let cfg: HCSConfig = { baseRadius: state.baseRadius, radiusRatio: state.radiusRatio, scales: [] };
let playhead = 0;

function buildDataset(): Dataset {
  if (state.source === 'CSV') {
    if (!csv || csv.rows.length === 0) return { rows: [], columnNames: [] };
    return state.csvMode === 'embed'
      ? datasetFromEmbedding(csv, state.csvColumn, state.dims, state.lag, state.numPoints)
      : datasetFromColumns(csv, state.csvColumn, state.dims, state.numPoints);
  }
  return generateDemo(state.source, state.numPoints, state.dims, state.lag);
}

/** Per-dimension scale: globalScale, optionally × that dimension's median
 * magnitude so the median value of each column lands at 90°. */
function computeScales(ds: Dataset): number[] {
  const nDims = ds.rows[0]?.length ?? 0;
  const scales: number[] = [];
  for (let d = 0; d < nDims; d++) {
    let s = state.globalScale;
    if (state.autoScale) {
      const column = ds.rows.map((r) => r[d]);
      s *= medianAbs(column);
    }
    scales.push(s);
  }
  return scales;
}

function regenerate(): void {
  dataset = buildDataset();
  cfg = { baseRadius: state.baseRadius, radiusRatio: state.radiusRatio, scales: computeScales(dataset) };
  const { positions, valid } = computePositions(dataset.rows, cfg);
  viewer.setData(positions, valid);
  viewer.setPointSize(state.pointSize);
  viewer.setLineVisible(state.showLine);
  playhead = viewer.totalRows;
  probeCtrl.max(Math.max(0, viewer.totalRows - 1));
  state.probeIndex = Math.min(state.probeIndex, Math.max(0, viewer.totalRows - 1));
  probeCtrl.updateDisplay();
  updateGuides();
}

function updateGuides(): void {
  const row = dataset.rows[state.probeIndex];
  const plottable = row && row.length > 0 && row.every((v) => !Number.isNaN(v));
  viewer.showGuidesForRow(state.showGuides && plottable ? row : null, cfg);
}

// ---------------------------------------------------------------- GUI

const gui = new GUI({ title: 'Hyperdims' });

const dataFolder = gui.addFolder('Data');
const sourceCtrl = dataFolder
  .add(state, 'source', [...DEMO_NAMES, 'CSV'])
  .name('source')
  .onChange(regenerate);
dataFolder.add(state, 'numPoints', 10, 20000, 10).name('points').onFinishChange(regenerate);
dataFolder.add(state, 'dims', 1, 12, 1).name('dimensions').onFinishChange(regenerate);
dataFolder.add(state, 'lag', 1, 200, 1).name('lag (embedding)').onFinishChange(regenerate);
dataFolder
  .add({ loadCSV: () => fileInput.click() }, 'loadCSV')
  .name('load CSV file…');
const csvFolder = dataFolder.addFolder('CSV options');
csvFolder.add(state, 'csvMode', ['columns', 'embed']).name('mode').onChange(regenerate);
const csvColumnCtrl = csvFolder.add(state, 'csvColumn', 0, 0, 1).name('start column').onFinishChange(regenerate);
csvFolder.close();

const mapFolder = gui.addFolder('Mapping');
mapFolder.add(state, 'globalScale', 0.001, 1000).name('scale (value at 90°)').onFinishChange(regenerate);
mapFolder.add(state, 'autoScale').name('auto-scale (median→90°)').onChange(regenerate);

const geomFolder = gui.addFolder('Geometry');
geomFolder.add(state, 'baseRadius', 10, 500).name('base radius').onFinishChange(regenerate);
geomFolder.add(state, 'radiusRatio', 0.05, 0.9).name('radius ratio').onFinishChange(regenerate);

const displayFolder = gui.addFolder('Display');
displayFolder.add(state, 'pointSize', 0.1, 10).name('point size').onChange((v: number) => viewer.setPointSize(v));
displayFolder.add(state, 'showLine').name('trajectory line').onChange((v: boolean) => viewer.setLineVisible(v));
displayFolder.add(state, 'showGuides').name('dimension circles').onChange(updateGuides);
const probeCtrl = displayFolder.add(state, 'probeIndex', 0, 0, 1).name('probe point').onChange(updateGuides);

const animFolder = gui.addFolder('Animation');
animFolder.add(state, 'play').name('play');
animFolder.add(state, 'speed', 10, 5000).name('points / second');
animFolder
  .add({ restart: () => (playhead = 0) }, 'restart')
  .name('restart');

gui.add({ screenshot: saveScreenshot }, 'screenshot').name('save screenshot');

// ---------------------------------------------------------------- CSV load

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.csv,text/csv';
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadCSVFile(file);
});

function loadCSVFile(file: File): void {
  file.text().then((text) => {
    csv = parseCSVText(text);
    csvName = file.name;
    state.source = 'CSV';
    sourceCtrl.updateDisplay();
    csvColumnCtrl.max(Math.max(0, csv.columns.length - 1));
    csvFolder.open();
    document.querySelector('#title b')!.textContent = `HYPERDIMS · ${csvName}`;
    regenerate();
  });
}

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropHint.style.display = 'flex';
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) dropHint.style.display = 'none';
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dropHint.style.display = 'none';
  const file = e.dataTransfer?.files?.[0];
  if (file) loadCSVFile(file);
});

// ---------------------------------------------------------------- Tooltip

container.addEventListener('pointermove', (e: PointerEvent) => {
  const row = viewer.pickRow(e);
  if (row === null || !dataset.rows[row]) {
    tooltip.style.display = 'none';
    return;
  }
  const values = dataset.rows[row];
  const lines = [`point ${row}`];
  values.forEach((v, d) => {
    const name = dataset.columnNames[d] ?? `dim${d + 1}`;
    const theta = valueToAngle(v, cfg.scales[d] ?? 1);
    lines.push(`${name}: ${formatValue(v)}  →  ${theta.toFixed(1)}°`);
  });
  tooltip.textContent = lines.join('\n');
  tooltip.style.display = 'block';
  tooltip.style.left = `${e.clientX + 14}px`;
  tooltip.style.top = `${e.clientY + 14}px`;
});

container.addEventListener('click', (e: PointerEvent) => {
  const row = viewer.pickRow(e);
  if (row !== null) {
    state.probeIndex = row;
    probeCtrl.updateDisplay();
    updateGuides();
  }
});

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '+∞' : '−∞';
  return Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(3) : v.toPrecision(5);
}

function saveScreenshot(): void {
  const a = document.createElement('a');
  a.href = viewer.screenshotDataURL();
  a.download = `hyperdims_${Date.now()}.png`;
  a.click();
}

// ---------------------------------------------------------------- Animation

let lastTime = performance.now();
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if (state.play && viewer.totalRows > 0) {
    playhead += state.speed * dt;
    if (playhead > viewer.totalRows) playhead = 0;
    viewer.setVisibleCount(Math.floor(playhead));
  } else {
    viewer.setVisibleCount(viewer.totalRows);
  }
}
requestAnimationFrame(tick);

regenerate();

// Console/dev API: lets power users (and the smoke-test harness) drive the
// app programmatically, e.g. hyperdims.set({ dims: 7, numPoints: 10000 }).
declare global {
  interface Window {
    hyperdims: { state: State; set: (patch: Partial<State>) => void; loadCSVText: (text: string, name: string) => void };
  }
}
window.hyperdims = {
  state,
  set(patch: Partial<State>) {
    Object.assign(state, patch);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    regenerate();
  },
  loadCSVText(text: string, name: string) {
    csv = parseCSVText(text);
    csvName = name;
    state.source = 'CSV';
    sourceCtrl.updateDisplay();
    csvColumnCtrl.max(Math.max(0, csv.columns.length - 1));
    document.querySelector('#title b')!.textContent = `HYPERDIMS · ${csvName}`;
    regenerate();
  },
};
