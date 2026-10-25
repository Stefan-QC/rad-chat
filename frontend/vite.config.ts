import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// De .env staat in de hoofdmap, zodat frontend en backend dezelfde instellingen delen.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: { chunkSizeWarningLimit: 900 },
});
