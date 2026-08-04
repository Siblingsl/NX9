import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/blocks/craft/__tests__/**/*.test.tsx', 'src/engine/__tests__/**/*.test.ts'],
    testTimeout: 30000,
  },
});
