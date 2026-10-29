/**
 * Render a narrated HCS lesson video from the real app, frame by frame.
 *
 *   node video/render.mjs                         # hcs_intro -> video/out/hcs_intro/
 *   node video/render.mjs hcs_intro --stills-only # one PNG per shot (+ --at 3,41.5)
 *   node video/render.mjs --draft                 # 960x540 @ 15 fps
 *   node video/render.mjs --no-tts                # silent, shots timed at reading pace
 *
 * The same method as glyphviz/video_lessons (see video/README.md): each shot's
 * narration is synthesized first (Kokoro, through GlyphViz's narrate.py) and
 * its length sets the shot's length, so voice and picture can't drift. Then
 * headless Chrome opens dist/index.html, and for every frame the lesson puts
 * the app in the state it wants through window.hyperdims (the playhead runs
 * on VIDEO time), places the camera, and overlay.js draws titles, captions,
 * callouts and the pointer. Frames pipe to ffmpeg; the narration track is
 * laid under them and an .srt is written alongside.
 */
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = 'C:/ffmpeg/bin/ffmpeg.exe';
const KOKORO_PY = join(process.env.LOCALAPPDATA ?? '', 'GlyphViz', 'kokoro', 'venv', 'Scripts', 'python.exe');
const LEAD_IN = 0.35;

// ------------------------------------------------------------------ args

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const lessonName = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--at')) ?? 'hcs_intro';
const draft = flag('--draft');
const stillsOnly = flag('--stills-only');
const fps = draft ? 15 : 30;

const { build } = await import(pathToFileURL(join(HERE, 'lessons', `${lessonName}.mjs`)).href);
const lesson = build();
const outDir = join(HERE, 'out', lesson.name);
mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------------ narration

