import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function pngSize(file: string) {
  const bytes = fs.readFileSync(file)
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('PIT logo assets', () => {
  it('keeps the supplied full logo and transparent trimmed copy', () => {
    expect(pngSize(path.join(root, 'src/assets/pit-logo.png'))).toEqual({ width: 800, height: 600 })
    const trimmed = pngSize(path.join(root, 'src/assets/pit-logo-trimmed.png'))
    expect(trimmed.width).toBe(trimmed.height)
  })

  it('ships a square 1024px mark and all requested ICO sizes', () => {
    expect(pngSize(path.join(root, 'build/icon.png'))).toEqual({ width: 1024, height: 1024 })
    const ico = fs.readFileSync(path.join(root, 'build/icon.ico'))
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(7)
    const sizes = Array.from({ length: 7 }, (_, index) => {
      const offset = 6 + index * 16
      return ico[offset] || 256
    })
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256])
  })
})
