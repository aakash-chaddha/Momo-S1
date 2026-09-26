// End-to-end smoke test for the page: builds must already exist (npm run build), then this loads the
// default model in a real browser, attaches an image, runs one decision pass and one streamed
// completion, and prints the measured numbers. It is intentionally not part of `npm test`: it needs
// a ~307 MiB model download and several minutes of CPU inference.
//
//   node e2e/decision-smoke.mjs [--headful] [--browser msedge|chrome]
//   node e2e/decision-smoke.mjs --url http://localhost:5173/ --profile e2e/out/profile-dev --headful --keep-open
//
// Without --url it serves dist/ itself; with --url it drives that page instead (e.g. the dev server).
// With --keep-open the browser is left running so the page can be used by hand afterwards.
//
// The page exposes its state to the test through window.__momos (see App.tsx).

import http from 'node:http';
import os from 'node:os';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const imageArg = process.argv.indexOf('--image');
const IMAGE = imageArg >= 0 ? path.resolve(process.argv[imageArg + 1]) : path.resolve(ROOT, 'samples/bliss.png');
const OUT = path.join(ROOT, 'e2e', 'out');
const PORT = 4319;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const headful = process.argv.includes('--headful');
const browserArg = process.argv.indexOf('--browser');
// a res:// browser is used by default: Edge on Windows, the bundled chromium elsewhere
// (run `npx playwright install chromium` once for that)
const channel =
  browserArg >= 0
    ? process.argv[browserArg + 1]
    : process.platform === 'win32'
      ? 'msedge'
      : 'chromium';
const urlArg = process.argv.indexOf('--url');
const liveUrl = urlArg >= 0 ? process.argv[urlArg + 1] : null;
const profileArg = process.argv.indexOf('--profile');
const keepOpen = process.argv.includes('--keep-open');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function serve() {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    try {
      const data = await readFile(path.join(DIST, p));
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Content-Type', MIME[path.extname(p)] ?? 'application/octet-stream');
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = liveUrl ? null : await serve();
  const base = liveUrl ?? `http://127.0.0.1:${PORT}/`;
  log(liveUrl ? `driving ${base}` : `static server on ${base} (COOP/COEP set)`);

  // keep the browser profile out of the repo by default: a watched profile directory breaks vite
  const profileDir =
    profileArg >= 0
      ? path.resolve(process.argv[profileArg + 1])
      : path.join(os.tmpdir(), 'momos-one-profile');
  const browser = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: !headful,
    viewport: { width: 1280, height: 900 },
  });
  const page = browser.pages()[0] ?? (await browser.newPage());
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 400)}`));

  try {
    await page.goto(base, { waitUntil: 'load', timeout: 60_000 });
    log('page loaded:', await page.title());
    const isolated = await page.evaluate(() => crossOriginIsolated);
    log('crossOriginIsolated =', isolated, '· hardwareConcurrency =', await page.evaluate(() => navigator.hardwareConcurrency));

    // ---- model load -------------------------------------------------------
    const t0 = Date.now();
    await page.getByRole('button', { name: 'load the model' }).click();
    await page.waitForFunction(
      () => (window).__momos?.phase === 'ready',
      undefined,
      { timeout: 45 * 60_000, polling: 1000 }
    );
    const info = await page.evaluate(() => (window).__momos.info);
    log(`model loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify({
      n_ctx: info.n_ctx,
      n_ubatch: info.n_ubatch,
      has_image_input: info.has_image_input,
      model: info.metadata['general.name'],
    }));
    await page.screenshot({ path: path.join(OUT, '01-loaded.png') });

    // ---- evidence ---------------------------------------------------------
    await page.setInputFiles('input[type=file]', IMAGE);
    await page.waitForSelector('.thumb img');
    const note = await page.locator('.thumb .meta').innerText();
    log('image prepared:', note.replace(/\n/g, ' · '));

    // ---- one pass ---------------------------------------------------------
    const t1 = Date.now();
    await page.getByRole('button', { name: 'run the decision' }).click();
    await page.waitForFunction(
      () => (window).__momos?.decision?.response != null || (window).__momos?.decision?.error,
      undefined,
      { timeout: 45 * 60_000, polling: 1000 }
    );
    const decision = await page.evaluate(() => (window).__momos.decision);
    if (decision.error) throw new Error(`decision error: ${decision.error}`);
    log(`decision done in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
    log('timings:', JSON.stringify(decision.response.timings));
    log('usage:  ', JSON.stringify(decision.response.usage));
    log('decision:', JSON.stringify(decision.response.results[0].decision));
    for (const [name, f] of Object.entries(decision.response.results[0].fields)) {
      const dist = (f.candidates || [])
        .map((c) => `${JSON.stringify(c.value)}=${(c.probability * 100).toFixed(1)}%`)
        .join(' ');
      log(`  ${name}: ${JSON.stringify(f.value)} ${(f.probability * 100).toFixed(1)}% [${f.tree ? 'tree' : 'greedy'}] ${dist}`);
    }
    await page.screenshot({ path: path.join(OUT, '02-decision.png'), fullPage: true });

    // ---- token by token ---------------------------------------------------
    const t2 = Date.now();
    await page.getByRole('button', { name: 'run token by token' }).click();
    await page.waitForFunction(
      () => (window).__momos?.generation?.answers?.length > 0 || (window).__momos?.generation?.error,
      undefined,
      { timeout: 45 * 60_000, polling: 1000 }
    );
    const generation = await page.evaluate(() => (window).__momos.generation);
    if (generation.error) throw new Error(`generation error: ${generation.error}`);
    log(`generation done in ${((Date.now() - t2) / 1000).toFixed(1)} s`);
    for (const a of generation.answers) {
      log(`  first token ${a.ttftMs?.toFixed(0)} ms · wall ${a.wallMs.toFixed(0)} ms · ${a.predictedN} tokens · ${a.predictedMs ? ((a.predictedN / a.predictedMs) * 1000).toFixed(1) : '?'} t/s`);
      log(`  text: ${a.text.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
    await page.screenshot({ path: path.join(OUT, '03-generation.png'), fullPage: true });

    const summary = {
      isolated,
      hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
      loadedInfo: { n_ctx: info.n_ctx, n_ubatch: info.n_ubatch, model: info.metadata['general.name'] },
      decision: {
        request: decision.request,
        timings: decision.response.timings,
        usage: decision.response.usage,
        answer: decision.response.results[0].decision,
        fields: decision.response.results[0].fields,
        wallMs: decision.wallMs,
      },
      generation: generation.answers.map((a) => ({
        firstTokenMs: a.ttftMs,
        wallMs: a.wallMs,
        predictedN: a.predictedN,
        predictedMs: a.predictedMs,
        text: a.text,
      })),
      consoleErrors,
    };
    await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
    log(`summary written to ${path.relative(process.cwd(), path.join(OUT, 'summary.json'))}`);
    if (consoleErrors.length) log('console errors:', consoleErrors.slice(0, 5));
    log('SMOKE OK');
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, '99-failure.png'), fullPage: true }).catch(() => {});
    log('FAILURE:', e.message);
    log('console errors:', consoleErrors.slice(0, 10));
    process.exitCode = 1;
  } finally {
    if (keepOpen && !process.exitCode) {
      log('browser left open for you to use');
    } else {
      await browser.close();
    }
    server?.close();
  }

  // hold the process (and the browser) open when asked
  if (keepOpen && !process.exitCode) setInterval(() => {}, 1 << 30);
}

main();
