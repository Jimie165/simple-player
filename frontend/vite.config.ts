import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: ['edge111', 'safari16.4'],
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'immersive-player',
              test: /src[\\/]features[\\/]player[\\/](?:now-playing|lyrics)[\\/]/,
              priority: 5,
            },
            {
              name: 'library',
              test: /src[\\/]features[\\/]library[\\/]/,
              priority: 5,
            },
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 60,
            },
            {
              name: 'motion-vendor',
              test: /node_modules[\\/](?:framer-motion|motion-dom|motion-utils)[\\/]/,
              priority: 50,
            },
            {
              name: 'icons-vendor',
              test: /node_modules[\\/]react-icons[\\/]/,
              priority: 40,
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](?:@dnd-kit[\\/][^\\/]+|@headlessui[\\/][^\\/]+|react-hot-toast|react-virtuoso)[\\/]/,
              priority: 30,
            },
            {
              name: 'tauri-vendor',
              test: /node_modules[\\/]@tauri-apps[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
