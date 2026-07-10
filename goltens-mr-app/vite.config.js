import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/invoke': {
        target: 'https://ua3vzm7fnf.execute-api.eu-central-1.amazonaws.com/prod',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/invoke/, '/invoke'),
      }
    }
  }
})