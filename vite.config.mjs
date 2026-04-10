import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/desktop/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'src/desktop/renderer/dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
