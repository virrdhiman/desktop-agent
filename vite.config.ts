/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@monaco-editor/react')) return 'monaco-react'
          if (id.includes('monaco-editor/esm/vs/language/typescript')) return 'monaco-ts'
          if (id.includes('monaco-editor/esm/vs/language')) return 'monaco-languages'
          if (id.includes('monaco-editor/esm/vs/editor')) return 'monaco-editor-core'
          if (id.includes('monaco-editor/esm/vs/base') || id.includes('monaco-editor/esm/vs/platform')) return 'monaco-platform'
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-vendor'
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark') || id.includes('node_modules/rehype') || id.includes('node_modules/unified') || id.includes('node_modules/mdast') || id.includes('node_modules/hast') || id.includes('node_modules/micromark')) return 'markdown-vendor'
          if (id.includes('node_modules/zustand')) return 'state-vendor'
        },
      },
    },
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'simple-git', 'node-pty', 'electron-updater', 'yauzl'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            // Sandboxed preloads cannot be ES modules, so opt out of the plugin's ESM lib build.
            lib: false,
            rollupOptions: {
              input: 'electron/preload.ts',
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
