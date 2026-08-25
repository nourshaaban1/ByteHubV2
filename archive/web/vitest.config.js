import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The backend has its own vitest.config.js one directory up; without an
// explicit root, setupFiles resolve against that project instead of this one.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [resolve(here, 'tests/setup.js')],
    include: ['tests/**/*.test.{js,jsx}'],
    css: false,
  },
});
