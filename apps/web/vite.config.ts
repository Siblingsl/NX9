import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Dev: resolve @nx9/shared to source so new named exports (e.g. getCostumeCreative)
// are available without waiting for a full shared dist rebuild / stale Vite cache.
const sharedSrc = path.resolve(__dirname, '../../packages/shared/src/index.ts');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@nx9/shared': sharedSrc,
      '@nx9/director3d': path.resolve(__dirname, '../../packages/director3d/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@nx9/shared'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
    watch: {
      ignored: ['!**/packages/shared/src/**'],
    },
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\/shared/],
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/@xyflow/')) return 'flow';
          if (id.includes('node_modules/three/') || id.includes('node_modules/@react-three/')) {
            return 'director3d';
          }
          if (id.includes('packages/director3d')) return 'director3d';
        },
      },
    },
  },
});