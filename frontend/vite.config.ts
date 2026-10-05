import { fileURLToPath } from 'node:url';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The mock by default; FSP_API_TARGET points the dev and preview servers at another API, e.g. a local backend.
const apiTarget = process.env.FSP_API_TARGET ?? 'http://127.0.0.1:4010';

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
      quoteStyle: 'single',
    }),
    react(),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': apiTarget, '/__mock__': apiTarget },
  },
  // Production-like preview: only the application API is proxied, never /__mock__.
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: { '/api': apiTarget } },
});
