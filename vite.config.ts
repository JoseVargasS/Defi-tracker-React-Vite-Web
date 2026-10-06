/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  plugins: [react()],
  base: '/Defi-tracker-React-Vite-Web/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api/zen': {
        target: 'https://opencode.ai/zen/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/zen/, '/chat/completions'),
      },
      '/api/mexc': {
        target: 'https://contract.mexc.com/api/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mexc/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}', 'src/__tests__/**/*.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.d.ts', 'src/main.tsx'],
    },
  },
});
