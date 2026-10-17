// Makes the home-screen icons: a plain green tile with cream "GD" text (a text wordmark,
// not GoodCane's logo or artwork). No dependencies: pixels are drawn here and written as PNG
// with node:zlib. Run once with `node scripts/make-icons.mjs`; the output is committed.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const GREEN = [0x1f, 0x5c, 0x2f] // cane-700
const CREAM = [0xfd, 0xf8, 0xea] // cream-100

// 5 x 7 bitmap letters.
const LETTERS = {
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.']
}

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, pixelAt) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  const rows = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3)
    rows[rowStart] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y)
      rows[rowStart + 1 + x * 3] = r
      rows[rowStart + 2 + x * 3] = g
      rows[rowStart + 3 + x * 3] = b
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function icon(size) {
  // "G", a one-cell gap, "D": 11 cells wide, 7 tall, filling about 55% of the width
  // (inside the maskable safe zone).
  const columns = 11
  const cell = Math.floor((size * 0.55) / columns)
  const left = Math.floor((size - cell * columns) / 2)
  const top = Math.floor((size - cell * 7) / 2)
  return png(size, (x, y) => {
    const cx = Math.floor((x - left) / cell)
    const cy = Math.floor((y - top) / cell)
    if (x < left || y < top || cx >= columns || cy >= 7) return GREEN
    const letter = cx < 5 ? LETTERS.G : cx >= 6 ? LETTERS.D : null
    const col = cx < 5 ? cx : cx - 6
    return letter && letter[cy][col] === '#' ? CREAM : GREEN
  })
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1f5c2f"/>
  <text x="256" y="300" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="200" fill="#fdf8ea">GD</text>
</svg>
`

mkdirSync('public/icons', { recursive: true })
for (const size of [180, 192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, icon(size))
}
writeFileSync('public/icons/icon.svg', svg)
console.log('Wrote public/icons/icon-180.png, icon-192.png, icon-512.png and icon.svg')
