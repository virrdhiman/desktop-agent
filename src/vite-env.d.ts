/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/// <reference types="vite/client" />

declare const __VD_COMMIT_HASH__: string

interface Window {
  api: import('../electron/preload').ElectronAPI
}
