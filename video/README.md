# Lesson videos

Narrated feature videos rendered straight from the real app, using the same
method as GlyphViz's `video_lessons` (`../glyphviz/video_lessons`): no
screen recording and no editing timeline. A lesson is one `.mjs` file, and
one command turns it into an MP4 with Kokoro narration, burned-in captions
and a separate `.srt`.

```powershell
npm run build                                   # the lesson films dist/index.html
node video/render.mjs                           # hcs_intro -> video/out/hcs_intro/hcs_intro.mp4
node video/render.mjs --stills-only             # two PNGs per shot, no encode: look first
node video/render.mjs --stills-only --at 17,64  # PNGs at chosen seconds
node video/render.mjs --draft                   # 960x540 @ 15 fps
node video/render.mjs --no-tts                  # silent, shots timed at reading pace
```

The ~103 s `hcs_intro` renders in about 3 minutes at 1920x1080. Output goes to
`video/out/<lesson>/` (gitignored): `<lesson>.mp4` (CRF 18 master),
`<lesson>.srt`, `<lesson>.narration.wav`, and whatever the lesson exported
into `downloads/`. For the web, re-encode like the GlyphViz docs videos:

```powershell
ffmpeg -i video/out/hcs_intro/hcs_intro.mp4 -c:v libx264 -preset slow -crf 26 -maxrate 3500k -bufsize 7000k -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart hcs_intro_web.mp4
```

## How it works

1. `tts.py` speaks each shot's `say` line through GlyphViz's `narrate.py`
   (Kokoro `af_heart` by default, cached by text hash in `out/_tts_cache`).
   It needs the Kokoro venv from GlyphViz's README (`%LOCALAPPDATA%\GlyphViz\kokoro`)
   and the sibling `glyphviz` repo (`GLYPHVIZ_LESSONS` overrides where).
2. Each clip's length sets its shot's length, so voice and picture can't drift.
3. `render.mjs` opens `dist/index.html` in headless Chrome (GPU, 1280x720 CSS
   px at 1.5x, so the settings panel keeps its real proportions) and injects
   `overlay.js`. For every frame it calls `film.apply` to put the app in the
   state the shot wants, through `window.hyperdims.set`, the lil-gui folders,
   real drag-and-drop events and `hyperdims.film.setPlayhead`, which runs the
   playhead on video time. It then calls `film.draw` to place the camera and
   draw the overlay. Frames are piped to ffmpeg.
4. The narration track is laid under the video, and captions come from the
   same lines.

Everything in the 3D view and the settings panel is the app's own. Only the
overlays are drawn outside it: brand plate, title card, captions, callouts,
readout, pointer, the shot-2 card, the rolling number line in shot 3, the
dragged file and the recap card. They are a canvas port of lessonkit's
`Overlay`, so the palette and layout match the GlyphViz lessons.

`hyperdims.film` (src/main.ts) is the app's side of this: the viewer
(`setView`, `project`, `leafPositions`, `renderNow`), the GUI, the dataset
and config, and the probe row's dimension circles.

## Writing a shot

| field | what it does |
| --- | --- |
| `say` | the narration line (and the caption) |
| `heading` | the brand plate's second line |
| `setup` | `film.apply` spec at the shot's start: `set` (state patch), `folders`, `root`, `playhead` |
| `enter(ctx)` | async, at the start, e.g. load a sample CSV (a cut) |
| `events` | `[u, async (ctx) => ...]`, fired once when the shot reaches `u` |
| `frame(u, ctx)` | per-frame `film.apply` spec (a sweeping slider, the playhead) |
| `needs(u, ctx)` | what the frame needs back: `rows`, `chain` (probe circles), `fit` (bounding box) |
| `keys` | orbit keys `{u, az, el, dist, target}`, Y up; `target`/`dist` may be `(info) => ...` |
| `callouts` | ring + label on `{world}` / `{dom: controller name}` anchors; `start`/`end` may be `cue(...)` |
| `readout`, `cursor`, `curves`, `file`, `card` | live value box, pointer, world-space curves, dragged file, drawn card |
| `title`, `summary`, `minDur`, `shift` | title card, recap card, minimum length, picture-centre shift (px) |

Check every on-screen fact against the code before rendering. For example,
the readouts compute θ with the app's own formula and the per-dimension
scales the app reports.
