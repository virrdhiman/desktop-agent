import { describe, expect, it } from 'vitest'
import { canDownloadInstaller, canOpenOfficialInstaller, createSetupItems, getSetupCatalog, isAllowlistedOfficialUrl, isExpectedSha256 } from './prerequisiteSetup'

describe('prerequisite setup', () => {
  it('starts with every optional item skipped and incomplete', () => {
    expect(createSetupItems().every((item) => !item.consented && !item.completed)).toBe(true)
  })

  it('keeps independent consent and completion states', () => {
    const items = createSetupItems({ vscode: true }, { bridge: true })
    expect(items.find((item) => item.id === 'vscode')).toMatchObject({ consented: true, completed: false })
    expect(items.find((item) => item.id === 'bridge')).toMatchObject({ consented: false, completed: true })
  })

  it('only permits the allowlisted official HTTPS hosts', () => {
    expect(canOpenOfficialInstaller(createSetupItems()[0])).toBe(true)
    expect(canOpenOfficialInstaller({ ...createSetupItems()[0], officialUrl: 'http://code.visualstudio.com' })).toBe(false)
    expect(canOpenOfficialInstaller({ ...createSetupItems()[0], officialUrl: 'https://example.com' })).toBe(false)
  })

  it('requires a consented fixed artifact and a complete expected hash before download', () => {
    const vscode = getSetupCatalog('win32')[0]
    expect(canDownloadInstaller(vscode, '')).toBe(false)
    expect(canDownloadInstaller(vscode, 'a'.repeat(63))).toBe(false)
    expect(canDownloadInstaller(vscode, 'a'.repeat(64))).toBe(true)
    expect(isExpectedSha256('A'.repeat(64))).toBe(true)
    expect(isExpectedSha256('not-a-hash')).toBe(false)
  })

  it('rejects arbitrary URLs and unsafe URL components', () => {
    expect(isAllowlistedOfficialUrl('https://code.visualstudio.com/download')).toBe(true)
    expect(isAllowlistedOfficialUrl('https://code.visualstudio.com.evil.example/download')).toBe(false)
    expect(isAllowlistedOfficialUrl('https://code.visualstudio.com:444/download')).toBe(false)
    expect(isAllowlistedOfficialUrl('https://github.com/evil/release.exe')).toBe(false)
  })

  it('marks dynamic-hash artifacts unavailable on unsupported platforms', () => {
    expect(getSetupCatalog('darwin').find((item) => item.id === 'vscode')).toMatchObject({ unavailableReason: expect.any(String) })
    expect(getSetupCatalog('win32').find((item) => item.id === 'bridge')).toMatchObject({ unavailableReason: expect.any(String) })
  })
})
