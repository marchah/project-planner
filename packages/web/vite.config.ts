import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy GraphQL to the API in dev so the SPA can call /graphql same-origin.
    proxy: { '/graphql': 'http://localhost:4000' },
  },
  build: { outDir: 'dist' },
});
