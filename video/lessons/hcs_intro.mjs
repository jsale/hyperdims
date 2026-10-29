/**
 * Lesson: The Hyperdimensional Coordinate System, a ~2 minute introduction.
 *
 * Ten shots: the problem (2), the idea (3-4), why it exists (5-6), using it on
 * real data (7-8), the extras (9), recap (10). Every shot films the real app
 * with its settings panel in view; only shot 2 is a drawn card, and shot 3
 * draws the number line rolling up onto the app's own dimension-1 circle.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LEAD_IN = 0.35;

// viewer.ts DIM_COLORS, a little brighter for label outlines.
const DIM = [[255, 80, 80], [80, 220, 80], [100, 140, 255], [40, 220, 220], [220, 60, 220], [220, 220, 40]];
const AMBER = [255, 193, 7];
const CORAL = [255, 111, 97];

/** The app's state at the start of the lesson (and the base every shot's
 * setup patches), matching the app's defaults where it doesn't matter. */
const BASE = {
  source: 'Lissajous (multivariate)', numPoints: 2000, dims: 4, lag: 8, csvMode: 'columns', csvColumn: 0,
  globalScale: 1, autoScale: true, baseRadius: 100, radiusRatio: 0.4, pointSize: 1.2, showLine: true,
  showGuides: true, probeIndex: 0, play: false, speed: 200, stereo: false, eyeSeparation: 5,
};
const FOLDERS = { Data: true, 'CSV options': false, Mapping: true, Geometry: true, Display: true, Animation: true, Export: false };

