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
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return

          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor'
          }

          if (
            id.includes('/node_modules/framer-motion/') ||
            id.includes('/node_modules/motion-dom/') ||
            id.includes('/node_modules/motion-utils/')
          ) {
            return 'motion-vendor'
          }

          if (id.includes('/node_modules/react-icons/')) {
            return 'icons-vendor'
          }

          if (
            id.includes('/node_modules/@dnd-kit/') ||
            id.includes('/node_modules/@headlessui/') ||
            id.includes('/node_modules/react-hot-toast/') ||
            id.includes('/node_modules/react-virtuoso/')
          ) {
            return 'ui-vendor'
          }

          if (id.includes('/node_modules/@tauri-apps/')) {
            return 'tauri-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
})
