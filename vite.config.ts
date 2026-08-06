import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // fileURLToPath instead of __dirname: this file is an ES module, where
    // __dirname does not exist. Avoids needing @types/node just for a path.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * The admin bundle must never be shipped to storefront visitors (D-232).
         * Route-level lazy imports do most of the work; this makes the split
         * explicit and keeps vendor code out of the critical path.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'router';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('react')) return 'react';
          return 'vendor';
        },
      },
    },
    // Storefront JS budget is 200KB gzipped (D-231). Warn well before that so a
    // regression is noticed in review, not in production.
    chunkSizeWarningLimit: 250,
  },
  server: { port: 5173, host: true },
});
