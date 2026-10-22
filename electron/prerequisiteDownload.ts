import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { isAllowlistedOfficialUrl, isExpectedSha256 } from '../src/lib/prerequisiteSetup'

export type DownloadProgress = {
  state: 'downloading' | 'verifying'
  bytesReceived: number
  totalBytes?: number
  percent?: number
}

export type DownloadAndVerifyOptions = {
  url: string
  destination: string
  expectedSha256: string
  signal: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
  fetchImpl?: FetchImplementation
}

export type FetchImplementation = (input: string | URL, init?: RequestInit) => Promise<Response>

export class PrerequisiteDownloadError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_URL' | 'INVALID_HASH' | 'HTTP_ERROR' | 'NO_BODY' | 'REDIRECT_LIMIT' | 'CHECKSUM_MISMATCH' | 'CANCELLED',
  ) {
    super(message)
    this.name = 'PrerequisiteDownloadError'
  }
}

function cancelledError(): PrerequisiteDownloadError {
  return new PrerequisiteDownloadError('Download cancelled.', 'CANCELLED')
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledError()
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

async function fetchOfficialArtifact(url: string, signal: AbortSignal, fetchImpl: FetchImplementation): Promise<Response> {
  let current = url
  for (let redirect = 0; redirect <= 5; redirect++) {
    throwIfAborted(signal)
    if (!isAllowlistedOfficialUrl(current)) {
      throw new PrerequisiteDownloadError('The artifact URL is not an allowlisted official HTTPS URL.', 'INVALID_URL')
    }
    let response: Response
    try {
      response = await fetchImpl(current, { redirect: 'manual', signal })
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw cancelledError()
      throw error
    }
    if (!isRedirect(response.status)) return response
    const location = response.headers.get('location')
    if (!location) throw new PrerequisiteDownloadError('The official download redirected without a location.', 'HTTP_ERROR')
    if (redirect === 5) throw new PrerequisiteDownloadError('Too many redirects from the official download.', 'REDIRECT_LIMIT')
    current = new URL(location, current).toString()
  }
  throw new PrerequisiteDownloadError('Too many redirects from the official download.', 'REDIRECT_LIMIT')
}

/** Download one fixed official artifact, stream its SHA-256, and never launch it. */
export async function downloadAndVerify(options: DownloadAndVerifyOptions): Promise<{ path: string; sha256: string; bytes: number }> {
  const { url, destination, expectedSha256, signal, onProgress, fetchImpl = fetch } = options
  if (!isAllowlistedOfficialUrl(url)) {
    throw new PrerequisiteDownloadError('The artifact URL is not an allowlisted official HTTPS URL.', 'INVALID_URL')
  }
  if (!isExpectedSha256(expectedSha256)) {
    throw new PrerequisiteDownloadError('A 64-character SHA-256 hash is required before download.', 'INVALID_HASH')
  }
  throwIfAborted(signal)

  const response = await fetchOfficialArtifact(url, signal, fetchImpl)
  if (!response.ok) {
    throw new PrerequisiteDownloadError(`The official download failed with HTTP ${response.status}.`, 'HTTP_ERROR')
  }
  if (!response.body) throw new PrerequisiteDownloadError('The official download returned no body.', 'NO_BODY')

  const totalHeader = response.headers.get('content-length')
  const parsedTotal = totalHeader ? Number.parseInt(totalHeader, 10) : NaN
  const totalBytes = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : undefined
  const file = await fs.open(destination, 'wx')
  const hash = createHash('sha256')
  let bytesReceived = 0
  try {
    const reader = response.body.getReader()
    while (true) {
      throwIfAborted(signal)
      let next: ReadableStreamReadResult<Uint8Array>
      try {
        next = await reader.read()
      } catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw cancelledError()
        throw error
      }
      if (next.done) break
      const chunk = next.value
      await file.write(chunk)
      hash.update(chunk)
      bytesReceived += chunk.byteLength
      onProgress?.({
        state: 'downloading',
        bytesReceived,
        totalBytes,
        percent: totalBytes && totalBytes > 0 ? Math.min(100, (bytesReceived / totalBytes) * 100) : undefined,
      })
    }
  } finally {
    await file.close()
  }

  throwIfAborted(signal)
  const actualSha256 = hash.digest('hex')
  onProgress?.({ state: 'verifying', bytesReceived, totalBytes, percent: 100 })
  if (actualSha256.toLowerCase() !== expectedSha256.trim().toLowerCase()) {
    throw new PrerequisiteDownloadError('The downloaded file failed SHA-256 verification.', 'CHECKSUM_MISMATCH')
  }
  return { path: destination, sha256: actualSha256, bytes: bytesReceived }
}
