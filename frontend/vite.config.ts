import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 引入插件

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 注册插件
  ],
  // 顺便配置一下，避免 Tauri 开发时的端口冲突
  server: {
    port: 5173,
    strictPort: true,
  }
})