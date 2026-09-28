// Simulates the two hosts this site ships to and reports how the engine comes up in each.
//   --headers   the host sends COOP/COEP itself (npm run preview, Netlify, Vercel)
//   (default)   the host sends neither (GitHub Pages), where ./coi.js has to add them
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const useHeaders = process.argv.includes('--headers');
const port = 4174;

// a plain static server: no COOP/COEP on any response, exactly like GitHub Pages
const server = spawn('python', ['-m', 'http.server', String(port)], {
  cwd: 'dist',
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

if (useHeaders) {
  // the isolation headers the preview server adds; re-wrap every response with them
  // only our own origin: the model download from huggingface.co must pass through untouched
  await context.route(`http://127.0.0.1:${port}/**`, async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    headers['cross-origin-opener-policy'] = 'same-origin';
    headers['cross-origin-embedder-policy'] = 'require-corp';
    await route.fulfill({ response: res, headers });
  });
}

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500); // let a service worker install, claim, and trigger its reload

const iso = await page.evaluate(() => ({
  crossOriginIsolated: self.crossOriginIsolated,
  sab: typeof SharedArrayBuffer,
  swControlled: !!navigator.serviceWorker?.controller,
}));

const btn = page.getByRole('button', { name: 'load the model' });
const load = process.argv.includes('--load');
if (load && (await btn.count())) {
  await btn.first().click();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const bar = await page.evaluate(() => document.querySelector('.statusbar')?.textContent ?? '');
    if (/ready/i.test(bar)) break;
    if (errors.length) break;
  }
}

const bar = await page.evaluate(() =>
  (document.querySelector('.statusbar')?.textContent ?? '').replace(/\s+/g, ' ')
);

console.log(useHeaders ? '[host sends COOP/COEP]' : '[host sends nothing, like GitHub Pages]');
console.log('  ', JSON.stringify(iso));
console.log('   statusbar:', bar.slice(0, 170));
if (!load) console.log('   (engine not loaded; pass --load to download the model and run it)');
console.log('   errors:', errors.length ? errors.slice(0, 6).join(' | ') : '(none)');
await page.screenshot({ path: 'e2e/out/isolation-probe.png' });
await browser.close();
server.kill();
