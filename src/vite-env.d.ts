/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license MIT
 */
/// <reference types="vite/client" />

interface Window {
  api: import('../electron/preload').ElectronAPI
}
