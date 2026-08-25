/**
 * Runs the production build the way the container runs it.
 *
 * `next start` does not support `output: 'standalone'` — it prints a warning
 * and serves through a path the Dockerfile never uses, so a local smoke test
 * would be exercising something other than what ships.
 *
 * The standalone bundle deliberately omits `public/` and `.next/static/`,
 * because a real deployment usually puts them behind a CDN. The Dockerfile
 * copies them in; so does this.
 */
import { access, cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');

try {
  await access(path.join(standalone, 'server.js'));
} catch {
  console.error('No standalone build found here. Run `npm run build` first.');
  process.exit(1);
}

await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
await cp(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
});

const child = spawn(process.execPath, ['server.js'], {
  cwd: standalone,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT ?? '3001',
    HOSTNAME: process.env.HOSTNAME ?? '127.0.0.1',
  },
});

child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
