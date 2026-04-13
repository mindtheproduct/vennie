import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/desktop/renderer'),
  base: './',
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/desktop/renderer'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'src/desktop/renderer/dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
