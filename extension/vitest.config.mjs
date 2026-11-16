import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['extension/src/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
