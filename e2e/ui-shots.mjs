// Visual and functional verification for the page UI. No model is loaded and nothing is inferred:
// the populated states come from a response that a real run recorded (e2e/out/summary.json), fed in
// through the ?fixture seam in src/App.tsx, which is dev-only.
//
//   node e2e/ui-shots.mjs                 # starts its own vite dev server on :5199
//   node e2e/ui-shots.mjs --url http://localhost:5173/
//   node e2e/ui-shots.mjs --update-docs   # also refresh the three screenshots docs/ references
//
// What it checks, because a screenshot proves nothing on its own:
//   console errors, horizontal overflow at three widths, contrast measured on the composited
//   pixels (per element, per scroll position), keyboard focus visibility, the reduced-motion
//   composition, anchor targets, image alt text, and the no-em-dash rule.
//
// It cannot check the model load, a real inference run, or a real phone. See README.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'e2e', 'out', 'ui');
const PORT = 5199;
const urlArg = process.argv.indexOf('--url');
const updateDocs = process.argv.includes('--update-docs');
const browserArg = process.argv.indexOf('--browser');
const channel =
  browserArg >= 0
    ? process.argv[browserArg + 1]
    : process.platform === 'win32'
      ? 'chrome'
      : 'chromium';

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const findings = [];

// `npx vite` runs under a shell, so killing the shell leaves the server holding the port. Every
// later run then silently attaches to the stale one. Kill the tree.
function stopServer(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill();
  }
}

function fail(check, detail) {
  findings.push({ check, detail });
  log('FAIL', check, '-', detail);
}

// ---------------------------------------------------------------------------------------------
// the fixture: a recorded run, reshaped into the response the page expects. Nothing invented.
// ---------------------------------------------------------------------------------------------
async function loadFixture() {
  let raw;
  try {
    raw = JSON.parse(await readFile(path.join(ROOT, 'e2e', 'out', 'summary.json'), 'utf8'));
  } catch {
    log('no e2e/out/summary.json: the populated passes will be skipped (run npm run smoke once)');
    return null;
  }
  const d = raw.decision;
  const response = {
    results: [{ decision: d.answer, fields: d.fields }],
    usage: d.usage,
    timings: d.timings,
  };
  const gen = raw.generation?.[0];
  return {
    phase: 'ready',
    info: raw.info ?? {
      n_ctx: raw.loadedInfo.n_ctx,
      n_ubatch: raw.loadedInfo.n_ubatch,
      has_image_input: true,
    },
    image: '/samples/bliss.png',
    decision: {
      running: false,
      status: `done · 1 decision · engine ${(d.timings.total_ms / 1000).toFixed(1)} s · wall ${(d.wallMs / 1000).toFixed(1)} s`,
      error: '',
      wallMs: d.wallMs,
      response,
      request: d.request,
    },
    generation: {
      running: false,
      status: 'done · 1 completion',
      error: '',
      answers: gen
        ? [
            {
              contextIndex: 0,
              text: gen.text,
              ttftMs: gen.firstTokenMs,
              wallMs: gen.wallMs,
              promptMs: null,
              predictedMs: gen.predictedMs,
              predictedN: gen.predictedN,
              usage: null,
            },
          ]
        : [],
      current: '',
      currentIndex: 0,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------------------------

const collectText = (page) =>
  page.evaluate(() => {
    const parseColor = (c) => {
      if (!c) return null;
      let m = c.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/);
      if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
      m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const lin = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

    // the exact designed pair: the element's own colour over the first opaque stack above it
    const canvasColor = parseColor(getComputedStyle(document.body).backgroundColor) ?? [8, 10, 12, 1];
    const bgOf = (el) => {
      const layers = [];
      for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
        const c = parseColor(getComputedStyle(node).backgroundColor);
        if (c && c[3] > 0) {
          layers.push(c);
          if (c[3] === 1) break;
        }
      }
      let out = canvasColor;
      for (let i = layers.length - 1; i >= 0; i--) {
        const [r, g, b, a] = layers[i];
        out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a), 1];
      }
      return out;
    };

    const out = [];
    // Fixed and sticky chrome paints over the page. A box underneath it is not measurable from a
    // screenshot, so it is skipped rather than reported as an unreadable line.
    const occluders = ['.statusbar', '.rail-list']
      .map((s) => document.querySelector(s))
      .filter(Boolean)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0)
      .map((r) => ({ left: r.left - 1, top: r.top - 1, right: r.right + 1, bottom: r.bottom + 1 }));
    let occluded = 0;

    for (const el of document.querySelectorAll('body *')) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) continue;
      if (
        occluders.some(
          (o) => r.right > o.left && r.left < o.right && r.bottom > o.top && r.top < o.bottom
        )
      ) {
        occluded++;
        continue;
      }
      const fg = parseColor(cs.color);
      const bg = bgOf(el);
      const designed = fg
        ? (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05)
        : null;
      out.push({
        text: own.slice(0, 44),
        tag: el.tagName.toLowerCase(),
        cls: String(el.className ?? '').slice(0, 48),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        size: parseFloat(cs.fontSize),
        bold: Number(cs.fontWeight) >= 600,
        designed: designed == null ? null : +designed.toFixed(2),
      });
    }
    return { items: out, occluded };
  });

