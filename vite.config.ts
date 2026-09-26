import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// momos-one compiles its copy of the wllama library straight from lib/wllama/src, so the only
// build artifact it needs is the prebuilt wasm binary that ships in that directory.
const WASM = resolve(__dirname, 'lib/wllama/src/wasm/wllama.wasm');
if (!existsSync(WASM)) {
  console.warn(
    '[momos-one] lib/wllama/src/wasm/wllama.wasm is missing; see lib/wllama/PROVENANCE.md for how to rebuild it'
  );
}

// the multithreaded wasm build needs SharedArrayBuffer, which needs cross-origin isolation;
// the headers have to be set by the host, so they are added to both the dev and the preview server
const setIsolationHeaders = (server: {
  middlewares: { use: (handler: (req: unknown, res: any, next: () => void) => void) => void };
}) => {
  server.middlewares.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
  });
};

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'isolation',
      configureServer: setIsolationHeaders,
      configurePreviewServer: setIsolationHeaders,
    },
  ],
  resolve: {
    alias: [
      {
        find: /^@wllama\/wllama$/,
        replacement: resolve(__dirname, 'lib/wllama/src/index.ts'),
      },
    ],
  },
  server: {
    fs: { allow: [__dirname] },
    // a browser profile or a build output under the project must not be watched:
    // Chromium locks files in its profile and the watcher would die with EBUSY
    watch: { ignored: ['**/e2e/out/**', '**/dist/**', '**/node_modules/**'] },
  },
  build: {
    target: 'esnext',
  },
});
