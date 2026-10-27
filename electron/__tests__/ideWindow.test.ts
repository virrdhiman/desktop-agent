import { describe, expect, it, vi } from 'vitest'
import { SingleIdeWindow } from '../ideWindow'
import { SharedStateStore } from '../sharedState'
import type { SharedAppState } from '../../src/types'

function fakeWindow() {
  return { isDestroyed: vi.fn(() => false), show: vi.fn(), focus: vi.fn() }
}

describe('single IDE window lifecycle', () => {
  it('creates once and focuses the existing window on repeated opens', () => {
    const first = fakeWindow()
    const create = vi.fn(() => first)
    const manager = new SingleIdeWindow(create)

    expect(manager.openOrFocus().created).toBe(true)
    expect(manager.openOrFocus().created).toBe(false)
    expect(create).toHaveBeenCalledOnce()
    expect(first.show).toHaveBeenCalledTimes(2)
    expect(first.focus).toHaveBeenCalledTimes(2)
  })

  it('recreates the window after the old one is destroyed or closed', () => {
    const first = fakeWindow()
    const second = fakeWindow()
    first.isDestroyed.mockReturnValue(true)
    const manager = new SingleIdeWindow(vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second))

    const opened = manager.openOrFocus().window
    expect(manager.openOrFocus().window).toBe(second)
    manager.setClosed(opened)
    expect(manager.get()).toBe(second)
  })
})

describe('shared renderer state', () => {
  it('keeps the latest state available to a newly opened window', () => {
    const store = new SharedStateStore()
    const state = { version: 1, workspacePath: 'C:/workspace' } as SharedAppState
    store.set(state)
    expect(store.get()).toEqual(state)
  })
})
