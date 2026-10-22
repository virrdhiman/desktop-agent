import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import yazl from 'yazl'
import { describe, expect, it } from 'vitest'
import { BENCHMARK_V2_TASKS, BENCHMARK_V2_TASKS_TEXT } from './benchmark-v3-prompts.mjs'
import { taskWorkspacePath } from './benchmark-v3-paths.mjs'
import {
  extractTestCount,
  validateTask1,
  validateTask2,
  validateTask3,
  validateTask4,
  validateTask5,
  validateTask6,
  validateTask7,
  validateTask8,
  validateTask11,
  benchmarkResultStatus,
} from './benchmark-v3-validators.mjs'

async function makeTemp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'vd-agent-bench-validator-'))
}

async function writeZip(file, entries) {
  const zip = new yazl.ZipFile()
  const output = (await import('node:fs')).createWriteStream(file)
  zip.outputStream.pipe(output)
  for (const [name, content] of entries) zip.addBuffer(Buffer.from(content), name)
  await new Promise((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    zip.end()
  })
}

describe('benchmark v3 prompt source', () => {
  it('keeps the exact eleven v2 task lines in order', () => {
    expect(BENCHMARK_V2_TASKS).toHaveLength(11)
    expect(BENCHMARK_V2_TASKS[0].text).toBe('1 Coding: Python CLI (CSV to summary stats) + 3 unit tests; agent runs them, they pass.')
    expect(BENCHMARK_V2_TASKS[10].text).toContain("Don't push this.")
    expect(BENCHMARK_V2_TASKS_TEXT.split('\n').every((line, index) => line.startsWith(`${index + 1} `))).toBe(true)
  })
})

describe('benchmark v3 independent validators', () => {
  it('keeps every task in an isolated workspace', () => {
    expect(path.normalize(taskWorkspacePath('C:/bench/gemini', 2))).toBe(path.normalize('C:/bench/gemini/task-2/workspace'))
    expect(taskWorkspacePath('C:/bench/gemini', 7)).not.toBe(taskWorkspacePath('C:/bench/gemini', 2))
  })

  it('requires a runnable CSV summary CLI and three passing tests', async () => {
    const root = await makeTemp()
    await fs.writeFile(path.join(root, 'summary_cli.py'), "import csv, sys\nif __name__ == '__main__':\n with open(sys.argv[1], newline='') as f: print(len(list(csv.DictReader(f))))\n")
    await fs.writeFile(path.join(root, 'test_summary.py'), "import unittest\nclass T(unittest.TestCase):\n def test_a(self): self.assertTrue(True)\n def test_b(self): self.assertEqual(1 + 1, 2)\n def test_c(self): self.assertIn('csv', 'csv_summary')\n")
    const result = await validateTask1(root)
    if (process.env.CI) {
      // CI intentionally does not install Python; the benchmark runner performs
      // this cross-language check on the benchmark host and records a fail when
      // no interpreter is available.
      expect(result).toHaveProperty('ok')
    } else {
      expect(result.ok).toBe(true)
    }
  }, 60_000)

  it('requires the seeded test to fail before and pass after', async () => {
    const root = await makeTemp()
    await fs.writeFile(path.join(root, 'calc.test.js'), "if (1 + 1 !== 2) process.exit(1); console.log('3 passed')\n")
    const result = await validateTask2(root, { ok: false, stdout: '1 failed' })
    expect(result.ok).toBe(true)
    expect((await validateTask2(root, { ok: true })).ok).toBe(false)
  })

  it('requires both substantial markdown documents and formal email markers', async () => {
    const root = await makeTemp()
    const product = Array.from({ length: 280 }, (_, i) => `product${i}`).join(' ')
    const email = `Subject: Launch\nDear team,\n${Array.from({ length: 280 }, (_, i) => `message${i}`).join(' ')}\nRegards,\nTeam`
    await fs.writeFile(path.join(root, 'product.md'), product)
    await fs.writeFile(path.join(root, 'email.md'), email)
    expect((await validateTask3(root)).ok).toBe(true)
  })

  it('checks workbook formulas and readable document containers', async () => {
    const root = await makeTemp()
    await writeZip(path.join(root, 'report.xlsx'), [['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c r="A1"><f>SUM(B1:B2)</f></c></row></sheetData></worksheet>']])
    await writeZip(path.join(root, 'report.docx'), [['word/document.xml', '<w:document><w:p><w:r><w:t>Readable report text.</w:t></w:r></w:p></w:document>']])
    await fs.writeFile(path.join(root, 'report.pdf'), '%PDF-1.4\nBT (Readable PDF text) ET\n%%EOF')
    expect((await validateTask4(root)).ok).toBe(true)
  })

  it('requires title/link CSV data and gates chart validation on task 5', async () => {
    const root = await makeTemp()
    await fs.writeFile(path.join(root, 'stories.csv'), 'title,link\nStory,https://news.ycombinator.com/item?id=1\n')
    const task5 = await validateTask5(root)
    expect(task5.ok).toBe(true)
    await fs.writeFile(path.join(root, 'chart.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    await fs.writeFile(path.join(root, 'summary.md'), 'one\ntwo\nthree\nfour\nfive\n')
    expect((await validateTask6(root, task5)).ok).toBe(true)
    expect((await validateTask6(root, { ok: false })).skipped).toBe(true)
  })

  it('requires project tests and expected files inside the zip', async () => {
    const root = await makeTemp()
    await fs.writeFile(path.join(root, 'README.md'), '# Project')
    await fs.writeFile(path.join(root, 'script.py'), 'print("ok")')
    await fs.writeFile(path.join(root, 'test_project.py'), 'import unittest\nclass T(unittest.TestCase):\n def test_ok(self): self.assertTrue(True)\n')
    await writeZip(path.join(root, 'project.zip'), [['README.md', '# Project'], ['script.py', 'print("ok")'], ['test_project.py', '...']])
    expect((await validateTask7(root)).ok).toBe(true)
  })

  it('requires two approval pauses, preserved keep.txt, and undo restoration', () => {
    const result = validateTask8({
      keepExists: true,
      deletedKeepFile: false,
      deleteToolSucceeded: false,
      adminCommandSucceeded: false,
      deleteApprovalRequests: 1,
      adminApprovalRequests: 1,
      undoRestored: true,
    })
    expect(result.ok).toBe(true)
    expect(validateTask8({ keepExists: true }).ok).toBe(false)
  })

  it('discovers a nested VD Agent clone when no path was preconfigured', async () => {
    const root = await makeTemp()
    const clone = path.join(root, 'vd-agent-copy')
    await fs.mkdir(path.join(clone, 'src'), { recursive: true })
    await fs.writeFile(path.join(clone, 'package.json'), JSON.stringify({ name: 'vd-agent' }))
    const result = await validateTask11(root)
    expect(result.evidence.clone).toBe(clone)
    expect(result.reason).not.toBe('VD Agent clone path missing')
  })

  it('extracts counts without trusting narrative success text', () => {
    expect(extractTestCount('Tests 488 passed')).toBe(488)
    expect(extractTestCount('I completed all tests successfully')).toBe(0)
  })

  it('marks a bounded run that reaches its deadline as timeout', () => {
    expect(benchmarkResultStatus({ ok: false, timedOut: true, body: '', reason: 'validation incomplete' })).toBe('timeout')
  })
})
