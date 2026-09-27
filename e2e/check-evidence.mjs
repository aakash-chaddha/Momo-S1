// Quick check of the two evidence interactions: the full view opens and closes, and the same
// sample twice attaches once. Dev-only, against the ?fixture seam, so no model is needed.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5198;
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
);
const stop = () =>
  process.platform === 'win32'
    ? spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    : child.kill();

const base = `http://localhost:${PORT}/?fixture`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 400));
}

const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : 'chromium',
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    window.__momosFixture = { phase: 'ready', image: '/samples/bliss.png' };
  });
  await page.goto(base);
  await page.waitForSelector('#stage-wire', { timeout: 60_000 });

  // 1. the attached image opens at full size, and Escape closes it
  await page.locator('#stage-01 .thumb-open').click();
  const shown = await page.locator('.lightbox-plate img').isVisible();
  const full = await page
    .locator('.lightbox-plate img')
    .evaluate((i) => [i.naturalWidth, i.naturalHeight]);
  console.log('lightbox opens:', shown, 'natural size', full.join('x'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  console.log('escape closes it:', (await page.locator('.lightbox').count()) === 0);

  // 2. clicking the same sample twice attaches it once, and the button says attached
  const sample = page.locator('#stage-01 .sample').first();
  await sample.locator('.sample-add').click();
  await page.waitForTimeout(400);
  const first = await page.locator('#stage-01 .thumb').count();
  await sample.locator('.sample-add').click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(400);
  const second = await page.locator('#stage-01 .thumb').count();
  const label = await sample.locator('.sample-add').textContent();
  console.log('thumbs after 1st/2nd click:', first, second, '· button:', JSON.stringify(label));

  // 3. a different sample replaces the image instead of adding a second one
  await page.locator('#stage-01 .sample').nth(1).locator('.sample-add').click();
  await page.waitForTimeout(500);
  console.log(
    'thumbs after replacing:',
    await page.locator('#stage-01 .thumb').count(),
    '· now attached:',
    await page.locator('#stage-01 .thumb .meta').first().textContent()
  );
} finally {
  await browser.close();
  stop();
}
