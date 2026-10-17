import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Production: split the heavy 3D + framework vendors so first paint stays
// small; long-term immutable caching for hashed assets (see vercel.json).
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('three') || id.includes('@react-three')) return 'vendor-three';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('zustand')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
})
