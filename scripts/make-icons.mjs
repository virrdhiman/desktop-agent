import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const source = path.resolve(process.argv[2] || 'C:/vd-vms/assets/pit-logo.png')

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function decodePng(file) {
  const input = fs.readFileSync(file)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!input.subarray(0, 8).equals(signature)) throw new Error(`Not a PNG: ${file}`)
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  while (offset < input.length) {
    const length = input.readUInt32BE(offset)
    const type = input.toString('ascii', offset + 4, offset + 8)
    const data = input.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error('Only non-interlaced 8-bit RGB/RGBA PNG files are supported')
  }
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(width * height * 4)
  const previous = Buffer.alloc(stride)
  let rawOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++]
    const row = Buffer.from(raw.subarray(rawOffset, rawOffset + stride))
    rawOffset += stride
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0
      const up = previous[x] || 0
      const upperLeft = x >= channels ? previous[x - channels] || 0 : 0
      if (filter === 1) row[x] = (row[x] + left) & 255
      else if (filter === 2) row[x] = (row[x] + up) & 255
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) {
        const estimate = left + up - upperLeft
        const pa = Math.abs(estimate - left)
        const pb = Math.abs(estimate - up)
        const pc = Math.abs(estimate - upperLeft)
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft
        row[x] = (row[x] + predictor) & 255
      } else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`)
    }
    for (let x = 0; x < width; x += 1) {
      const inputOffset = x * channels
      const outputOffset = (y * width + x) * 4
      pixels[outputOffset] = row[inputOffset]
      pixels[outputOffset + 1] = row[inputOffset + 1]
      pixels[outputOffset + 2] = row[inputOffset + 2]
      pixels[outputOffset + 3] = channels === 4 ? row[inputOffset + 3] : 255
    }
    row.copy(previous)
  }
  return { width, height, pixels }
}

function encodePng(width, height, pixels) {
  const scanlines = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1)
    pixels.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function dominantColors(image) {
  const counts = new Map()
  for (let i = 0; i < image.pixels.length; i += 4) {
    const r = image.pixels[i]
    const g = image.pixels[i + 1]
    const b = image.pixels[i + 2]
    const minimum = Math.min(r, g, b)
    const maximum = Math.max(r, g, b)
    if (image.pixels[i + 3] < 240 || minimum > 245 || maximum - minimum < 18 || (maximum - minimum) / Math.max(1, maximum) < 0.35) continue
    const key = `${r},${g},${b}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const colors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key.split(',').map(Number))
  const selected = []
  for (const color of colors) {
    if (selected.every((other) => Math.hypot(color[0] - other[0], color[1] - other[1], color[2] - other[2]) > 24)) selected.push(color)
    if (selected.length === 4) break
  }
  return selected.length ? selected : [[123, 178, 58], [72, 86, 150]]
}

function removeWhiteMatte(image) {
  const palette = dominantColors(image)
  const output = Buffer.from(image.pixels)
  for (let i = 0; i < output.length; i += 4) {
    const color = [output[i], output[i + 1], output[i + 2]]
    const sourceAlpha = image.pixels[i + 3]
    if (sourceAlpha === 0) continue
    // Remove white everywhere, including enclosed counters and gaps. This is
    // intentionally pixel based rather than a flood fill from the canvas edge.
    if (Math.min(...color) > 250 && Math.max(...color) - Math.min(...color) < 8) {
      output[i] = 0
      output[i + 1] = 0
      output[i + 2] = 0
      output[i + 3] = 0
      continue
    }
    // Existing fractional alpha is already antialiased; don't matte it twice.
    if (sourceAlpha < 255) continue
    let best = { error: Infinity, alpha: 0, color }
    for (const foreground of palette) {
      const vector = foreground.map((channel) => 255 - channel)
      const sample = color.map((channel) => 255 - channel)
      const denominator = vector.reduce((sum, channel) => sum + channel * channel, 0)
      const alpha = Math.max(0, Math.min(1, sample.reduce((sum, channel, index) => sum + channel * vector[index], 0) / denominator))
      const predicted = vector.map((channel) => 255 - alpha * channel)
      const error = Math.hypot(...predicted.map((channel, index) => channel - color[index]))
      if (error < best.error) best = { error, alpha, color: foreground }
    }
    if (best.alpha < 0.035 || (best.error > 22 && Math.min(...color) > 235)) output[i + 3] = 0
    else if (best.error <= 32) {
      output[i] = best.color[0]
      output[i + 1] = best.color[1]
      output[i + 2] = best.color[2]
      output[i + 3] = Math.round(best.alpha * 255)
    } else output[i + 3] = 255
  }
  return { ...image, pixels: output }
}