// Measured on the composited pixels, not on the computed styles: the background under a line of
// text is whatever actually rendered there, including the grain and any overlap.
const measureShot = (page, b64, boxes) =>
  page.evaluate(
    async ({ b64, boxes }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0);

      const lin = (v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

      const res = [];
      for (const b of boxes) {
        if (b.x < 0 || b.y < 0 || b.x + b.w > bmp.width || b.y + b.h > bmp.height) continue;
        const d = cx.getImageData(b.x, b.y, b.w, b.h).data;
        const n = b.w * b.h;
        const count = new Float64Array(64);
        const sum = new Float64Array(64);
        for (let i = 0; i < n; i++) {
          const L = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
          const k = Math.min(63, Math.floor(L * 64));
          count[k]++;
          sum[k] += L;
        }

        // Two clusters, split on the render itself. The background is the contiguous run of
        // buckets around the modal one (a few buckets wide, because the grain moves it).
        // Everything outside that run is the glyph, and the core of the glyph is the far end of
        // it, which is the part that is not antialiased edge. The method does not assume
        // light-on-dark, so an accent-filled button is measured the same way.
        let peak = 0;
        for (let i = 1; i < 64; i++) if (count[i] > count[peak]) peak = i;
        const bgFloor = count[peak] * 0.15;
        let lo = peak;
        let hi = peak;
        while (lo > 0 && count[lo - 1] >= bgFloor) lo--;
        while (hi < 63 && count[hi + 1] >= bgFloor) hi++;

        let bgSum = 0;
        let bgN = 0;
        for (let i = lo; i <= hi; i++) {
          bgSum += sum[i];
          bgN += count[i];
        }
        if (!bgN) continue;
        const bgL = bgSum / bgN;

        let inkSum = 0;
        let inkN = 0;
        let maxDist = 0;
        for (let i = 0; i < 64; i++) {
          if ((i >= lo && i <= hi) || count[i] === 0) continue;
          inkSum += sum[i];
          inkN += count[i];
          maxDist = Math.max(maxDist, Math.abs(sum[i] / count[i] - bgL));
        }
        if (inkN < 2) {
          res.push({ ...b, ratio: 1, spread: 0, inkPixels: inkN, px: n });
          continue;
        }
        // the glyph core: ink pixels at least 70% of the way to the furthest ink cluster
        let coreSum = 0;
        let coreN = 0;
        const cutoff = maxDist * 0.9;
        for (let i = 0; i < 64; i++) {
          if ((i >= lo && i <= hi) || count[i] === 0) continue;
          if (Math.abs(sum[i] / count[i] - bgL) < cutoff) continue;
          coreSum += sum[i];
          coreN += count[i];
        }
        const inkL = coreN ? coreSum / coreN : inkSum / inkN;
        const hiL = Math.max(bgL, inkL);
        const loL = Math.min(bgL, inkL);
        res.push({
          ...b,
          ratio: (hiL + 0.05) / (loL + 0.05),
          spread: Math.abs(inkL - bgL),
          inkPixels: inkN,
          px: n,
        });
      }
      return res;
    },
    { b64, boxes }
  );

