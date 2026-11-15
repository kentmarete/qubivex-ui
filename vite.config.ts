/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The Qubivex API the dev server proxies to. Production is same-origin (served at /ui).
const target = process.env.QUBIVEX_API ?? 'http://127.0.0.1:8080';
const proxied = { target, changeOrigin: true };

export default defineConfig({
  base: '/ui/',
  plugins: [react()],
  server: {
    proxy: { '/v1': proxied, '/metrics': proxied, '/health': proxied },
  },
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
  },
});
