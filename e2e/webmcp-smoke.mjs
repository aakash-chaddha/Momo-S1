// WebMCP smoke test: loads the built page in a real browser and drives the page through its
// registered tools - discovery, get-page-state, apply-preset, set-question (including a rejected
// schema) and set-evidence with a shipped sample. No model download: it stops before load-model.
//
//   node e2e/webmcp-smoke.mjs            (after `npm run build`)
//   node e2e/webmcp-smoke.mjs --url http://localhost:5173/
//
// If the browser has no WebMCP (most builds today), a spec-shaped stub for
// `document.modelContext` is installed before the page runs, so the page's registration and tool
// handlers are exercised either way. With WebMCP (Chrome/Edge behind `about:flags#enable-webmcp-testing`)
// the real API is used and this test doubles as a conformance check.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 4321;
const urlArg = process.argv.indexOf('--url');
const liveUrl = urlArg >= 0 ? process.argv[urlArg + 1] : null;
const browserArg = process.argv.indexOf('--browser');
// Edge on Windows, the bundled chromium elsewhere (npx playwright install chromium once for that)
const channel =
  browserArg >= 0 ? process.argv[browserArg + 1] : process.platform === 'win32' ? 'msedge' : null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const fail = (msg) => {
  console.error(`webmcp smoke: FAIL - ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`webmcp smoke: ${msg}`);

function serve() {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    try {
      const data = await readFile(path.join(DIST, p));
      res.setHeader('Content-Type', MIME[path.extname(p)] ?? 'application/octet-stream');
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// The spec's imperative surface, just enough of it: registerTool (with AbortSignal unregistration),
// getTools and executeTool. Installed only when the browser does not provide the real thing.
const STUB = () => {
  if (document.modelContext) return;
  const tools = new Map();
  const fire = () => document.modelContext.dispatchEvent(new Event('toolchange'));
  const mc = new EventTarget();
  mc.registerTool = async (tool, options) => {
    if (options?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    tools.set(tool.name, tool);
    options?.signal?.addEventListener('abort', () => {
      tools.delete(tool.name);
      fire();
    });
    fire();
  };
  mc.getTools = async () =>
    [...tools.values()].map((t) => ({
      name: t.name,
      title: t.title ?? t.name,
      description: t.description,
      inputSchema: t.inputSchema ? structuredClone(t.inputSchema) : undefined,
      annotations: t.annotations,
      window,
      origin: location.origin,
    }));
  mc.executeTool = async (tool, input, options) => {
    const t = tools.get(tool.name);
    if (!t) throw new Error(`unknown tool ${tool.name}`);
    // the spec stringifies the result on the way out; the test accepts either shape
    return t.execute(input ?? {}, { signal: options?.signal ?? new AbortController().signal });
  };
  Object.defineProperty(document, 'modelContext', { value: mc, configurable: true });
};

const server = await serve().catch(() => null);
const browser = await chromium.launch(channel ? { channel } : {});
const page = await browser.newPage();
await page.addInitScript(STUB);
await page.goto(liveUrl ?? `http://localhost:${PORT}/`);
await page.waitForSelector('.app');

const native = await page.evaluate(() => !!document.modelContext);
ok(native ? 'using the browser\'s own document.modelContext' : 'using the spec-shaped stub');

// 1. discovery: every page function is registered, with a description and a schema
const names = await page.evaluate(async () =>
  (await document.modelContext.getTools()).map((t) => t.name).sort()
);
const expected = [
  'apply-preset',
  'get-page-state',
  'load-model',
  'run-both',
  'run-decision',
  'run-generation',
  'set-evidence',
  'set-question',
  'stop-run',
].sort();
if (JSON.stringify(names) !== JSON.stringify(expected))
  fail(`tool list is ${JSON.stringify(names)}, expected ${JSON.stringify(expected)}`);
ok(`discovery: ${names.length} tools`);
const thin = await page.evaluate(async () =>
  (await document.modelContext.getTools()).filter((t) => !t.description || !t.inputSchema).map((t) => t.name)
);
if (thin.length) fail(`tools without a description or inputSchema: ${thin.join(', ')}`);

// 2. get-page-state describes the page before anything is loaded
const state = await page.evaluate(async () => {
  const [tool] = await document.modelContext.getTools();
  const raw = await document.modelContext.executeTool(tool, {});
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
});
if (state.phase !== 'idle') fail(`phase is ${state.phase}, expected idle`);
if (!Array.isArray(state.samples) || state.samples.length !== 6) fail('samples missing from the state');
if (!Array.isArray(state.presets) || state.presets.length !== 3) fail('presets missing from the state');
if (!Array.isArray(state.models) || state.models.length !== 13)
  fail(`expected the 13 models in the state, got ${state.models?.length}`);
ok(
  `get-page-state: phase ${state.phase}, ${state.models.length} models, ${state.samples.length} samples, ${state.presets.length} presets`
);

// 3. apply-preset and set-question drive the page's own state (window.__momos)
const applied = await page.evaluate(async () => {
  const tools = await document.modelContext.getTools();
  const run = async (name, input) => {
    const t = tools.find((x) => x.name === name);
    const raw = await document.modelContext.executeTool(t, input);
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  };
  const preset = await run('apply-preset', { preset: 'screenshot' });
  await run('set-evidence', { sample: 'error-502.png', text: 'decide from the screenshot' });
  const asked = await run('set-question', {
    instructions: 'answer from the pixels',
    schema: { screen: { type: 'enum', choices: ['error_page', 'checkout', 'sign_in', 'other'] } },
  });
  // state writes land on the next render; let React commit before reading the state back
  await new Promise((r) => setTimeout(r, 250));
  return { preset, asked, state: await run('get-page-state', {}), page: window.__momos };
});
if (applied.preset.question.preset !== 'screenshot') fail('apply-preset did not return the preset');
if (applied.asked.question.instructions !== 'answer from the pixels') fail('set-question did not take the instructions');
if (!applied.page.schemaObj?.screen) fail('set-question did not reach the page state');
if (applied.state.question.preset !== 'screenshot') fail('apply-preset did not reach the page state');
if (applied.state.evidence.text !== 'decide from the screenshot') fail('set-evidence did not reach the page state');
if (applied.state.evidence.image?.name !== 'error-502.png') fail('set-evidence did not load the sample image');
ok('apply-preset / set-question / set-evidence all reach the page state');

// 4. a bad schema is rejected with a reason the agent can act on
const rejected = await page.evaluate(async () => {
  const t = (await document.modelContext.getTools()).find((x) => x.name === 'set-question');
  try {
    await document.modelContext.executeTool(t, { schema: { field: { type: 'enum', choices: [] } } });
    return null;
  } catch (e) {
    return String(e.message ?? e);
  }
});
if (!rejected) fail('an empty enum schema was accepted');
ok(`bad schema rejected: ${rejected}`);

// 5. running before the model is loaded says so, in words the agent can act on
const early = await page.evaluate(async () => {
  const t = (await document.modelContext.getTools()).find((x) => x.name === 'run-decision');
  try {
    await document.modelContext.executeTool(t, {});
    return null;
  } catch (e) {
    return String(e.message ?? e);
  }
});
if (!early) fail('run-decision ran with no model loaded');
ok(`run-decision refused before the load: ${early}`);

// 6. stop-run is callable without a run and reports honestly
const stopped = await page.evaluate(async () => {
  const t = (await document.modelContext.getTools()).find((x) => x.name === 'stop-run');
  const raw = await document.modelContext.executeTool(t, {});
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
});
if (!stopped.ok) fail('stop-run failed with nothing in flight');
ok('stop-run: clean with nothing in flight');

await browser.close();
server?.close();
ok('PASS');
