// @vitest-environment node
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { downloadAndVerify } from '../prerequisiteDownload'

const payload = new TextEncoder().encode('official installer fixture')
const expectedSha256 = 'd1e3c4d8f0876f4f15c3b2bd0cdbf0f1b3edc1f7bdbf7f7d3fce5f6f2b6d6a7e'

async function destination(name: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vd-agent-prerequisite-'))
  return path.join(root, name)
}

function response(body: Uint8Array, status = 200, headers: Record<string, string> = {}) {
  return new Response(body as unknown as BodyInit, { status, headers: { 'content-length': String(body.byteLength), ...headers } })
}

describe('prerequisite download verification', () => {
  it('reports progress and returns only a SHA-256-verified file', async () => {
    const output = await destination('setup.exe')
    const progress: string[] = []
    const realHash = createHash('sha256').update(payload).digest('hex')
    const result = await downloadAndVerify({
      url: 'https://update.code.visualstudio.com/latest/win32-x64-user/stable',
      destination: output,
      expectedSha256: realHash,
      signal: new AbortController().signal,
      onProgress: (next) => progress.push(next.state),
      fetchImpl: vi.fn().mockResolvedValue(response(payload)),
    })

    expect(result).toMatchObject({ path: output, sha256: realHash, bytes: payload.byteLength })
    expect(progress).toEqual(['downloading', 'verifying'])
    await expect(fs.readFile(output)).resolves.toEqual(Buffer.from(payload))
  })

  it('rejects a checksum mismatch without producing a launch result', async () => {
    const output = await destination('mismatch.exe')
    await expect(downloadAndVerify({
      url: 'https://update.code.visualstudio.com/latest/win32-x64-user/stable',
      destination: output,
      expectedSha256,
      signal: new AbortController().signal,
      fetchImpl: vi.fn().mockResolvedValue(response(payload)),
    })).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' })
  })

  it('propagates AbortController cancellation and emits no verified result', async () => {
    const output = await destination('cancelled.exe')
    const controller = new AbortController()
    const fetchImpl = vi.fn((_url: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const pending = downloadAndVerify({
      url: 'https://update.code.visualstudio.com/latest/win32-x64-user/stable',
      destination: output,
      expectedSha256,
      signal: controller.signal,
      fetchImpl,
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('reports official-server failures without opening a file', async () => {
    const output = await destination('failure.exe')
    await expect(downloadAndVerify({
      url: 'https://update.code.visualstudio.com/latest/win32-x64-user/stable',
      destination: output,
      expectedSha256,
      signal: new AbortController().signal,
      fetchImpl: vi.fn().mockResolvedValue(response(new Uint8Array(), 503)),
    })).rejects.toMatchObject({ code: 'HTTP_ERROR' })
  })

  it('rejects a redirect to a non-official host before reading the body', async () => {
    const output = await destination('redirect.exe')
    await expect(downloadAndVerify({
      url: 'https://update.code.visualstudio.com/latest/win32-x64-user/stable',
      destination: output,
      expectedSha256,
      signal: new AbortController().signal,
      fetchImpl: vi.fn().mockResolvedValue(response(new Uint8Array(), 302, { location: 'https://example.com/setup.exe' })),
    })).rejects.toMatchObject({ code: 'INVALID_URL' })
  })
})
