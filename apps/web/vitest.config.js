import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/web/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
      include: ['apps/web/src/**/*.js'],
    },
  },
});
