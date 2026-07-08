import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const sharedDist = path.resolve(__dirname, '../../packages/shared/dist/esm/index.js');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@nx9/shared': sharedDist,
      '@nx9/director3d': path.resolve(__dirname, '../../packages/director3d/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@nx9/shared'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      ignored: ['!**/packages/shared/dist/**'],
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
