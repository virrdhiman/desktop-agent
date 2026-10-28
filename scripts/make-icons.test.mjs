import { describe, expect, it } from 'vitest'
import { removeWhiteMatte } from './make-icons.mjs'

function imageFromPixels(rows) {
  const pixels = Buffer.from(rows.flat())
  return { width: rows.length, height: 1, pixels }
}

describe('logo white-matte removal', () => {
  it('removes white pixels globally, including enclosed logo counters', () => {
    const image = imageFromPixels([
      [123, 178, 58, 255],
      [255, 255, 255, 255],
      [72, 86, 150, 255],
    ])
    const result = removeWhiteMatte(image)
    expect([...result.pixels.subarray(4, 8)]).toEqual([0, 0, 0, 0])
    expect(result.pixels[3]).toBe(255)
    expect(result.pixels[11]).toBe(255)
  })

  it('de-mattes antialiased white edges without a white fringe', () => {
    const green = [123, 178, 58]
    const halfCoverage = green.map((channel) => Math.round(channel * 0.5 + 255 * 0.5))
    const image = imageFromPixels([
      [...green, 255],
      [...halfCoverage, 255],
      [72, 86, 150, 255],
    ])
    const result = removeWhiteMatte(image)
    expect(result.pixels[7]).toBeGreaterThanOrEqual(118)
    expect(result.pixels[7]).toBeLessThanOrEqual(138)
    expect([...result.pixels.subarray(4, 7)]).toEqual(green)
    expect(result.pixels[7]).toBeGreaterThan(110)
    expect(result.pixels[7]).toBeLessThan(145)
  })

  it('preserves source transparency and existing antialias alpha', () => {
    const image = imageFromPixels([
      [123, 178, 58, 0],
      [123, 178, 58, 96],
      [123, 178, 58, 255],
    ])
    const result = removeWhiteMatte(image)
    expect(result.pixels[3]).toBe(0)
    expect(result.pixels[7]).toBe(96)
  })
})