const angle = (v, s = 1) => {
  if (v === 'Infinity' || v === Infinity) return 180;
  if (v === '-Infinity' || v === -Infinity) return -180;
  const u = v / s;
  return (180 * u) / (1 + Math.abs(u));
};
const num = (v) => (typeof v === 'string' ? (v.startsWith('-') ? -Infinity : Infinity) : v);
const fmt = (v) => {
  v = num(v);
  if (!Number.isFinite(v)) return v > 0 ? '+∞' : '−∞';
  const a = Math.abs(v);
  return a >= 10000 || (a < 0.001 && a !== 0) ? v.toExponential(2) : v.toPrecision(4);
};
const deg = (a) => `${a.toFixed(1).padStart(7)}°`;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (u, a, b) => clamp01((u - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);

/** Shot fraction at which the narration reaches `phrase` (by character
 * position: Kokoro's pace is close enough to even for cueing). */
const cue = (say, phrase) => (ctx) => (LEAD_IN + (say.indexOf(phrase) / say.length) * ctx.speech) / ctx.dur;

const sample = (ctx, name) => readFileSync(join(ctx.samples, name), 'utf8');
const load = (ctx, name) => ctx.page.evaluate((t, n) => window.hyperdims.loadCSVText(t, n), sample(ctx, name), name);

// ------------------------------------------------------------------ shot 3

/** The compactified number line, rolled up by k (0 straight, 1 closed) onto
 * the dimension-1 circle: centre 0, radius R in the XZ plane, angle 0 along
 * +X, +90 along -Z (geometry.ts baseFrame). The straight line is the circle
 * unrolled about its 0° point, so every tick keeps its arc position. */
function rolled(k, R = 100) {
  const at = (thetaDeg, out = 0) => {
    const s = (R * thetaDeg * Math.PI) / 180;
    let cu, cv, nu, nv;
    if (k < 1e-4) {
      cu = R;
      cv = s;
      nu = 1;
      nv = 0;
    } else {
      const rho = R / k;
      const a = s / rho;
      cu = R - rho + rho * Math.cos(a);
      cv = rho * Math.sin(a);
      nu = Math.cos(a);
      nv = Math.sin(a);
    }
    return [cu + nu * out, 0, -(cv + nv * out)];
  };
  return at;
}

// ------------------------------------------------------------------ lesson

export function build() {
  const S = {
    s1: 'This is the Hyperdimensional Coordinate System.',
    s2: "Ordinary axes have two limits. Values that grow without bound run off the edge, and past three dimensions there's nowhere left to draw.",
    s3: 'The HCS fixes both. Each dimension is a circle. Zero sits at zero degrees, one at ninety, and plus and minus infinity meet at one eighty, so every value, even infinity, has a place.',
    s4: "For the next dimension, a smaller circle rides on the first, at right angles, then another on that one. Follow the chain and you've read one point, in as many dimensions as you need.",
    s5: "Here's the tangent function. Where an ordinary plot breaks at every pole, this trajectory passes smoothly through infinity and comes back from the other side.",
    s6: "That's not a curiosity. In this dopamine model, after a period-three window, the orbit runs out through infinity. On ordinary axes it vanishes. Here you can watch it cross.",
    s7: "Real data works too. Drop in a CSV of seven EEG channels, and auto-scale sets each channel's median at ninety degrees: a genuine seven-dimensional plot.",
    s8: 'Scale is the one free choice: the value that lands at ninety degrees. Turn it like a focus knob, and a different column of this twelve-amplitude ladder snaps into view.',
    s9: 'Explore in cross-eyed stereo, or export any plot to GlyphViz.',
    s10: "That's the Hyperdimensional Coordinate System. Try it at iluvdata dot org slash hyperdims.",
  };

  // Shot 3's cues.
  const c3Roll = cue(S.s3, 'Each dimension');
  const c3Zero = cue(S.s3, 'Zero sits');
  const c3One = cue(S.s3, 'one at ninety');
  const c3Inf = cue(S.s3, 'plus and minus');
  const c3Play = cue(S.s3, 'so every value');

  // Shot 6: the orbit crosses ±∞ near step 1300 of the ramp.
  const DOPE0 = 700;
  const DOPE1 = 2000;
  const dopeHead = (u) => DOPE0 + (DOPE1 - DOPE0) * ramp(u, 0.04, 0.92);

  // Shot 5: four periods of tan, one point per degree.
  const tanHead = (u) => 720 * ramp(u, 0.04, 0.94);

  // Shot 8: scale sweeps 0.2 -> 0.01 (log), walking focus from amp_0.316 out
  // to amp_0.01. (Deeper columns ride circles so small that the guide
  // markers swamp them in a close-up.)
  const scaleAt = (u) => 10 ** (-0.7 - 1.3 * smooth(ramp(u, 0.12, 0.88)));

  let exportLine = null;

  const shots = [
    // 1 ---------------------------------------------------------------
    {
      say: S.s1,
      heading: 'Every value, even infinity, in as many dimensions as you need',
      title: { text: 'The Hyperdimensional Coordinate System', sub: 'Every value, even infinity, in as many dimensions as you need' },
      minDur: 5.5,
      setup: { set: { ...BASE }, folders: FOLDERS, root: true, playhead: 1e9 },
      keys: [{ u: 0, az: 35, el: 30, dist: 430, target: [0, 0, 0] }, { u: 1, az: 75, el: 34, dist: 400 }],
    },
    // 2 ---------------------------------------------------------------
    {
      say: S.s2,
      heading: 'Where ordinary axes stop',
      keys: [{ u: 1, az: 110, el: 36 }],
      card: (u, ctx) => ({
        kind: 'problem',
        u,
        split: cue(S.s2, 'and past three')(ctx),
        alpha: Math.min(1, u / 0.05, (1 - u) / 0.05),
      }),
    },
    // 3 ---------------------------------------------------------------
    {
      say: S.s3,
      heading: 'Each dimension is a circle',
      setup: { set: { ...BASE, source: 'Line 1→100', dims: 1, numPoints: 100, autoScale: false, globalScale: 1, showGuides: false }, playhead: 0 },
      keys: [
        { u: 0, az: 0, el: 30, dist: 560, target: [100, 0, 0] },
        { u: 0.42, az: 0, el: 30, dist: 560, target: [100, 0, 0] },
        { u: 1, az: 20, el: 58, dist: 330, target: [0, 0, 0] },
      ],
      frame: (u, ctx) => {
        const head = Math.round(100 * ramp(u, c3Play(ctx), 0.96));
        return {
          set: { showGuides: u > c3Zero(ctx), probeIndex: Math.max(0, head - 1) },
          playhead: head,
        };
      },
      needs: () => ({ rows: [] }),
      curves: (u, info, ctx) => {
        const k = smooth(ramp(u, c3Roll(ctx), c3Zero(ctx) - 0.02));
        const at = rolled(k);
        const pts = [];
        for (let th = -180; th <= 180; th += 2) pts.push(at(th));
        const lineA = 1 - ramp(u, c3Zero(ctx), c3Zero(ctx) + 0.06) * 0.85;
        const closed = k > 0.999;
        const tick = (th, label, more, cueU, color) => ({
          at: at(th),
          label_at: at(th, 22),
          label: closed && u > cueU ? `${label}  →  ${more}` : label,
          color: closed && u > cueU ? color : undefined,
        });
        const ticks = [
          tick(0, '0', '0°', c3Zero(ctx), AMBER),
          tick(90, '1', '90°', c3One(ctx), AMBER),
          tick(-90, '−1', '−90°', c3One(ctx), AMBER),
          { ...tick(180, closed ? '±∞' : '+∞', '180°', c3Inf(ctx), CORAL), label: closed && u > c3Inf(ctx) ? '+∞ = −∞  →  180°' : closed ? '±∞' : '+∞' },
        ];
        if (!closed) ticks.push(tick(-180, '−∞', '', 1, undefined));
        return [
          { points: pts, color: [236, 240, 255], width: 3, alpha: lineA },
          { points: [], ticks, alpha: 1 },
        ];
      },
      readout: (u, info, ctx) => {
        if (u < c3Play(ctx)) return null;
        const head = Math.max(1, Math.round(100 * ramp(u, c3Play(ctx), 0.96)));
        const v = 1 + (99 * (head - 1)) / 99;
        return `v = ${v.toFixed(1).padStart(5)}\nθ = ${deg(angle(v))}`;
      },
    },
    // 4 ---------------------------------------------------------------
    {
      say: S.s4,
      heading: 'Dimensions nest',
      setup: { set: { ...BASE, source: 'Sine wave', dims: 4, lag: 90, probeIndex: 140, pointSize: 0.6 }, playhead: 1e9 },
      needs: () => ({ chain: true, rows: [140] }),
      keys: [
        { u: 0, az: 30, el: 32, dist: 420, target: [0, 0, 0] },
        { u: 0.35, az: 50, el: 35, dist: 170, target: (i) => i.chain[0].marker },
        { u: 1, az: 70, el: 40, dist: 62, target: (i) => i.chain[2].c },
      ],
      callouts: [
        { anchor: (i) => ({ world: i.chain[0].marker }), text: 'dimension 1', color: DIM[0], start: 0.03, end: 0.45, offset: [-110, -60] },
        { anchor: (i) => ({ world: i.chain[1].marker }), text: 'dimension 2', color: DIM[1], start: cue(S.s4, 'a smaller'), end: 0.7, offset: [90, -70] },
        { anchor: (i) => ({ world: i.chain[2].marker }), text: 'dimension 3', color: DIM[2], start: cue(S.s4, 'then another'), end: 1, offset: [-120, 70] },
        { anchor: (i) => ({ world: i.chain[3].marker }), text: 'dimension 4: the point', color: DIM[3], start: cue(S.s4, 'Follow the chain'), end: 1, offset: [100, -80] },
      ],
      readout: (u, info) => {
        const row = info.rows[140];
        if (!row) return null;
        return row.map((v, d) => `${info.names[d].padEnd(10)}${fmt(v).padStart(8)} →${deg(angle(num(v), info.scales[d]))}`).join('\n');
      },
    },
    // 5 ---------------------------------------------------------------
    {
      say: S.s5,
      heading: 'Through infinity',
      setup: { set: { ...BASE, source: 'Tangent (through ±∞)', dims: 2, lag: 45, numPoints: 720, probeIndex: 0, showGuides: true }, playhead: 0 },
      frame: (u) => ({ playhead: tanHead(u), set: { probeIndex: Math.max(0, Math.floor(tanHead(u)) - 1) } }),
      needs: (u) => ({ rows: [Math.max(0, Math.floor(tanHead(u)) - 1)] }),
      keys: [{ u: 0, az: 15, el: 40, dist: 400, target: [-30, 0, 0] }, { u: 1, az: 60, el: 34, dist: 370 }],
      callouts: [
        { anchor: { world: [-100, 0, 0] }, text: '+∞ and −∞ meet here (180°)', color: CORAL, start: cue(S.s5, 'passes smoothly'), end: 1, ringPx: 22, offset: [-40, -120] },
      ],
      readout: (u, info) => {
        const k = Object.keys(info.rows)[0];
        const row = info.rows[k];
        if (!row) return null;
        return `tan  ${fmt(row[0]).padStart(9)}\nθ    ${deg(angle(num(row[0]), info.scales[0]))}`;
      },
    },
    // 6 ---------------------------------------------------------------
    {
      say: S.s6,
      // Kokoro reads "dopamine" with the vowel of "stop"; this gives "dope".
      speak: S.s6.replace('dopamine', 'dohpamine'),
      heading: 'The dopamine bifurcation model',
      setup: { set: { ...BASE, source: 'Dopamine bifurcation (through ±∞)', dims: 3, lag: 1, numPoints: 2000, showLine: false, showGuides: true }, playhead: DOPE0 },
      frame: (u) => ({ playhead: dopeHead(u), set: { probeIndex: Math.floor(dopeHead(u)) - 1 } }),
      needs: (u) => ({ rows: [Math.floor(dopeHead(u)) - 1] }),
      keys: [{ u: 0, az: 200, el: 34, dist: 430, target: [-20, 0, 0] }, { u: 1, az: 245, el: 30, dist: 400 }],
      callouts: [
        { anchor: { world: [-100, 0, 0] }, text: 'through ±∞ (180°)', color: CORAL, start: 0.44, end: 1, ringPx: 22, offset: [80, -120] },
      ],
      readout: (u, info) => {
        const k = Object.keys(info.rows)[0];
        const row = info.rows[k];
        if (!row) return null;
        return `step ${String(Number(k) + 1).padStart(9)}\nx    ${fmt(row[0]).padStart(9)}\nθ    ${deg(angle(num(row[0]), info.scales[0]))}`;
      },
    },
    // 7 ---------------------------------------------------------------
    {
      say: S.s7,
      heading: 'Real data: seven EEG channels',
      // Shot 6's plot stays up until the drop; then 7 dimensions, one per channel.
      setup: { playhead: 1e9 },
      events: [
        [0.1, (ctx) => ctx.page.evaluate(() => window.film.dragOver())],
        [0.26, async (ctx) => {
          await ctx.page.evaluate((t) => window.film.drop(t, 'eeg_7ch.csv'), sample(ctx, 'eeg_7ch.csv'));
          await ctx.page.waitForFunction(() => window.hyperdims.state.source === 'CSV' && window.hyperdims.film.dataset().columnNames[0] === 'O1');
          await ctx.page.evaluate(() => window.hyperdims.set({ dims: 7, lag: 1, showLine: true, showGuides: true, probeIndex: 600 }));
        }],
      ],
      file: (u) => {
        if (u > 0.27) return null;
        const k = smooth(ramp(u, 0.0, 0.25));
        return { name: 'eeg_7ch.csv', x: 120 + 330 * k, y: 470 - 200 * k, alpha: Math.min(1, u / 0.04) };
      },
      cursor: (u, info, ctx) => {
        if (u < 0.27) {
          const k = smooth(ramp(u, 0.0, 0.25));
          return { anchor: { screen: [150 + 330 * k, 510 - 200 * k] } };
        }
        const a0 = cue(S.s7, 'auto-scale')(ctx);
        if (u < a0 - 0.04) return null;
        return { anchor: { dom: 'auto-scale (median→90°)', part: 'checkbox' }, ring: true, alpha: Math.min(1, (u - a0 + 0.04) / 0.04), dx: 4, dy: 6 };
      },
      needs: () => ({ rows: [600] }),
      keys: [{ u: 0, az: 60, el: 34, dist: 420, target: [0, 0, 0] }, { u: 1, az: 150, el: 30, dist: 400 }],
      readout: (u, info) => {
        if (info.names[0] !== 'O1') return null;
        const row = info.rows[600];
        return row.map((v, d) => `${info.names[d].padEnd(4)}${fmt(v).padStart(8)} μV →${deg(angle(num(v), info.scales[d]))}`).join('\n');
      },
    },
    // 8 ---------------------------------------------------------------
    {
      say: S.s8,
      heading: 'Scale: the value at 90°',
      enter: (ctx) => load(ctx, 'scale_ladder_12.csv'),
      setup: {
        set: { ...BASE, source: 'CSV', dims: 12, numPoints: 2400, autoScale: false, globalScale: 0.2, pointSize: 0.4, showGuides: true, probeIndex: 0 },
        folders: { ...FOLDERS, Animation: false },
        playhead: 1e9,
      },
      frame: (u) => ({ set: { globalScale: Number(scaleAt(u).toPrecision(3)) } }),
      needs: () => ({ fit: {} }),
      keys: [
        { u: 0, az: 40, el: 36, dist: (i) => fitDist(i), target: (i) => fitCenter(i) },
        { u: 1, az: 95, el: 30, dist: (i) => fitDist(i), target: (i) => fitCenter(i) },
      ],
      cursor: (u) => (u < 0.06 ? null : { anchor: { dom: 'scale (value at 90°)', part: 'input' }, ring: true, alpha: Math.min(1, (u - 0.06) / 0.04), dx: 10, dy: 4 }),
      readout: (u, info) => {
        const sc = info.scales[0];
        // The column whose amplitude sits nearest the scale is the one swinging
        // through the whole circle.
        let best = 0;
        info.names.forEach((n, d) => {
          const amp = Number(n.replace('amp_', ''));
          const bestAmp = Number(info.names[best].replace('amp_', ''));
          if (Math.abs(Math.log(amp / sc)) < Math.abs(Math.log(bestAmp / sc))) best = d;
        });
        return `scale     ${fmt(sc).padStart(8)}\nin focus  ${info.names[best].padStart(8)}`;
      },
    },
    // 9 ---------------------------------------------------------------
    {
      say: S.s9,
      heading: 'Stereo and GlyphViz export',
      minDur: 10,
      enter: (ctx) => load(ctx, 'attractors_4x3.csv'),
      setup: {
        set: { ...BASE, source: 'CSV', dims: 12, numPoints: 4000, autoScale: true, stereo: true, showGuides: false, pointSize: 1.0 },
        folders: { ...FOLDERS },
        root: false,
        playhead: 1e9,
      },
      shift: (u) => (u < 0.5 ? 0 : 130),
      events: [
        [0.5, (ctx) => ctx.page.evaluate(() => window.film.apply({
          set: { stereo: false },
          root: true,
          folders: { Data: false, Mapping: false, Geometry: false, Display: true, Animation: false, Export: true },
        }))],
        [0.72, async (ctx) => {
          exportLine = null;
          await ctx.page.evaluate(() => window.hyperdims.exportGlyphViz());
        }],
      ],
      keys: [
        { u: 0, az: 20, el: 28, dist: 520, target: [0, 0, 0] },
        { u: 0.49, az: 70, el: 28, dist: 520 },
        { u: 0.5, az: 70, el: 30, dist: 380 },
        { u: 1, az: 95, el: 30, dist: 380 },
      ],
      cursor: (u) => {
        if (u < 0.55) return null;
        const click = u >= 0.72 ? (u - 0.72) / 0.08 : null;
        return { anchor: { dom: 'export GlyphViz ZIP', part: 'row' }, ring: true, click, alpha: Math.min(1, (u - 0.55) / 0.04) };
      },
      readout: (u) => (u > 0.74 && exportLine ? exportLine : null),
    },
    // 10 --------------------------------------------------------------
    {
      say: S.s10,
      // "iluvdata" would be read "ill-uv-data"; it's "I love data".
      speak: S.s10.replace('iluvdata', 'eye love data'),
      heading: 'Recap',
      minDur: 8,
      setup: {
        set: { ...BASE, source: 'Dopamine bifurcation (through ±∞)', dims: 3, lag: 1, numPoints: 2000, showGuides: false },
        folders: FOLDERS,
        root: true,
        playhead: 1e9,
      },
      keys: [{ u: 0, az: 120, el: 32, dist: 420, target: [-20, 0, 0] }, { u: 1, az: 170, el: 30 }],
      summary: {
        bullets: [
          'Each dimension is a circle: 0 at 0°, scale at 90°, ±∞ at 180°',
          'Each new dimension rides on the last, at right angles',
          'Series that blow up pass smoothly through infinity',
          'Drop in any CSV; scale is the one free choice',
        ],
        footer: 'iluvdata.org/hyperdims',
      },
    },
  ];

  return {
    name: 'hcs_intro',
    title: 'The Hyperdimensional Coordinate System',
    voice: 'af_heart',
    speed: 1.0,
    // Centre the scene in the space beside the settings panel (CSS px).
    shift: 130,
    camera: { az: 35, el: 30, dist: 430, target: [0, 0, 0] },
    shots,
    onConsole: (msg) => {
      // "GlyphViz export: 4000 rows, 56001 nodes → attractors_4x3_gv.zip (… bytes)"
      const m = /GlyphViz export: (\d+) rows, (\d+) nodes → (\S+)/.exec(msg);
      if (m) exportLine = `${m[3]}\n${Number(m[1]).toLocaleString('en-US')} rows → ${Number(m[2]).toLocaleString('en-US')} nodes`;
    },
  };
}

function fitCenter(info) {
  const { lo, hi } = info.fit;
  return [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
}

function fitDist(info) {
  const { lo, hi } = info.fit;
  const r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  return Math.max(2, 2.3 * r);
}
