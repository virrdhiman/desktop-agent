import { spawn } from 'node:child_process'

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const child = spawn(command, ['vitest', 'run', 'electron/__tests__/repoIndex.benchmark.test.ts', '--maxWorkers=1', '--silent=false', '--reporter=verbose'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, REPO_INDEX_BENCHMARK: '1' },
})
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
