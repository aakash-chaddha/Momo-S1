// Checks that a dev server is serving a page that actually mounts. A stale vite server answers
// HTTP 200 and still fails here, because the module graph it serves is out of date.
//
//   node e2e/check-dev.mjs                 # http://localhost:5173/
//   node e2e/check-dev.mjs --url http://localhost:5299/

import { chromium } from 'playwright';

const urlArg = process.argv.indexOf('--url');
const url = urlArg >= 0 ? process.argv[urlArg + 1] : 'http://localhost:5173/';

const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : 'chromium',
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));

let ok = true;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForSelector('#stage-wire', { timeout: 30_000 });
} catch {
  ok = false;
}

console.log('url:', url);
console.log('page mounts:', ok);
console.log('errors:', errors.length ? errors : 'none');
if (!ok || errors.length) {
  console.log('the dev server is probably stale; run: npm run dev-restart');
  process.exitCode = 1;
}
await browser.close();
