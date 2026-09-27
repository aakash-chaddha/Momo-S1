// A dev server that has been alive across many file edits serves a desynced module graph. The
// symptom is a page that does not mount and a console line like "does not provide an export named
// ...". This stops every vite on the dev port, clears the transform cache, and starts a fresh
// server, which is the whole fix.
//
//   npm run dev-restart

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5173;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (process.platform === 'win32') {
  // scoped to the port, so another project's dev server is left alone
  await promisify(execFile)('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ` +
      'Select-Object -ExpandProperty OwningProcess -Unique | ' +
      'ForEach-Object { Stop-Process -Id $_ -Force }',
  ]).catch(() => undefined);
} else {
  spawn('sh', ['-c', `lsof -ti tcp:${PORT} | xargs -r kill`], { stdio: 'ignore' });
}

await rm(path.join(ROOT, 'node_modules', '.vite'), { recursive: true, force: true });
log(`stopped whatever was on :${PORT}, cleared node_modules/.vite`);

const dev = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'inherit', shell: true });
dev.on('exit', (code) => process.exit(code ?? 0));
