import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // happy-dom: jsdom@30 requires Node ≥22; box/CI may be on Node 20.
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
