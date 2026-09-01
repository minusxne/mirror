import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const API_PORT = process.env.API_PORT || 5174

export default defineConfig({
  plugins: [vue()],
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    strictPort: false,
    proxy: {
      // In dev, Vite serves the UI and forwards data calls to the API server.
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200
  }
})