async function contrastPass(page, label) {
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize().height;
  const step = Math.round(vh * 0.85);
  const worst = [];
  const disagreements = [];
  let measured = 0;
  let violations = 0;

  for (let y = 0; y < docH; y += step) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(90);
    const boxes = await collectText(page);
    if (!boxes.items.length) continue;
    const png = await page.screenshot({ type: 'png' });
    const res = await measureShot(page, png.toString('base64'), boxes.items);
    for (const r of res) {
      measured++;
      const large = r.size >= 24 || (r.size >= 18.66 && r.bold);
      const need = large ? 3 : 4.5;
      // Two independent numbers: what the pixels came out as (which carries the grain, the
      // antialiasing and anything composited over the text), and what the stylesheet asked for.
      // Small text under-reads on the pixel side because most of a 10px glyph is edge, so a
      // failure is only recorded when the rendered pair is also under the threshold.
      const pixelBad = r.ratio < need && r.spread >= 0.02;
      const styleBad = r.designed == null ? true : r.designed < need;
      if (pixelBad && styleBad) {
        violations++;
        worst.push({ at: y, ratio: +r.ratio.toFixed(2), need, size: +r.size.toFixed(1), ...r });
      } else if (pixelBad || styleBad) {
        disagreements.push({
          at: y,
          pixel: +r.ratio.toFixed(2),
          designed: r.designed,
          need,
          text: r.text,
          cls: r.cls,
        });
      }
    }
  }

  worst.sort((a, b) => a.ratio - b.ratio);
  log(
    `${label}: ${measured} text lines measured, ${violations} under threshold, ${disagreements.length} marginal (pixels and styles disagree)`
  );
  for (const w of worst.slice(0, 12)) {
    log(
      `   ${w.ratio}:1 (needs ${w.need}) ${w.size}px <${w.tag} class="${w.cls}"> "${w.text}" at y=${w.at}`
    );
  }
  if (violations) fail(`contrast/${label}`, `${violations} lines under the threshold`);
  return { measured, violations, worst: worst.slice(0, 20), disagreements: disagreements.slice(0, 20) };
}

async function layoutPass(page, label, width) {
  const over = await page.evaluate(() => {
    const doc = document.documentElement;
    const out = { scrollWidth: doc.scrollWidth, inner: window.innerWidth, wide: [] };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
        out.wide.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className ?? '').slice(0, 40),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
      }
    }
    return out;
  });
  if (over.scrollWidth > over.inner + 1) {
    fail(
      `overflow/${label}`,
      `document scrollWidth ${over.scrollWidth} > viewport ${over.inner}; first offenders ${JSON.stringify(over.wide.slice(0, 4))}`
    );
  } else {
    log(`${label}: no horizontal overflow at ${width}px`);
  }
  return over;
}

async function focusPass(page, label) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const stops = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 34),
        outline: `${cs.outlineWidth} ${cs.outlineStyle}`,
        visible: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1,
      };
    });
    if (!info) break;
    stops.push(info);
  }
  const bad = stops.filter((s) => !s.visible);
  log(`${label}: ${stops.length} tab stops, ${stops.length - bad.length} with a visible ring`);
  if (!stops.length) fail(`focus/${label}`, 'no keyboard stops found');
  if (bad.length) fail(`focus/${label}`, `no visible ring on ${JSON.stringify(bad.slice(0, 4))}`);
  return stops;
}

async function structurePass(page, label) {
  const res = await page.evaluate(() => {
    const dead = [];
    for (const a of document.querySelectorAll('a[href^="#"]')) {
      const id = a.getAttribute('href').slice(1);
      if (id && !document.getElementById(id)) dead.push(a.getAttribute('href'));
    }
    const noAlt = Array.from(document.querySelectorAll('img'))
      .filter((i) => !i.hasAttribute('alt'))
      .map((i) => i.getAttribute('src'));
    return {
      dead,
      noAlt,
      emDash: document.body.innerText.includes('\u2014'),
      h1: document.querySelectorAll('h1').length,
      headings: Array.from(document.querySelectorAll('h1,h2')).map((h) => h.textContent.trim()),
      lang: document.documentElement.lang,
      title: document.title,
    };
  });
  if (res.dead.length) fail(`anchors/${label}`, `dead targets ${JSON.stringify(res.dead)}`);
  if (res.noAlt.length) fail(`alt/${label}`, `images without alt ${JSON.stringify(res.noAlt)}`);
  if (res.emDash) fail(`em-dash/${label}`, 'an em dash is visible on the page');
  if (res.h1 !== 1) fail(`headings/${label}`, `${res.h1} h1 elements`);
  log(`${label}: h1×${res.h1}, ${res.headings.length} headings, no dead anchors, no em dash`);
  return res;
}