function python(args) {
  const r = spawnSync(KOKORO_PY, [join(HERE, 'tts.py'), ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`tts.py ${args[0]} failed`);
}

let clips;
if (flag('--no-tts')) {
  clips = lesson.shots.map((s) => ({ audio: null, seconds: Math.max(1.5, s.say.split(/\s+/).length / 2.6) }));
} else {
  const job = join(outDir, 'tts_job.json');
  const res = join(outDir, 'tts_clips.json');
  writeFileSync(job, JSON.stringify({
    // `speak` respells a line for the voice only; captions keep `say`.
    lines: lesson.shots.map((s) => s.speak ?? s.say),
    voice: opt('--voice') ?? lesson.voice,
    speed: Number(opt('--rate') ?? lesson.speed),
    cache: join(HERE, 'out', '_tts_cache'),
  }));
  python(['synth', job, res]);
  clips = JSON.parse(readFileSync(res, 'utf8'));
}

// Shot length = lead-in + speech + tail (lessonkit.plan_timing).
let t0 = 0;
const timing = lesson.shots.map((shot, i) => {
  const speech = clips[i].seconds;
  const dur = Math.max(LEAD_IN + speech + (shot.tail ?? 0.45), shot.minDur ?? 0);
  const tm = { start: t0, dur, speech, audio: clips[i].audio };
  t0 += dur;
  return tm;
});
const total = t0;
const nFrames = Math.round(total * fps);
console.log(`${lesson.name}: ${lesson.shots.length} shots, ${total.toFixed(1)} s`);
timing.forEach((tm, i) => console.log(`  ${String(i + 1).padStart(2)}  ${tm.start.toFixed(1).padStart(6)} s  +${tm.dur.toFixed(1)} s  ${lesson.shots[i].heading ?? ''}`));

// ------------------------------------------------------------------ camera

const ease = (u) => {
  u = Math.min(Math.max(u, 0), 1);
  return u * u * u * (u * (6 * u - 15) + 10);
};
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [0, 1, 2].map((k) => lerp(a[k], b[k], t));

/** Orbit keys as in lessonkit.CameraTrack: fields left out inherit, each shot
 * starts where the last one left the camera, and the shot is eased once then
 * walked piecewise-linearly so interior keys don't stop the camera. Here
 * `target` and `dist` may be functions of the frame's app info (to track a
 * dimension circle, or frame whatever is drawn). Y is up. */
class CameraTrack {
  constructor(start) {
    this.cam = { ...start };
  }
  shotKeys(shot) {
    const keys = shot.keys ?? [];
    const out = [];
    let prev = { ...this.cam };
    if (!keys.length || keys[0].u > 0) out.push([0, { ...prev }]);
    for (const k of keys) {
      prev = { ...prev };
      for (const f of ['az', 'el', 'dist', 'target', 'near']) if (k[f] !== undefined) prev[f] = k[f];
      out.push([k.u, prev]);
    }
    if (out[out.length - 1][0] < 1) out.push([1, { ...out[out.length - 1][1] }]);
    this.cam = { ...out[out.length - 1][1] };
    return out;
  }
  static at(keys, u, info) {
    const ue = ease(u);
    let a = keys[0][1];
    let b = a;
    let t = 1;
    for (let i = 0; i + 1 < keys.length; i++) {
      const [u0, ka] = keys[i];
      const [u1, kb] = keys[i + 1];
      if (ue <= u1 || i + 2 === keys.length) {
        a = ka;
        b = kb;
        t = u1 > u0 ? Math.min(Math.max((ue - u0) / (u1 - u0), 0), 1) : 1;
        break;
      }
    }
    const val = (v) => (typeof v === 'function' ? v(info) : v);
    const az = (lerp(a.az, b.az, t) * Math.PI) / 180;
    const el = (lerp(a.el, b.el, t) * Math.PI) / 180;
    // Distance eases in log space, so a zoom from 400 to 4 feels even.
    const dist = Math.exp(lerp(Math.log(val(a.dist)), Math.log(val(b.dist)), t));
    const target = lerp3(val(a.target), val(b.target), t);
    const eye = [
      target[0] + dist * Math.cos(el) * Math.cos(az),
      target[1] + dist * Math.sin(el),
      target[2] + dist * Math.cos(el) * Math.sin(az),
    ];
    const near = a.near ?? Math.max(1e-4, dist / 2000);
    return { eye, target, near };
  }
}

// ------------------------------------------------------------------ browser

const W = draft ? 960 : 1920;
const H = draft ? 540 : 1080;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--hide-scrollbars'],
});
const page = await browser.newPage();
// Lay the app out at 1280x720 CSS px (the panel's real proportions) and
// capture at the output size: 1.5x for 1080p.
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: W / 1280 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (lesson.onConsole) lesson.onConsole(m.text());
});
const dist = join(REPO, 'dist', 'index.html');
if (!existsSync(dist)) throw new Error('dist/index.html is missing: run npm run build first');
await page.goto(pathToFileURL(dist).href, { waitUntil: 'load' });
await page.waitForFunction(() => window.hyperdims?.film);
await page.addScriptTag({ content: readFileSync(join(HERE, 'overlay.js'), 'utf8') });
const cdp = await page.createCDPSession();
const downloads = join(outDir, 'downloads');
mkdirSync(downloads, { recursive: true });
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

// ------------------------------------------------------------------ frames

const ctx = { page, samples: join(REPO, 'samples'), lesson, fps };
const fade = (u, start, end, dur) => {
  if (u < start || u > end) return 0;
  const k = 0.35 / Math.max(dur, 1e-6);
  return Math.min(1, (u - start) / k, (end - u) / k);
};

const stillTimes = (opt('--at')?.split(',').map(Number)) ??
  (stillsOnly ? timing.flatMap((tm) => [tm.start + tm.dur * 0.5, tm.start + tm.dur * 0.9]) : []);
const stillFrames = new Map(stillTimes.map((t) => [Math.min(nFrames - 1, Math.round(t * fps)), t]));

let ff = null;
const silent = join(outDir, `${lesson.name}.video.mp4`);
if (!stillsOnly) {
  ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
}
const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));

