import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'e2e-ta/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.astro', 'tests/e2e/**', 'playwright.config.*'],
  },
});
