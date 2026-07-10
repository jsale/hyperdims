import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Inline all JS/CSS into dist/index.html so the built app is one
// self-contained file that works when opened directly from disk
// (file://) — no server needed to share or run a build.
export default defineConfig({
  plugins: [viteSingleFile()],
});
