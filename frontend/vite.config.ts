import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// De .env staat in de hoofdmap, zodat frontend en backend dezelfde instellingen delen.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  // Alleen de migraties zijn extra leesbaar, voor de test die de DOOM-tabel met de database vergelijkt (niet de .env in de hoofdmap).
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' }, fs: { allow: ['.', '../supabase/migrations'] } },
  build: { chunkSizeWarningLimit: 900 },
});
