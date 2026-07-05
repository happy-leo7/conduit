import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
  },
  esbuild: {
    jsx: 'automatic',
  },
});
