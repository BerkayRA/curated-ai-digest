import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    // Route-handler tests dynamically import heavy workspace modules (the
    // @digest/curation barrel) and argon2; under parallel-CI CPU contention the
    // default 5s can be exceeded. Give headroom so they're deterministic.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
