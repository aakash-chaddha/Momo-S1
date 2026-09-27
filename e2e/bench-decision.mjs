// Cold vs warm decision benchmark: runs the same decision three times in the page (same image and
// schema) and prints the timing split of each, so the repeat cost - cached prompt prefix and cached
// vision encoder output - can be separated from the first run. `npm run bench`;
// needs `npm run build` first and the same browser set-up as the smoke test.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const headful = process.argv.includes('--headful');
const showLogs = process.argv.includes('--logs');
const queryArg = process.argv.indexOf('--query');
const QUERY = queryArg >= 0 ? process.argv[queryArg + 1] : '';
const imageArg = process.argv.indexOf('--image');
const IMAGE = imageArg >= 0 ? path.resolve(process.argv[imageArg + 1]) : path.join(ROOT, 'public/samples/bliss.png');
const PORT = 4319;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.png': 'image/png' };

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
    res.end('nope');
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'momos-one-profile'), {
  channel: process.platform === 'win32' ? 'msedge' : 'chromium',
  headless: !headful,
  viewport: { width: 1280, height: 900 },
});
const page = browser.pages()[0] ?? (await browser.newPage());
if (showLogs) page.on('console', (m) => console.log('[page]', m.text()));
await page.goto(`http://127.0.0.1:${PORT}/${QUERY ? `?${QUERY}` : ''}`, { waitUntil: 'load', timeout: 60_000 });

await page.getByRole('button', { name: 'load the model' }).click();
await page.waitForFunction(() => window.__momos?.phase === 'ready', undefined, { timeout: 10 * 60_000, polling: 500 });
const prep0 = Date.now();
await page.setInputFiles('input[type=file]', IMAGE);
await page.waitForSelector('.thumb img');
console.log(`image prepared in ${Date.now() - prep0} ms`);
console.log('image:', (await page.locator('.thumb .meta').innerText()).replace(/\s+/g, ' '));

for (let i = 1; i <= 3; i++) {
  const t0 = Date.now();
  await page.getByRole('button', { name: 'run the decision' }).click();
  await page.waitForFunction((n) => window.__momos?.decision?.response != null && window.__momos?.decision?.status, undefined, { timeout: 10 * 60_000, polling: 200 });
  // wait for the click's own run to finish (status ends with 's')
  await page.waitForFunction(() => !window.__momos.decision.running, undefined, { timeout: 10 * 60_000, polling: 200 });
  const d = await page.evaluate(() => window.__momos.decision);
  const u = d.response.usage;
  const t = d.response.timings;
  console.log(
    `run ${i}: wall ${(d.wallMs / 1000).toFixed(2)} s | engine ${(t.total_ms / 1000).toFixed(2)} s ` +
      `(prefill ${(t.prefill_ms / 1000).toFixed(2)} s, scoring ${(t.scoring_ms / 1000).toFixed(2)} s, rounds ${t.rounds}) | ` +
      `rows ${u.scored_rows} | cached ${u.cached_tokens}/${u.prompt_tokens} | media ${u.media_tokens}${u.media_cached_tokens ? ` (${u.media_cached_tokens} from the encoder cache)` : ''}`
  );
  await page.waitForTimeout(1500);
}

await browser.close();
server.close();
