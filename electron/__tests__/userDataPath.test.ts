import { describe, expect, it } from 'vitest'
import { userDataOverride } from '../userDataPath'

describe('userDataOverride', () => {
  it('accepts an equals-form QA path without exposing any settings values', () => {
    expect(userDataOverride(['app.exe', '--user-data-dir=C:\\vd-vms\\qa-fixture\\user-data'])).toBe('C:\\vd-vms\\qa-fixture\\user-data')
  })

  it('accepts the separate argument form and ignores missing values', () => {
    expect(userDataOverride(['app.exe', '--user-data-dir', 'C:\\vd-vms\\qa-fixture\\separate'])).toBe('C:\\vd-vms\\qa-fixture\\separate')
    expect(userDataOverride(['app.exe', '--user-data-dir'])).toBeUndefined()
  })
})
