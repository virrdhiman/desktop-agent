import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || 'release')
const port = Number(process.argv[3] || 0)
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '')
  const target = path.resolve(root, relative)
  const safe = target === root || target.startsWith(`${root}${path.sep}`)
  if (!safe || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404); response.end('Not found'); return
  }
  response.writeHead(200, { 'Content-Length': fs.statSync(target).size })
  fs.createReadStream(target).pipe(response)
})
server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/`))
process.on('SIGINT', () => server.close(() => process.exit(0)))
