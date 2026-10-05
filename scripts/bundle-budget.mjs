import fs from 'fs'
import path from 'path'

const dist = path.join(process.cwd(), 'dist', 'assets')
const maxMonacoBytes = Number(process.env.VD_MONACO_BUDGET_BYTES || 3_200_000)
const maxWorkerBytes = Number(process.env.VD_MONACO_WORKER_BUDGET_BYTES || 350_000)

const entries = await fs.promises.readdir(dist, { withFileTypes: true }).catch(() => [])
const files = entries
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const file = path.join(dist, entry.name)
    return { name: entry.name, bytes: fs.statSync(file).size }
  })

const monaco = files.filter((file) => /monaco|worker|typescript|javascript|json|css|html|editor/i.test(file.name))
const workers = files.filter((file) => /worker/i.test(file.name))
const monacoBytes = monaco.reduce((sum, file) => sum + file.bytes, 0)
const workerBytes = workers.reduce((sum, file) => sum + file.bytes, 0)

console.log(`Monaco/editor asset budget: ${monacoBytes} bytes (limit ${maxMonacoBytes})`)
console.log(`Monaco worker asset budget: ${workerBytes} bytes (limit ${maxWorkerBytes})`)
for (const file of monaco.sort((a, b) => b.bytes - a.bytes).slice(0, 12)) {
  console.log(`  ${String(file.bytes).padStart(8)}  ${file.name}`)
}

if (monacoBytes > maxMonacoBytes) {
  console.error(`Monaco/editor assets exceed budget by ${monacoBytes - maxMonacoBytes} bytes.`)
  process.exit(1)
}
if (workerBytes > maxWorkerBytes) {
  console.error(`Monaco worker assets exceed budget by ${workerBytes - maxWorkerBytes} bytes.`)
  process.exit(1)
}
