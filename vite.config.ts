/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the static build works from any path (GitHub Pages, S3, file share).
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // exceljs (~930 kB) is lazy-loaded on first Excel use, never in the initial bundle.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
