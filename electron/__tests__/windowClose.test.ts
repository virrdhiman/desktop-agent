import { describe, expect, it } from 'vitest'
import { isSafeWorkspaceFile, nextQaDialogChoice } from '../windowClose'

describe('unsaved window close helpers', () => {
  it('consumes QA dialog choices in order', () => {
    const queue = ['cancel', 'save', 'dont-save'] as const
    expect(nextQaDialogChoice([...queue])).toBe('cancel')
    const remaining = [...queue]
    expect(nextQaDialogChoice(remaining)).toBe('cancel')
    expect(nextQaDialogChoice(remaining)).toBe('save')
    expect(nextQaDialogChoice(remaining)).toBe('dont-save')
    expect(nextQaDialogChoice(remaining)).toBeUndefined()
  })

  it('only allows saving inside the workspace', () => {
    expect(isSafeWorkspaceFile('C:/fixture', 'C:/fixture/src/app.ts')).toBe(true)
    expect(isSafeWorkspaceFile('C:/fixture', 'C:/fixture/../secrets.txt')).toBe(false)
  })
})
