import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const outDir = path.resolve('build')
fs.mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function setPixel(buf, width, x, y, rgba) {
  if (x < 0 || y < 0 || x >= width || y >= width) return
  const i = (y * width + x) * 4
  buf[i] = rgba[0]
  buf[i + 1] = rgba[1]
  buf[i + 2] = rgba[2]
  buf[i + 3] = rgba[3]
}

function drawLine(buf, size, x1, y1, x2, y2, thickness, rgba) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2)
  const radius = Math.max(1, thickness / 2)
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const x = x1 + (x2 - x1) * t
    const y = y1 + (y2 - y1) * t
    for (let yy = Math.floor(y - radius); yy <= Math.ceil(y + radius); yy++) {
      for (let xx = Math.floor(x - radius); xx <= Math.ceil(x + radius); xx++) {
        if (Math.hypot(xx - x, yy - y) <= radius) setPixel(buf, size, xx, yy, rgba)
      }
    }
  }
}

function drawArc(buf, size, cx, cy, rx, ry, start, end, thickness, rgba) {
  const steps = 260
  let prev = null
  for (let i = 0; i <= steps; i++) {
    const angle = start + ((end - start) * i) / steps
    const point = [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]
    if (prev) drawLine(buf, size, prev[0], prev[1], point[0], point[1], thickness, rgba)
    prev = point
  }
}

function makePng(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const radius = size * 0.18
  const center = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(Math.abs(x - center) - (center - radius), 0)
      const dy = Math.max(Math.abs(y - center) - (center - radius), 0)
      if (Math.hypot(dx, dy) > radius) continue
      const t = (x + y) / (size * 2)
      setPixel(rgba, size, x, y, [
        Math.round(14 + 24 * t),
        Math.round(23 + 42 * t),
        Math.round(45 + 58 * t),
        255,
      ])
    }
  }

  const cyan = [56, 189, 248, 255]
  const white = [245, 248, 255, 255]
  const stroke = Math.max(4, Math.round(size * 0.075))
  drawLine(rgba, size, size * 0.16, size * 0.25, size * 0.31, size * 0.75, stroke, cyan)
  drawLine(rgba, size, size * 0.46, size * 0.25, size * 0.31, size * 0.75, stroke, cyan)
  drawLine(rgba, size, size * 0.56, size * 0.25, size * 0.56, size * 0.75, stroke, white)
  drawArc(rgba, size, size * 0.56, size * 0.5, size * 0.24, size * 0.25, -Math.PI / 2, Math.PI / 2, stroke, white)

  const scanlines = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const dst = y * (size * 4 + 1)
    scanlines[dst] = 0
    rgba.copy(scanlines, dst + 1, y * size * 4, (y + 1) * size * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const png256 = makePng(256)
fs.writeFileSync(path.join(outDir, 'icon.png'), png256)

const sizes = [16, 32, 48, 256]
const pngs = sizes.map(makePng)
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + i * 16
  header[entry] = sizes[i] === 256 ? 0 : sizes[i]
  header[entry + 1] = sizes[i] === 256 ? 0 : sizes[i]
  header[entry + 2] = 0
  header[entry + 3] = 0
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(pngs[i].length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += pngs[i].length
}
fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([header, ...pngs]))

fs.writeFileSync(path.join(outDir, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="46" fill="#0e172d"/>
  <path d="M42 64l38 128L118 64" fill="none" stroke="#38bdf8" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M148 64v128h18c41 0 70-27 70-64s-29-64-70-64h-18z" fill="none" stroke="#f5f8ff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`)

console.log('Generated build/icon.png, build/icon.ico, and build/icon.svg')
