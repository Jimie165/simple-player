import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import legacy from '@vitejs/plugin-legacy'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    legacy({
      renderLegacyChunks: false,
      modernTargets: ['edge>=109', 'safari>=13'],
      modernPolyfills: true,
      additionalModernPolyfills: [
        'core-js/modules/es.object.has-own.js',
        'core-js/modules/web.structured-clone.js',
        'core-js/modules/es.array.at.js',
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 React 核心库分离
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 将大型 UI 库分离
          'ui-vendor': ['framer-motion', '@headlessui/react'],
          // 将图标库分离
          'icons': ['react-icons'],
          // 将虚拟化库分离
          'virtualization': ['react-virtuoso', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', '@dnd-kit/modifiers'],
        },
      },
    },
    // 提高警告阈值到 1000KB（Tauri 应用本地运行，不太担心加载速度）
    chunkSizeWarningLimit: 1000,
  },
})