function alphaBounds(image, predicate = () => true) {
  let left = image.width
  let top = image.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      if (image.pixels[offset + 3] > 8 && predicate(x, y)) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
  }
  return right < left ? null : { left, top, right: right + 1, bottom: bottom + 1 }
}

function crop(image, bounds, padding = 0) {
  const left = Math.max(0, bounds.left - padding)
  const top = Math.max(0, bounds.top - padding)
  const right = Math.min(image.width, bounds.right + padding)
  const bottom = Math.min(image.height, bounds.bottom + padding)
  const output = Buffer.alloc((right - left) * (bottom - top) * 4)
  for (let y = top; y < bottom; y += 1) image.pixels.copy(output, (y - top) * (right - left) * 4, (y * image.width + left) * 4, (y * image.width + right) * 4)
  return { width: right - left, height: bottom - top, pixels: output }
}

function squarePad(image, padding) {
  const size = Math.max(image.width, image.height) + padding * 2
  const output = Buffer.alloc(size * size * 4)
  const xOffset = Math.floor((size - image.width) / 2)
  const yOffset = Math.floor((size - image.height) / 2)
  for (let y = 0; y < image.height; y += 1) image.pixels.copy(output, ((y + yOffset) * size + xOffset) * 4, y * image.width * 4, (y + 1) * image.width * 4)
  return { width: size, height: size, pixels: output }
}

function sinc(value) {
  if (value === 0) return 1
  const piValue = Math.PI * value
  return Math.sin(piValue) / piValue
}

function lanczos(value, radius = 3) {
  const distance = Math.abs(value)
  return distance >= radius ? 0 : sinc(value) * sinc(value / radius)
}

function resample(image, width, height) {
  const horizontal = Buffer.alloc(width * image.height * 4)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = (x + 0.5) * image.width / width - 0.5
      const start = Math.floor(center - 3 + 1)
      let red = 0; let green = 0; let blue = 0; let alpha = 0; let weightSum = 0
      for (let sourceX = start; sourceX <= start + 6; sourceX += 1) {
        const clampedX = Math.max(0, Math.min(image.width - 1, sourceX))
        const weight = lanczos(center - sourceX)
        const offset = (y * image.width + clampedX) * 4
        const sampleAlpha = image.pixels[offset + 3] / 255
        red += image.pixels[offset] * sampleAlpha * weight
        green += image.pixels[offset + 1] * sampleAlpha * weight
        blue += image.pixels[offset + 2] * sampleAlpha * weight
        alpha += sampleAlpha * weight
        weightSum += weight
      }
      const outputOffset = (y * width + x) * 4
      const normalizedAlpha = Math.max(0, Math.min(1, alpha / weightSum))
      horizontal[outputOffset] = normalizedAlpha ? Math.round(Math.max(0, Math.min(255, red / (weightSum * normalizedAlpha)))) : 0
      horizontal[outputOffset + 1] = normalizedAlpha ? Math.round(Math.max(0, Math.min(255, green / (weightSum * normalizedAlpha)))) : 0
      horizontal[outputOffset + 2] = normalizedAlpha ? Math.round(Math.max(0, Math.min(255, blue / (weightSum * normalizedAlpha)))) : 0
      horizontal[outputOffset + 3] = Math.round(normalizedAlpha * 255)
    }
  }
  const output = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const center = (y + 0.5) * image.height / height - 0.5
    const start = Math.floor(center - 3 + 1)
    for (let x = 0; x < width; x += 1) {
      let red = 0; let green = 0; let blue = 0; let alpha = 0; let weightSum = 0
      for (let sourceY = start; sourceY <= start + 6; sourceY += 1) {
        const clampedY = Math.max(0, Math.min(image.height - 1, sourceY))
        const weight = lanczos(center - sourceY)
        const offset = (clampedY * width + x) * 4
        const sampleAlpha = horizontal[offset + 3] / 255
        red += horizontal[offset] * sampleAlpha * weight
        green += horizontal[offset + 1] * sampleAlpha * weight
        blue += horizontal[offset + 2] * sampleAlpha * weight
        alpha += sampleAlpha * weight
        weightSum += weight
      }
      const outputOffset = (y * width + x) * 4
      const normalizedAlpha = Math.max(0, Math.min(1, alpha / weightSum))
      output[outputOffset] = normalizedAlpha ? Math.round(Math.max(0, Math.min(255, red / (weightSum * normalizedAlpha)))) : 0
      output[outputOffset + 1] = normalizedAlpha ? Math.round(Math.max(0, Math.min(255, green / (weightSum * normalizedAlpha)))) : 0
      output[outputOffset + 2] = normalizedAlpha ? Math.round(Math.max(0, Math.min(255, blue / (weightSum * normalizedAlpha)))) : 0
      output[outputOffset + 3] = Math.round(normalizedAlpha * 255)
    }
  }
  return { width, height, pixels: output }
}

