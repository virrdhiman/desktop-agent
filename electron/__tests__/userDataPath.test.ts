import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { userDataOverride } from '../userDataPath'

describe('userDataOverride', () => {
  it('accepts an equals-form QA path without exposing any settings values', () => {
    const dir = path.join('qa-fixture', 'user-data')
    expect(userDataOverride(['app.exe', `--user-data-dir=${dir}`])).toBe(path.resolve(dir))
  })

  it('accepts the separate argument form and ignores missing values', () => {
    const dir = path.join('qa-fixture', 'separate')
    expect(userDataOverride(['app.exe', '--user-data-dir', dir])).toBe(path.resolve(dir))
    expect(userDataOverride(['app.exe', '--user-data-dir'])).toBeUndefined()
  })
})