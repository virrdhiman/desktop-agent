// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildRepoIndex } from '../repoIndex'

describe('repoIndex 5k-file benchmark', () => {
  it('indexes 5,000 bounded fixture files and reports incremental reuse', async () => {
    if (process.env.REPO_INDEX_BENCHMARK !== '1') return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-repo-index-bench-'))
    try {
      for (let i = 0; i < 5_000; i++) fs.writeFileSync(path.join(root, `file-${i}.ts`), `export const Symbol${i} = ${i}\n`)
      const started = performance.now()
      const first = await buildRepoIndex(root, true)
      const initialMs = Math.round(performance.now() - started)
      const incrementalStarted = performance.now()
      const second = await buildRepoIndex(root)
      const incrementalMs = Math.round(performance.now() - incrementalStarted)
      console.log(`repoIndex benchmark: files=${first.files} initialMs=${initialMs} incrementalMs=${incrementalMs} reused=${second.reusedFiles}`)
      expect(first.files).toBe(5_000)
      expect(second.cached).toBe(true)
      expect(second.reusedFiles).toBe(5_000)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 120_000)
})
