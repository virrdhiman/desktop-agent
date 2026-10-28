/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'electron/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.mjs'],
    testTimeout: 15000,
    hookTimeout: 15000,
    onConsoleLog(log) {
      if (/Error: Test(?:$|\s)|Test error|Specific error message|Integration test crash|specific error 42|\bcrash\b/.test(log)) return false
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', 'dist-electron/'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
