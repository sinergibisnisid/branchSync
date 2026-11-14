import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend BranchSync (React). `npm run dev` → http://localhost:5173
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 }
});
