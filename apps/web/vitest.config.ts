import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // 与 vite.config.ts 一致：解析到源码，避免 dist 过期导致新导出缺失
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@nx9/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@nx9/director3d': path.resolve(__dirname, '../../packages/director3d/src/index.ts'),
      three: path.resolve(__dirname, '../../packages/director3d/node_modules/three'),
      '@nx9/remotion-compositions': path.resolve(
        __dirname,
        '../../packages/remotion-compositions/src/index.ts',
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/blocks/craft/__tests__/**/*.test.tsx',
      'src/blocks/core/__tests__/**/*.test.tsx',
      'src/blocks/nx9/__tests__/**/*.test.{ts,tsx}',
      'src/engine/__tests__/**/*.test.ts',
    ],
    testTimeout: 30000,
  },
});
