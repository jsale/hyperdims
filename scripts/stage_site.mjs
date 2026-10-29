/**
 * Copy the built app and the lesson video into the iluvdata staging folder,
 * ready to upload.
 *
 *   npm run build && node scripts/stage_site.mjs
 *
 * - dist/index.html -> <web>/index.html, with the site's Google Analytics tag
 *   added to <head>. GA lives only in the deployed copy, never in the repo
 *   source, so local and file:// use of the app doesn't report to it.
 * - video/out/hcs_intro/hcs_intro_web.mp4 -> <web>/video/hcs_intro.mp4, plus
 *   a poster frame (the title card) as <web>/video/hcs_intro_poster.jpg.
 *
 * <web> defaults to C:\Jeff\iluvdata\public_html\hyperdims (HYPERDIMS_WEB
 * overrides). about.html lives only in the web folder and is edited there.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const web = process.env.HYPERDIMS_WEB ?? 'C:/Jeff/iluvdata/public_html/hyperdims';
const FFMPEG = 'C:/ffmpeg/bin/ffmpeg.exe';

const GA = `
	<!-- GA Google Analytics @ https://m0n.co/ga -->
	<script async src="https://www.googletagmanager.com/gtag/js?id=G-Q0G8ECKDFZ"></script>
	<script>
		window.dataLayer = window.dataLayer || [];
		function gtag(){dataLayer.push(arguments);}
		gtag('js', new Date());
		gtag('config', 'G-Q0G8ECKDFZ');
	</script>`;

const html = readFileSync(join(repo, 'dist', 'index.html'), 'utf8');
if (!html.includes('</title>')) throw new Error('dist/index.html has no </title> to anchor the GA tag');
writeFileSync(join(web, 'index.html'), html.replace('</title>', `</title>${GA}`));
console.log(`index.html -> ${join(web, 'index.html')} (GA added)`);

const master = join(repo, 'video', 'out', 'hcs_intro', 'hcs_intro.mp4');
const webCopy = join(repo, 'video', 'out', 'hcs_intro', 'hcs_intro_web.mp4');
if (existsSync(webCopy)) {
  const out = join(web, 'video');
  mkdirSync(out, { recursive: true });
  copyFileSync(webCopy, join(out, 'hcs_intro.mp4'));
  // Poster: the title card, from the master so it's sharp.
  const r = spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', '1.5', '-i', existsSync(master) ? master : webCopy,
    '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', join(out, 'hcs_intro_poster.jpg')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg poster frame failed');
  console.log(`video -> ${out}`);
} else {
  console.log('no video/out/hcs_intro/hcs_intro_web.mp4: run node video/render.mjs and the web re-encode first (video/README.md)');
}
