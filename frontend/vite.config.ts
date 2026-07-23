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
})