const track = new CameraTrack(lesson.camera);
let shotI = -1;
let keys = null;
let fired = new Set();
const tStart = Date.now();
for (let f = 0; f < nFrames; f++) {
  const t = f / fps;
  let entered = false;
  while (shotI + 1 < timing.length && t >= timing[shotI + 1].start) {
    shotI++;
    entered = true;
  }
  const shot = lesson.shots[shotI];
  const tm = timing[shotI];
  const u = (t - tm.start) / tm.dur;
  ctx.dur = tm.dur;
  ctx.speech = tm.speech;
  if (entered) {
    keys = track.shotKeys(shot);
    fired = new Set();
    if (shot.enter) await shot.enter(ctx);
    if (shot.setup) await page.evaluate((s) => window.film.apply(s), shot.setup);
  }
  for (const [i, [eu, fn]] of (shot.events ?? []).entries()) {
    if (u >= eu && !fired.has(i)) {
      fired.add(i);
      await fn(ctx);
    }
  }
  const capture = !stillsOnly || stillFrames.has(f);
  const appSpec = { ...(shot.frame?.(u, ctx) ?? {}), ...(shot.needs?.(u, ctx) ?? {}) };
  if (!capture && !Object.keys(appSpec).length) continue;
  const info = await page.evaluate((s) => window.film.apply(s), appSpec);
  if (!capture) continue;

  const cam = CameraTrack.at(keys, u, info);
  const shift = typeof shot.shift === 'function' ? shot.shift(u) : (shot.shift ?? lesson.shift);
  const spec = {
    view: { ...cam, shift },
    lessonTitle: lesson.title,
    heading: shot.heading,
    caption: shot.title && u < 0.5 ? null : shot.say,
    callouts: (shot.callouts ?? []).flatMap((c) => {
      const when = (v, d) => (typeof v === 'function' ? v(ctx) : (v ?? d));
      const alpha = fade(u, when(c.start, 0), when(c.end, 1), tm.dur);
      if (alpha <= 0) return [];
      const anchor = typeof c.anchor === 'function' ? c.anchor(info, u) : c.anchor;
      return anchor ? [{ ...c, anchor, alpha }] : [];
    }),
    curves: shot.curves?.(u, info, ctx) ?? [],
    readout: shot.readout?.(u, info, ctx) ?? null,
    cursor: shot.cursor?.(u, info, ctx) ?? null,
    file: shot.file?.(u, ctx) ?? null,
    card: shot.card?.(u, ctx) ?? null,
    // Title holds for the first ~35% then fades (lessonkit).
    title: shot.title ? { ...shot.title, alpha: u < 0.35 ? 1 : Math.max(0, 1 - (u - 0.35) / 0.15) } : null,
    summary: shot.summary ? { ...shot.summary, alpha: Math.min(1, u / 0.12) } : null,
  };
  await page.evaluate((s) => window.film.draw(s), spec);
  // page.screenshot, not a raw CDP call on our own session: the 1.5x device
  // scale is emulated on the page's session, so ours would capture 1280x720.
  const png = Buffer.from(await page.screenshot({ type: 'png', optimizeForSpeed: !stillFrames.has(f) }));
  if (stillFrames.has(f)) {
    const p = join(outDir, `${lesson.name}_t${stillFrames.get(f).toFixed(1).padStart(5, '0')}s.png`);
    writeFileSync(p, png);
  }
  if (ff) await write(png);
  if (f % (fps * 5) === 0) {
    const el = (Date.now() - tStart) / 1000;
    process.stdout.write(`\r  frame ${f}/${nFrames}  (${t.toFixed(1)} s of video, ${el.toFixed(0)} s elapsed)   `);
  }
}
process.stdout.write('\n');
await browser.close();
if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '));

// ------------------------------------------------------------------ audio, mux

const srt = join(outDir, `${lesson.name}.srt`);
const wav = join(outDir, `${lesson.name}.narration.wav`);
const trackJob = join(outDir, 'tts_track.json');
writeFileSync(trackJob, JSON.stringify({
  shots: lesson.shots.map((s, i) => ({ say: s.say, start: timing[i].start, speech: timing[i].speech, audio: timing[i].audio })),
  total, wav, srt,
}));
if (!flag('--no-tts')) python(['track', trackJob]);

if (ff) {
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg failed encoding frames')))));
  const mp4 = join(outDir, `${lesson.name}.mp4`);
  const audio = flag('--no-tts') ? [] : ['-i', wav];
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', silent, ...audio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg mux failed');
  rmSync(silent);
  console.log(`${lesson.name}: ${mp4}  (${total.toFixed(1)} s, rendered in ${((Date.now() - tStart) / 1000).toFixed(0)} s)`);
} else {
  console.log(`${lesson.name}: ${stillFrames.size} stills in ${outDir} (${total.toFixed(1)} s timeline)`);
}
console.log(`  captions ${srt}`);
