/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Served at the root of the Cloudflare Worker (VITE_BASE overrides, e.g. for a sub-path host).
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
  // `npm run dev` talks to the local Worker (`npx wrangler dev`, port 8787) for the API, photos and live updates.
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true, changeOrigin: false },
      '/media': { target: 'http://127.0.0.1:8787' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
