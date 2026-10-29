/*
 * In-page side of the lesson renderer (video/render.mjs), injected into the
 * built app. It does two things each frame:
 *
 *   film.apply(spec) -> info   puts the APP in the state the shot wants, through
 *                               the same window.hyperdims API (and lil-gui folders)
 *                               a user's clicks reach, and reports back what the
 *                               lesson needs to aim the camera and write readouts
 *   film.draw(spec)            places the camera, renders, and draws the overlay
 *
 * The overlay is a canvas port of glyphviz/video_lessons/lessonkit.py's Overlay
 * (same palette, fonts, title card, captions, callouts, readout, pointer and
 * recap card), so HCS lessons look like the GlyphViz ones. Everything in the 3D
 * view and the settings panel is the app's own.
 */
(() => {
  const BG = [14, 14, 26];
  const INDIGO = [63, 81, 181];
  const TEAL = [38, 198, 181];
  const CORAL = [255, 111, 97];
  const AMBER = [255, 193, 7];
  const CHALK = [236, 240, 255];
  const MUTED = [180, 186, 210];
  const ACCENT = [102, 136, 255]; // the HCS site's accent (about.html)

  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const hd = () => window.hyperdims;

  // App chrome the brand plate replaces: the title line and About link.
  const style = document.createElement('style');
  style.textContent = '#title, #aboutlink { display: none !important; }';
  document.head.appendChild(style);

  const cv = document.createElement('canvas');
  cv.id = 'film-overlay';
  Object.assign(cv.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5000' });
  document.body.appendChild(cv);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const ctx = cv.getContext('2d');
  const s = H / 720;
  const font = (px, bold = false, mono = false) =>
    `${bold ? 'bold ' : ''}${Math.round(px * s)}px ${mono ? 'Consolas, monospace' : '"Segoe UI", sans-serif'}`;
  const F = {
    title: font(54, true),
    sub: font(24),
    head: font(20, true),
    cap: font(24),
    note: font(20),
    call: font(19, true),
    mono: font(22, false, true),
    bullet: font(28),
    tick: font(17, true),
    big: font(34, true),
  };

  // ------------------------------------------------------------- geometry

  /** Left edge of the settings panel: the free 3D area is [0, freeRight). */
  function freeRight() {
    const root = document.querySelector('.lil-gui.lil-root');
    if (!root) return W;
    return root.getBoundingClientRect().left - 8 * s;
  }

  function controllerEl(name) {
    for (const c of document.querySelectorAll('.lil-controller')) {
      if (c.querySelector('.lil-name')?.textContent === name) return c;
    }
    return null;
  }

  function folderTitleEl(title) {
    for (const t of document.querySelectorAll('.lil-gui > .lil-title')) {
      if (t.textContent === title) return t;
    }
    return null;
  }

  /** {screen:[x,y]} | {world:[x,y,z]} | {dom:name, part} | {folder:title} ->
   * {x, y, rect?} in CSS px, or null when off screen / not found. */
  function resolve(a) {
    if (!a) return null;
    if (a.screen) return { x: a.screen[0], y: a.screen[1] };
    if (a.world) {
      const p = hd().film.viewer.project(a.world);
      return p ? { x: p[0], y: p[1] } : null;
    }
    let el = null;
    if (a.dom) {
      const c = controllerEl(a.dom);
      if (!c) return null;
      if (a.part === 'input') el = c.querySelector('input:not([type=checkbox])') ?? c.querySelector('.lil-widget');
      else if (a.part === 'checkbox') el = c.querySelector('input[type=checkbox]');
      else if (a.part === 'row') el = c;
      else if (a.part === 'slider') el = c.querySelector('.lil-slider');
      else el = c.querySelector('.lil-widget') ?? c;
    } else if (a.folder) {
      el = folderTitleEl(a.folder);
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: [r.left, r.top, r.right, r.bottom] };
  }

  /** Screen pixels per world unit at world point p (for world-sized rings). */
  function pxPerUnit(p) {
    const cam = hd().film.viewer['camera'];
    const d = Math.hypot(p[0] - cam.position.x, p[1] - cam.position.y, p[2] - cam.position.z);
    return H / (2 * Math.tan((cam.fov * Math.PI) / 360) * Math.max(d, 1e-9));
  }

  // ------------------------------------------------------------- drawing

  function box(x0, y0, x1, y1, fill, radius = 10, outline = null) {
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, radius * s);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(1, 2 * s);
      ctx.stroke();
    }
  }

  function text(str, x, y, f, color) {
    ctx.font = f;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }

  function tw(str, f) {
    ctx.font = f;
    return ctx.measureText(str).width;
  }

  function wrap(str, f, maxW) {
    const lines = [];
    let cur = '';
    for (const word of str.split(/\s+/)) {
      const trial = cur ? `${cur} ${word}` : word;
      if (tw(trial, f) <= maxW || !cur) cur = trial;
      else {
        lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function line(x0, y0, x1, y1, color, width = 2, dash = null) {
    ctx.beginPath();
    ctx.setLineDash(dash ? dash.map((d) => d * s) : []);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * s;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function disc(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function ring(x, y, r, color, width = 3) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, width * s);
    ctx.stroke();
  }

  function title(t, sub, alpha) {
    if (alpha <= 0) return;
    const R = freeRight();
    ctx.fillStyle = rgba(BG, (170 / 255) * alpha);
    ctx.fillRect(0, 0, R, H);
    // A title too wide for the space beside the panel wraps; the bar and
    // subtitle follow its last line.
    const lines = wrap(t, F.title, R * 0.88);
    const lh = 66 * s;
    let y = H * 0.4 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => text(l, (R - tw(l, F.title)) / 2, y + i * lh, F.title, rgba(CHALK, alpha)));
    y += (lines.length - 1) * lh;
    const bar = 120 * s;
    ctx.fillStyle = rgba(ACCENT, alpha);
    ctx.fillRect((R - bar) / 2, y + 78 * s, bar, 5 * s);
    text(sub, (R - tw(sub, F.sub)) / 2, y + 98 * s, F.sub, rgba(MUTED, alpha));
  }

  function brand(lessonTitle, heading) {
    const m = 22 * s;
    let w = tw(`Hyperdims  ·  ${lessonTitle}`, F.head) + 30 * s;
    if (heading) w = Math.max(w, tw(heading, F.note) + 20 * s);
    box(m - 10 * s, m - 6 * s, m + w, m + (heading ? 58 : 32) * s, 'rgba(8,8,16,0.59)');
    text('Hyperdims', m, m, F.head, rgba(ACCENT, 0.95));
    const x = m + tw('Hyperdims', F.head) + 10 * s;
    text(`·  ${lessonTitle}`, x, m, F.head, rgba(CHALK, 0.78));
    if (heading) text(heading, m, m + 28 * s, F.note, rgba(MUTED, 0.82));
  }

  function caption(str) {
    if (!str) return;
    const R = freeRight();
    const lines = wrap(str, F.cap, R * 0.84);
    const lh = 32 * s;
    const total = lh * lines.length;
    const y0 = H - 36 * s - total;
    const widest = Math.max(...lines.map((l) => tw(l, F.cap)));
    const pad = 14 * s;
    box((R - widest) / 2 - pad, y0 - pad * 0.6, (R + widest) / 2 + pad, y0 + total + pad * 0.4, 'rgba(8,8,16,0.73)');
    lines.forEach((l, i) => text(l, (R - tw(l, F.cap)) / 2, y0 + i * lh, F.cap, rgba(CHALK, 0.96)));
  }

  function callout(c) {
    const at = resolve(c.anchor);
    if (!at || c.alpha <= 0) return;
    const a = c.alpha;
    const color = c.color ?? AMBER;
    let r = 16 * s;
    if (c.ringWorld && c.anchor.world) r = Math.max(r, c.ringWorld * pxPerUnit(c.anchor.world));
    if (c.ringPx) r = c.ringPx * s;
    const col = rgba(color, a);
    if (c.ring !== false) ring(at.x, at.y, r, col);
    const [dx, dy] = c.offset ?? [90, -70];
    const lx = at.x + dx * s;
    const ly = at.y + dy * s;
    const vx = lx - at.x;
    const vy = ly - at.y;
    const n = Math.hypot(vx, vy) || 1;
    const r0 = c.ring !== false ? r : 4 * s;
    line(at.x + (vx / n) * r0, at.y + (vy / n) * r0, lx, ly, col, 2);
    const w = tw(c.text, F.call);
    const pad = 9 * s;
    const bx0 = dx >= 0 ? lx : lx - w - 2 * pad;
    const by0 = ly - 16 * s;
    box(bx0, by0, bx0 + w + 2 * pad, by0 + 32 * s, rgba([10, 10, 20], a * 0.85), 7, col);
    text(c.text, bx0 + pad, by0 + 5 * s, F.call, rgba(CHALK, a));
  }

  function readout(str) {
    if (!str) return;
    const lines = str.split('\n');
    const lh = 30 * s;
    const w = Math.max(...lines.map((l) => tw(l, F.mono))) + 30 * s;
    const x0 = freeRight() - w - 16 * s;
    const y0 = 24 * s;
    box(x0, y0, x0 + w, y0 + lh * lines.length + 18 * s, 'rgba(8,8,16,0.78)', 10, rgba(INDIGO));
    lines.forEach((l, i) => text(l, x0 + 15 * s, y0 + 11 * s + i * lh, F.mono, rgba(CHALK, 0.96)));
  }

  /** Mouse pointer, click ripple and highlight ring (lessonkit Overlay.pointer). */
  function pointer(c) {
    const at = resolve(c.anchor);
    if (!at) return;
    const a = c.alpha ?? 1;
    const x = at.x + (c.dx ?? 0) * s;
    const y = at.y + (c.dy ?? 0) * s;
    if (c.ring && at.rect && a > 0) {
      const [x0, y0, x1, y1] = at.rect;
      const p = 4 * s;
      box(x0 - p, y0 - p, x1 + p, y1 + p, null, 6, rgba(AMBER, a));
    }
    if (c.click != null && c.click >= 0 && c.click <= 1) {
      ring(x, y, (10 + 34 * c.click) * s, rgba(AMBER, (1 - c.click) * a));
    }
    const k = 1.5 * s;
    const pts = [[0, 0], [0, 17], [4.2, 13.2], [7.2, 19.6], [9.6, 18.6], [6.7, 12.4], [12.2, 12.2]];
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * k, y + py * k) : ctx.moveTo(x + px * k, y + py * k)));
    ctx.closePath();
    ctx.fillStyle = rgba([255, 255, 255], a);
    ctx.fill();
    ctx.strokeStyle = rgba([10, 10, 20], a);
    ctx.lineWidth = Math.max(1, 1.6 * s);
    ctx.stroke();
  }

  function summary(t, bullets, footer, alpha) {
    if (alpha <= 0 || !bullets?.length) return;
    const R = freeRight();
    ctx.fillStyle = rgba(BG, (228 / 255) * alpha);
    ctx.fillRect(0, 0, R, H);
    const x0 = R * 0.1;
    let y = H * 0.16;
    for (const l of wrap(t, F.title, R * 0.85)) {
      text(l, x0, y, F.title, rgba(CHALK, alpha));
      y += 66 * s;
    }
    y += 34 * s;
    for (const b of bullets) {
      disc(x0 + 6 * s, y + 19 * s, 6 * s, rgba(ACCENT, alpha));
      const ls = wrap(b, F.bullet, R * 0.82);
      ls.forEach((l, i) => text(l, x0 + 28 * s, y + i * 38 * s, F.bullet, rgba(CHALK, alpha)));
      y += (ls.length * 38 + 16) * s;
    }
    if (footer) text(footer, x0 + 28 * s, y + 18 * s, F.big, rgba(ACCENT, alpha));
  }

  /** A world-space curve (e.g. the number line rolling into a circle),
   * projected through the live camera, with labelled ticks. */
  function curve(c) {
    const a = c.alpha ?? 1;
    if (a <= 0) return;
    const pts = c.points.map((p) => hd().film.viewer.project(p));
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      if (!p) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p[0], p[1]);
      else ctx.moveTo(p[0], p[1]);
      pen = true;
    }
    ctx.strokeStyle = rgba(c.color ?? CHALK, a);
    ctx.lineWidth = (c.width ?? 3) * s;
    ctx.lineCap = 'round';
    ctx.stroke();
    for (const t of c.ticks ?? []) {
      const p = hd().film.viewer.project(t.at);
      const q = hd().film.viewer.project(t.label_at);
      if (!p || !q) continue;
      const ta = a * (t.alpha ?? 1);
      disc(p[0], p[1], 5 * s, rgba(t.color ?? CHALK, ta));
      const w = tw(t.label, F.tick);
      box(q[0] - w / 2 - 6 * s, q[1] - 13 * s, q[0] + w / 2 + 6 * s, q[1] + 13 * s, rgba([8, 8, 16], 0.8 * ta), 6);
      text(t.label, q[0] - w / 2, q[1] - 10 * s, F.tick, rgba(t.color ?? CHALK, ta));
    }
  }

  /** The picked-up file a "drop" shot carries in. */
  function fileCard(f) {
    const a = f.alpha ?? 1;
    if (a <= 0) return;
    const x = f.x * s;
    const y = f.y * s;
    const w = 54 * s;
    const h = 66 * s;
    const fold = 16 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - fold, y);
    ctx.lineTo(x + w, y + fold);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fillStyle = rgba([238, 240, 248], a);
    ctx.fill();
    ctx.strokeStyle = rgba([150, 155, 175], a);
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    text('CSV', x + 9 * s, y + h - 26 * s, F.call, rgba([30, 120, 70], a));
    const nw = tw(f.name, F.call);
    box(x + w / 2 - nw / 2 - 8 * s, y + h + 8 * s, x + w / 2 + nw / 2 + 8 * s, y + h + 38 * s, rgba([10, 10, 20], 0.85 * a), 7);
    text(f.name, x + w / 2 - nw / 2, y + h + 13 * s, F.call, rgba(CHALK, a));
  }

  // The "where ordinary axes stop" card: a value running off a number line,
  // then three axes with no room for a fourth. u = shot fraction; `split` is
  // where the narration moves from the first limit to the second.
  function problemCard(u, split, alpha) {
    const R = freeRight();
    ctx.fillStyle = rgba(BG, 0.93 * alpha);
    ctx.fillRect(0, 0, R, H);

    // --- 1. the number line
    const ya = H * 0.3;
    const x0 = R * 0.12;
    const x1 = R * 0.84;
    const ka = Math.min(1, u / 0.06);
    line(x0, ya, x1, ya, rgba(CHALK, alpha * ka), 3);
    for (let v = 0; v <= 100; v += 25) {
      const x = x0 + ((x1 - x0) * v) / 100;
      line(x, ya - 9 * s, x, ya + 9 * s, rgba(CHALK, alpha * ka), 2);
      const l = String(v);
      text(l, x - tw(l, F.tick) / 2, ya + 16 * s, F.tick, rgba(MUTED, alpha * ka));
    }
    // A value doubling every step: 1, 2, 4, ... runs off the end of the axis.
    const g = Math.max(0, Math.min(1, (u - 0.08) / (split - 0.14)));
    const v = Math.pow(2, g * 24);
    const xv = x0 + ((x1 - x0) * v) / 100;
    if (u > 0.08) {
      if (xv < R) disc(xv, ya, 9 * s, rgba(CORAL, alpha));
      const lbl = `v = ${Math.round(v).toLocaleString('en-US')}`;
      const lw = tw(lbl, F.mono);
      const lx = Math.min(xv - lw / 2, R - lw - 24 * s);
      text(lbl, Math.max(x0, lx), ya - 44 * s, F.mono, rgba(CORAL, alpha));
    }
    if (xv > R) {
      const fa = Math.min(1, (xv - R) / (300 * s)) * alpha;
      const m = 'off the chart';
      text(m, R - tw(m, F.big) - 30 * s, ya + 50 * s, F.big, rgba(CORAL, fa));
    }

    // --- 2. three axes, and no direction left for a fourth
    const b = Math.max(0, Math.min(1, (u - split) / (1 - split - 0.12)));
    if (b <= 0) return;
    const ox = R * 0.42;
    const oy = H * 0.74;
    const L = 130 * s;
    const axes = [
      ['x', [L, 0], [255, 120, 120]],
      ['y', [0, -L], [120, 220, 120]],
      ['z', [-L * 0.62, L * 0.42], [120, 160, 255]],
    ];
    axes.forEach(([name, [ax, ay], col], i) => {
      const k = Math.max(0, Math.min(1, b * 4 - i * 0.7));
      if (k <= 0) return;
      line(ox, oy, ox + ax * k, oy + ay * k, rgba(col, alpha), 4);
      text(name, ox + ax * k * 1.1 - 6 * s, oy + ay * k * 1.1 - 12 * s, F.big, rgba(col, alpha * k));
    });
    const k4 = Math.max(0, Math.min(1, b * 3 - 1.5));
    if (k4 > 0) {
      const wob = Math.sin(u * 40) * 0.25;
      for (const ang of [-0.6 + wob, 0.75 - wob, 2.4 + wob]) {
        const ex = ox + Math.cos(ang) * L * 0.85 * k4;
        const ey = oy - Math.sin(ang) * L * 0.85 * k4;
        line(ox, oy, ex, ey, rgba(AMBER, alpha * 0.55 * k4), 3, [7, 7]);
      }
      text('4th axis?', ox + L * 1.05, oy - L * 0.95, F.big, rgba(AMBER, alpha * k4));
    }
  }

  // ------------------------------------------------------------- per frame

  function findFolder(gui, title) {
    for (const f of gui.foldersRecursive()) if (f._title === title) return f;
    return null;
  }

  async function apply(spec) {
    const h = hd();
    const f = h.film;
    if (spec.set) {
      const changed = Object.entries(spec.set).some(([k, v]) => h.state[k] !== v);
      if (changed) h.set(spec.set);
    }
    if (spec.root !== undefined) f.gui.open(spec.root);
    for (const [t, open] of Object.entries(spec.folders ?? {})) findFolder(f.gui, t)?.open(open);
    if (spec.playhead !== undefined) f.setPlayhead(spec.playhead);

    const ds = f.dataset();
    const cfg = f.cfg();
    const info = { total: f.viewer.totalRows, scales: cfg.scales, names: ds.columnNames, rows: {} };
    for (const i of spec.rows ?? []) {
      const r = ds.rows[Math.max(0, Math.min(ds.rows.length - 1, i))];
      info.rows[i] = r ? Array.from(r, (v) => (Number.isFinite(v) ? v : v > 0 ? 'Infinity' : '-Infinity')) : null;
    }
    if (spec.chain) {
      const ch = f.probeChain();
      info.chain = ch
        ? ch.frames.map((fr, d) => {
            const t = (ch.angles[d] * Math.PI) / 180;
            const marker = [0, 1, 2].map((k) => fr.c[k] + fr.radius * (Math.cos(t) * fr.u[k] + Math.sin(t) * fr.v[k]));
            return { c: fr.c, radius: fr.radius, angle: ch.angles[d], marker };
          })
        : null;
    }
    if (spec.fit) {
      // Bounding box of the drawn points (the first `count`), for auto-framing.
      const { positions, valid } = f.viewer.leafPositions;
      const n = Math.min(spec.fit.count ?? info.total, info.total);
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) {
        if (!valid[i]) continue;
        for (let k = 0; k < 3; k++) {
          const v = positions[i * 3 + k];
          if (v < lo[k]) lo[k] = v;
          if (v > hi[k]) hi[k] = v;
        }
      }
      info.fit = { lo, hi };
    }
    return info;
  }

  function draw(spec) {
    const v = spec.view;
    if (v) hd().film.viewer.setView(v.eye, v.target, v.near ?? 0.1, (v.shift ?? 0) * 1);
    hd().film.viewer.renderNow();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const c of spec.curves ?? []) curve(c);
    for (const c of spec.callouts ?? []) callout(c);
    if (spec.file) fileCard(spec.file);
    if (spec.readout) readout(spec.readout);
    if (spec.card?.kind === 'problem') problemCard(spec.card.u, spec.card.split, spec.card.alpha ?? 1);
    brand(spec.lessonTitle, spec.heading);
    if (spec.title) title(spec.title.text, spec.title.sub, spec.title.alpha);
    if (spec.summary) summary(spec.lessonTitle, spec.summary.bullets, spec.summary.footer, spec.summary.alpha);
    if (spec.cursor) pointer(spec.cursor);
    if (spec.caption) caption(spec.caption);
  }

  /** Real drag-and-drop of a CSV onto the window, through the app's own
   * dragover/drop handlers. */
  function dragOver() {
    const dt = new DataTransfer();
    window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }
  function drop(textContent, name) {
    const dt = new DataTransfer();
    dt.items.add(new File([textContent], name, { type: 'text/csv' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }

  window.film = { apply, draw, dragOver, drop, freeRight };
})();