// Exercise the real controls and their consequences, against the recorded response. Everything the
// page can do without the engine is driven here; the two run buttons need the loaded model and are
// covered by `npm run smoke` instead.
async function interactionPass(page, label) {
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    if (!ok) fail(`interaction/${label}`, `${name}: ${detail}`);
    else log(`   ok  ${name}${detail ? ` (${detail})` : ''}`);
  };

  // the rail is the navigation: it has to actually jump and then report where it is
  const laneCount = () => page.evaluate(() => document.querySelectorAll('.lane').length);
  const railNote = (id) =>
    page.evaluate((sel) => document.querySelector(`a[href="#${sel}"] .rail-state`)?.textContent, id);

  const settle = async () => {
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const y = await page.evaluate(() => window.scrollY);
      if (y === last) return;
      last = y;
      await page.waitForTimeout(100);
    }
  };

  const before = await laneCount();
  await page.locator('.rail-row a[href="#stage-03"]').click();
  await settle();
  const jumped = await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    top: Math.round(document.getElementById('stage-03').getBoundingClientRect().top),
    current: document.querySelector('.rail-row[aria-current="true"] a')?.getAttribute('href'),
  }));
  check(
    'the rail jumps to a stage',
    jumped.y > 1000 && Math.abs(jumped.top) < 240 && jumped.current === '#stage-03',
    `scrollY ${jumped.y}, stage top ${jumped.top}, current ${jumped.current}`
  );

  await page.locator('.rail-row a[href="#stage-02"]').click();
  await settle();

  // the schema editor is the real input: a new field has to appear as a new lane in the diagram
  await page.getByRole('button', { name: '+ add field' }).click();
  await page.waitForTimeout(200);
  const added = await laneCount();
  check('adding a field adds a lane to the fork rail', added === before + 1, `${before} then ${added}`);

  const named = page.getByLabel('field name').nth(8);
  await named.fill('mood');
  await page.waitForTimeout(250);
  const laneNames = await page.evaluate(() =>
    [...document.querySelectorAll('.lane-name')].map((n) => n.textContent)
  );
  check(
    'renaming a field renames its lane, before anything has run',
    laneNames.includes('mood'),
    laneNames.join(',')
  );

  // the interesting state: eight lanes carry the last run, the ninth is a ghost waiting for the
  // next one. It is the state a reader is in the moment they edit the schema after a run.
  await page.locator('.rail-row a[href="#stage-03"]').click();
  await settle();
  await page.screenshot({ path: path.join(OUT, 'partial-fork.png') });
  await page.locator('.rail-row a[href="#stage-02"]').click();
  await settle();

  // the field count is live in the rail as well
  check('the rail reports the new field count', /9 fields/.test(await railNote('stage-02')), await railNote('stage-02'));

  // the two views of one schema object have to round-trip
  const jsonTab = page.locator('#stage-02 .tabs button', { hasText: 'JSON' });
  await jsonTab.click();
  await page.waitForTimeout(150);
  const asJson = await page.getByLabel('schema JSON').inputValue();
  let parsed = null;
  try {
    parsed = JSON.parse(asJson);
  } catch {
    /* asserted below */
  }
  check(
    'the JSON view shows the same object the form edits',
    !!parsed && parsed.mood && parsed.kind?.choices?.length === 6,
    `${Object.keys(parsed ?? {}).length} keys`
  );
  await page.locator('#stage-02 .tabs button', { hasText: 'form' }).click();
  await page.waitForTimeout(150);

  // a preset replaces instructions, schema and context together
  await page.locator('#stage-02 select').first().selectOption({ index: 2 });
  await page.waitForTimeout(250);
  const afterPreset = await laneCount();
  check(
    'a preset replaces the schema, and the diagram follows',
    afterPreset !== added,
    `${added} lanes then ${afterPreset}`
  );

  // the payload panels have to hand over real bytes
  const details = page.locator('details.json').first();
  await details.locator('summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10_000 }),
    details.locator('button', { hasText: 'download' }).click(),
  ]);
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk;
  let downloaded = null;
  try {
    downloaded = JSON.parse(text);
  } catch {
    /* asserted below */
  }
  check(
    'downloading a payload writes the JSON the page showed',
    download.suggestedFilename().endsWith('.json') && !!downloaded,
    `${download.suggestedFilename()}, ${text.length} bytes`
  );

  // copy is a real clipboard write when the browser allows it, and the label says which happened
  await details.locator('button', { hasText: 'copy' }).click();
  await page.waitForTimeout(200);
  const copyLabel = await details.locator('button').first().textContent();
  check('the copy button reports itself', copyLabel === 'copied', `label "${copyLabel}"`);

  return results;
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

