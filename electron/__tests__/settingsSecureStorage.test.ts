// @vitest-environment node
/** IPC storage boundary; all filesystem and keychain operations are mocked. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  available: vi.fn(() => false),
  encrypt: vi.fn(() => Buffer.from('encrypted-by-os')),
  read: vi.fn(async () => { throw new Error('no saved settings') }),
  write: vi.fn(async (_path: string, _value: string) => {}),
  rename: vi.fn(async () => {}),
}))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/mock-profile', getAppPath: () => 'C:/mock-app', isPackaged: false },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => Promise<any>) => mocks.handlers.set(channel, handler) },
  safeStorage: { isEncryptionAvailable: mocks.available, encryptString: mocks.encrypt, decryptString: vi.fn(), getSelectedStorageBackend: () => 'gnome_libsecret' },
}))
vi.mock('fs', () => ({ default: { promises: { readFile: mocks.read, writeFile: mocks.write, rename: mocks.rename }, existsSync: () => false } }))
vi.mock('../browserTool', () => ({ closeBrowserSessions: vi.fn() }))

import { registerSettingsHandlers } from '../handlers/settings'

describe('settings IPC secure storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    registerSettingsHandlers()
  })

  it('refuses plaintext persistence when secure storage is unavailable', async () => {
    const save = mocks.handlers.get('settings:save')!
    const result = await save(null, { providers: [{ id: 'groq', apiKey: 'synthetic-example-key' }] })
    expect(result).toEqual({ error: expect.stringContaining('Secure OS key storage is unavailable') })
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('encrypts a key before writing settings', async () => {
    mocks.available.mockReturnValueOnce(true)
    const save = mocks.handlers.get('settings:save')!
    expect(await save(null, { providers: [{ id: 'groq', apiKey: 'synthetic-example-key' }] })).toEqual({ success: true })
    const serialized = mocks.write.mock.calls[0][1]
    expect(serialized).not.toContain('synthetic-example-key')
    expect(JSON.parse(serialized).providers[0].apiKey).toMatch(/^enc:/)
  })
})
