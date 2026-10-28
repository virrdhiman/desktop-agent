import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function decodePng(input) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!input.subarray(0, 8).equals(signature)) throw new Error('PNG signature missing')
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  for (let offset = 8; offset < input.length;) {
    const length = input.readUInt32BE(offset)
    const type = input.toString('ascii', offset + 4, offset + 8)
    const data = input.subarray(offset + 8, offset + 8 + length)
    offset += length + 12
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) throw new Error('Unsupported PNG encoding')
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const raw = zlib.inflateSync(Buffer.concat(idat))
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
        const predictor = left + up - upperLeft
        const distances = [Math.abs(predictor - left), Math.abs(predictor - up), Math.abs(predictor - upperLeft)]
        row[x] = (row[x] + (distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : upperLeft)) & 255
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

function report(name, bytes) {
  const image = decodePng(bytes)
  let transparent = 0
  let nearWhiteOpaque = 0
  for (let i = 0; i < image.pixels.length; i += 4) {
    const [red, green, blue, alpha] = image.pixels.subarray(i, i + 4)
    if (alpha === 0) transparent += 1
    if (red > 240 && green > 240 && blue > 240 && alpha === 255) nearWhiteOpaque += 1
  }
  console.log(`${name}: ${image.width}x${image.height}; alpha=0 pixels=${transparent}; near-white opaque=${nearWhiteOpaque}`)
}

function reportIco(file) {
  const input = fs.readFileSync(file)
  if (input.readUInt16LE(0) !== 0 || input.readUInt16LE(2) !== 1) throw new Error('Not an ICO file')
  const count = input.readUInt16LE(4)
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16
    const size = input[entry] || 256
    const length = input.readUInt32LE(entry + 8)
    const offset = input.readUInt32LE(entry + 12)
    report(`${path.basename(file)} ${size}x${size}`, input.subarray(offset, offset + length))
  }
}

for (const file of process.argv.slice(2)) {
  if (file.toLowerCase().endsWith('.ico')) reportIco(file)
  else report(path.basename(file), fs.readFileSync(file))
}
