import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputPath = process.argv[2] || path.join(root, 'src', 'assets', 'pit-logo.png')

function decodePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('Input is not a PNG file')
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const compressed = []
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += length + 12
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') compressed.push(data)
    else if (type === 'IEND') break
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error('Expected a non-interlaced 8-bit RGB or RGBA PNG')
  }
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const raw = zlib.inflateSync(Buffer.concat(compressed))
  const pixels = Buffer.alloc(width * height * 4)
  let previous = Buffer.alloc(stride)
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset++]
    const row = Buffer.from(raw.subarray(offset, offset + stride))
    offset += stride
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0
      const up = previous[x] || 0
      const upperLeft = x >= channels ? previous[x - channels] || 0 : 0
      if (filter === 1) row[x] = (row[x] + left) & 255
      else if (filter === 2) row[x] = (row[x] + up) & 255
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) {
        const estimate = left + up - upperLeft
        const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upperLeft)]
        row[x] = (row[x] + (distances[0] <= distances[1] && distances[0] <= distances[2]
          ? left
          : distances[1] <= distances[2] ? up : upperLeft)) & 255
      } else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`)
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * channels
      const target = (y * width + x) * 4
      pixels[target] = row[source]
      pixels[target + 1] = row[source + 1]
      pixels[target + 2] = row[source + 2]
      pixels[target + 3] = channels === 4 ? row[source + 3] : 255
    }
    previous = row
  }
  return { width, height, pixels }
}

const image = decodePng(fs.readFileSync(inputPath))
const counts = new Map()
let opaquePixels = 0
for (let index = 0; index < image.pixels.length; index += 4) {
  if (image.pixels[index + 3] !== 255) continue
  opaquePixels += 1
  const key = [...image.pixels.subarray(index, index + 3)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  counts.set(key, (counts.get(key) || 0) + 1)
}

console.log(`${path.relative(root, inputPath)}: ${image.width}x${image.height}; opaque pixels=${opaquePixels}`)
for (const [hex, count] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`#${hex} ${count} pixels (${(count / opaquePixels * 100).toFixed(2)}%)`)
}
