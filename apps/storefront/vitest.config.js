import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The backend has its own vitest config two directories up; without an explicit
// root, setupFiles resolve against that project instead of this one.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: {
      // Vite resolves imports before vi.mock can intercept them, so the
      // server-only guard has to be aliased away rather than mocked.
      'server-only': resolve(here, 'tests/stubs/server-only.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [resolve(here, 'tests/setup.jsx')],
    include: ['tests/**/*.test.{js,jsx}'],
    css: false,
  },
});
