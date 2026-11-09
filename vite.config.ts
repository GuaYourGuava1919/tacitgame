import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // 部署在子路徑時設定，例如 GitHub Pages：BASE_PATH=/tacitgame/ npm run build
  base: process.env.BASE_PATH || '/',
  plugins: [vue()],
  server: {
    host: true,
    proxy: {
      // 用 127.0.0.1 而不是 localhost：Windows 會先試 IPv6，可能連到別的程式
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
})