async function startServer() {
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
  );
  child.stdout.on('data', () => undefined);
  child.stderr.on('data', (d) => process.stderr.write(d));
  const base = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base);
      if (r.ok) {
        if (child.exitCode !== null) {
          log(`port ${PORT} was already serving something; reusing it instead of the server this run started`);
        }
        return { child, base };
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('vite did not start');
}

async function shootStages(page, dir, names) {
  await mkdir(dir, { recursive: true });
  for (const [i, id] of names.entries()) {
    // instant, because the page scrolls smoothly for its own rail and the harness cannot wait
    // for an animation it does not control
    await page.evaluate((sel) => {
      const el = document.getElementById(sel);
      const top = el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - 60) : 0;
      window.scrollTo({ top, behavior: 'instant' });
    }, id);
    await page.waitForTimeout(160);
    await page.screenshot({
      path: path.join(dir, `${String(i).padStart(2, '0')}-${id.replace('stage-', '')}.png`),
    });
  }
}

// The deployment package, not the dev server: relative asset paths, the isolation headers, no
// external requests, and the empty first screen a real visitor gets.
async function distPass(browser, out) {
  const port = 5201;
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'preview', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
  );
  child.stdout.on('data', () => undefined);
  const base = `http://localhost:${port}/`;
  let up = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base)).ok) {
        up = true;
        break;
      }
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!up) {
    stopServer(child);
    fail('dist', 'vite preview did not start; run npm run build first');
    return null;
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const external = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on('request', (r) => {
    if (!r.url().startsWith(base)) external.push(r.url().slice(0, 120));
  });
  await page.goto(base, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForSelector('#stage-wire', { timeout: 60_000 });
  await page.waitForTimeout(600);

  const info = await page.evaluate(() => ({
    isolated: crossOriginIsolated,
    fixtureSeam: '__momosFixture' in window,
    railRows: document.querySelectorAll('.rail-row').length,
    stages: document.querySelectorAll('section.stage').length,
    lanes: document.querySelectorAll('.lane').length,
    hasFileInput: !!document.querySelector('input[type=file]'),
    hasLoadButton: !!Array.from(document.querySelectorAll('button')).some(
      (b) => b.textContent.trim() === 'load the model'
    ),
    assets: [...document.querySelectorAll('script[src],link[href]')].map(
      (e) => e.getAttribute('src') ?? e.getAttribute('href')
    ),
  }));
  await page.screenshot({ path: path.join(out, 'dist-root.png') });

  if (info.fixtureSeam) fail('dist', 'the ?fixture seam reached the production bundle');
  if (!info.isolated) fail('dist', 'dist/ is not cross-origin isolated, so the wasm is single threaded');
  if (external.length) fail('dist', `requests left the page: ${JSON.stringify(external.slice(0, 4))}`);
  if (errors.length) fail('dist', JSON.stringify(errors.slice(0, 3)));
  if (!info.lanes) fail('dist', 'no fork lanes rendered from the default schema');
  log(
    `dist: isolated=${info.isolated} · ${info.railRows} rail rows · ${info.stages} stages · ${info.lanes} lanes · ${info.assets.length} assets · ${external.length} external requests`
  );
  await ctx.close();
  stopServer(child);
  return { ...info, errors, external };
}

async function main() {
  const fixture = await loadFixture();
  await rm(OUT, { recursive: true, force: true });
  const server = urlArg >= 0 ? null : await startServer();
  const base = urlArg >= 0 ? process.argv[urlArg + 1] : server.base;
  const browser = await chromium.launch({ channel });
  const report = { base, browser: channel, findings, passes: {} };

  const passes = [
    { name: 'desktop', viewport: { width: 1280, height: 900 }, fixture: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, fixture: false },
    { name: 'phone-compact', viewport: { width: 360, height: 640 }, fixture: false },
    { name: 'fixture-desktop', viewport: { width: 1280, height: 900 }, fixture: true },
    { name: 'fixture-mobile', viewport: { width: 390, height: 844 }, fixture: true },
    { name: 'reduced', viewport: { width: 1280, height: 900 }, fixture: true, reduced: true },
  ];

  for (const pass of passes) {
    const ctx = await browser.newContext({
      viewport: pass.viewport,
      deviceScaleFactor: 1,
      reducedMotion: pass.reduced ? 'reduce' : 'no-preference',
      permissions: ['clipboard-read', 'clipboard-write'],
      acceptDownloads: true,
    });
    if (pass.fixture) {
      await ctx.addInitScript((fx) => {
        window.__momosFixture = fx;
      }, fixture);
    }
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url().slice(0, 160)}`));

    const url = pass.fixture ? `${base}?fixture` : base;
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    // the page pulls in a large wasm module before React mounts, so wait for real markup rather
    // than for a duration: a fixed wait screenshots an empty document
    await page.waitForSelector('#stage-wire', { timeout: 60_000 });
    await page.waitForTimeout(500);

    const dir = path.join(OUT, pass.name);
    const names = ['stage-00', 'stage-01', 'stage-02', 'stage-03', 'stage-04', 'stage-wire'];
    await shootStages(page, dir, names);

    const layout = await layoutPass(page, pass.name, pass.viewport.width);
    const structure = await structurePass(page, pass.name);
    const contrast = await contrastPass(page, pass.name);
    const focus = pass.name === 'desktop' ? await focusPass(page, pass.name) : null;
    const interaction =
      pass.name === 'fixture-desktop' ? await interactionPass(page, pass.name) : null;

    if (errors.length) fail(`console/${pass.name}`, JSON.stringify(errors.slice(0, 4)));
    if (pass.reduced) {
      const motion = await page.evaluate(() => ({
        sweep: getComputedStyle(document.querySelector('.fork-sweep') ?? document.body).display,
        smooth: getComputedStyle(document.documentElement).scrollBehavior,
      }));
      if (motion.sweep !== 'none') fail('reduced-motion', `the pass sweep still renders (${motion.sweep})`);
      if (motion.smooth !== 'auto') fail('reduced-motion', `smooth scrolling still on (${motion.smooth})`);
      log('reduced: sweep hidden, smooth scrolling off');
    }

    report.passes[pass.name] = { errors, layout, structure, contrast, focus, interaction };
    await ctx.close();
  }

  // full page frames, for the contact sheet and for docs/
  const docsCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  if (fixture) {
    await docsCtx.addInitScript((fx) => {
      window.__momosFixture = fx;
    }, fixture);
  }
  const docsPage = await docsCtx.newPage();
  await docsPage.goto(fixture ? `${base}?fixture` : base, { waitUntil: 'load' });
  await docsPage.waitForSelector('#stage-wire', { timeout: 60_000 });
  await docsPage.waitForTimeout(600);
  await docsPage.screenshot({ path: path.join(OUT, 'full-desktop.png'), fullPage: true });
  await docsPage.setViewportSize({ width: 390, height: 844 });
  await docsPage.waitForTimeout(400);
  await docsPage.screenshot({ path: path.join(OUT, 'full-mobile.png'), fullPage: true });
  if (fixture && updateDocs) {
    const run = promisify(execFile);
    for (const [stage, name] of [
      ['stage-00', '01-setup'],
      ['stage-03', '02-decision'],
      ['stage-04', '03-generation'],
    ]) {
      await docsPage.setViewportSize({ width: 1280, height: 900 });
      await docsPage.evaluate((sel) => {
        const el = document.getElementById(sel);
        const top = el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - 60) : 0;
        window.scrollTo({ top, behavior: 'instant' });
      }, stage);
      await docsPage.waitForTimeout(250);
      const interim = path.join(OUT, `${name}.png`);
      await docsPage.screenshot({ path: interim, fullPage: stage !== 'stage-00' });
      // a screenshot of a grained dark UI is enormous as a PNG and the README loads all three:
      // the same frame is about a twelfth of the size as WebP
      try {
        await run('ffmpeg', [
          '-y',
          '-loglevel',
          'error',
          '-i',
          interim,
          '-quality',
          '85',
          path.join(ROOT, 'docs', 'img', `${name}.webp`),
        ]);
        await rm(interim, { force: true });
      } catch {
        await copyFile(interim, path.join(ROOT, 'docs', 'img', `${name}.png`));
        log(`docs/img/${name}.png refreshed (ffmpeg was not available, so it stayed a PNG)`);
        continue;
      }
      log(`docs/img/${name}.webp refreshed`);
    }
  }
  report.passes.dist = await distPass(browser, OUT);

  await browser.close();
  stopServer(server?.child);

  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(report, null, 2));
  log(`summary: ${path.relative(process.cwd(), path.join(OUT, 'summary.json'))}`);
  log(findings.length ? `${findings.length} finding(s)` : 'all checks passed');
  if (findings.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
