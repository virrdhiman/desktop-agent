// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { executeApiRequest, validateApiRequest } from '../apiTesting'

describe('api testing tool', () => {
  it('validates only bounded HTTP requests', () => {
    expect(validateApiRequest({ url: 'file:///secret' })).toMatchObject({ ok: false })
    expect(validateApiRequest({ url: 'http://localhost:3000', method: 'TRACE' })).toMatchObject({ ok: false })
    expect(validateApiRequest({ url: 'http://localhost:3000', method: 'GET', body: {} })).toMatchObject({ ok: false })
    expect(validateApiRequest({ url: 'https://example.test', method: 'post' })).toMatchObject({ ok: true, method: 'POST' })
  })

  it('parses JSON and selects a dot-path while checking expected status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: 'ready' } }), { status: 200, statusText: 'OK' }))
    const result = JSON.parse(await executeApiRequest({ url: 'http://localhost:3000/health', expectedStatus: 200, jsonPath: 'data.status' }, fetchMock))
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'GET' }))
    expect(result).toMatchObject({ ok: true, status: 200, value: 'ready' })
  })

  it('serializes JSON request bodies and reports status mismatch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('created', { status: 201, statusText: 'Created' }))
    const result = JSON.parse(await executeApiRequest({ url: 'https://example.test/items', method: 'POST', body: { name: 'one' }, expectedStatus: 200 }, fetchMock))
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"name":"one"}' })
    expect(result.ok).toBe(false)
  })
})