function writeIco(image, sizes) {
  const pngs = sizes.map((size) => encodePng(size, size, resample(image, size, size).pixels))
  const header = Buffer.alloc(6 + pngs.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = header.length
  for (let index = 0; index < sizes.length; index += 1) {
    const entry = 6 + index * 16
    const size = sizes[index]
    header[entry] = size === 256 ? 0 : size
    header[entry + 1] = size === 256 ? 0 : size
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(pngs[index].length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += pngs[index].length
  }
  return Buffer.concat([header, ...pngs])
}

function writeIcns(image) {
  const entries = [['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]].map(([type, size]) => [type, encodePng(size, size, resample(image, size, size).pixels)])
  const length = 8 + entries.reduce((total, [, png]) => total + 8 + png.length, 0)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(length, 4)
  const chunks = entries.map(([type, png]) => {
    const chunkHeader = Buffer.alloc(8)
    chunkHeader.write(type, 0, 4, 'ascii')
    chunkHeader.writeUInt32BE(8 + png.length, 4)
    return Buffer.concat([chunkHeader, png])
  })
  return Buffer.concat([header, ...chunks])
}

function main() {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
  const srcAssets = path.join(root, 'src', 'assets')
  const build = path.join(root, 'build')
  const publicDir = path.join(root, 'public')
  if (!fs.existsSync(source)) throw new Error(`Logo source not found: ${source}`)
  const decoded = decodePng(source)
  if (decoded.width < 1024 || decoded.height < 1024) console.warn(`Warning: logo source is low resolution (${decoded.width}x${decoded.height}); supply a vector or 2048px PNG later for sharper regenerated icons.`)
  const clean = removeWhiteMatte(decoded)
  const fullBounds = alphaBounds(clean)
  if (!fullBounds) throw new Error('Logo contains no non-white pixels after background removal')
  const trimmed = squarePad(crop(clean, fullBounds, 12), 12)
  const rows = Array.from({ length: clean.height }, (_, y) => {
    let count = 0
    for (let x = 0; x < clean.width; x += 1) if (clean.pixels[(y * clean.width + x) * 4 + 3] > 8) count += 1
    return count
  })
  let gapEnd = Math.floor(clean.height * 0.45)
  for (let y = 1; y < clean.height - 1; y += 1) {
    if (rows[y] === 0 && rows[y - 1] > 0 && rows[y + 1] > 0) { gapEnd = y; break }
  }
  const markBounds = alphaBounds(clean, (_x, y) => y < gapEnd)
  if (!markBounds) throw new Error('Could not isolate the gears mark above the wordmark')
  const mark = resample(squarePad(crop(clean, markBounds, 8), 12), 1024, 1024)
  fs.mkdirSync(srcAssets, { recursive: true })
  fs.mkdirSync(build, { recursive: true })
  fs.mkdirSync(publicDir, { recursive: true })
  fs.writeFileSync(path.join(srcAssets, 'pit-logo.png'), encodePng(clean.width, clean.height, clean.pixels))
  fs.writeFileSync(path.join(srcAssets, 'pit-logo-trimmed.png'), encodePng(trimmed.width, trimmed.height, trimmed.pixels))
  fs.writeFileSync(path.join(build, 'icon.png'), encodePng(1024, 1024, mark.pixels))
  const ico = writeIco(mark, [16, 24, 32, 48, 64, 128, 256])
  fs.writeFileSync(path.join(build, 'icon.ico'), ico)
  fs.writeFileSync(path.join(build, 'icon.icns'), writeIcns(mark))
  fs.writeFileSync(path.join(publicDir, 'favicon-32.png'), encodePng(32, 32, resample(mark, 32, 32).pixels))
  fs.writeFileSync(path.join(publicDir, 'favicon-64.png'), encodePng(64, 64, resample(mark, 64, 64).pixels))
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico)
  console.log(`Generated full logo ${clean.width}x${clean.height}, trimmed logo ${trimmed.width}x${trimmed.height}, and gears mark 1024x1024`)
  console.log('Generated build/icon.png, build/icon.ico, build/icon.icns, and public favicon PNG/ICO assets')
}

export { removeWhiteMatte }

if (import.meta.url.startsWith('file:') && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
