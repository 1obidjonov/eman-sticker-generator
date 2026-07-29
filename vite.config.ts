import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: resolve(import.meta.dirname),
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/konva/') || id.includes('/react-konva/')) {
            return 'canvas';
          }
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/zustand/')
          ) {
            return 'react';
          }
          if (id.includes('/qrcode/')) {
            return 'qrcode';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
