import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend BranchSync (React). `npm run dev` → http://localhost:5173
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist', sourcemap: false,
    rollupOptions: {
      output: {
        // Pustaka pihak ketiga di file terpisah: jarang berubah, jadi tetap ter-cache di browser setelah deploy baru.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (/node_modules\/leaflet\//.test(id)) return 'leaflet';
        }
      }
    }
  }
});
