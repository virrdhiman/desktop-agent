/** Crash-safe, bounded pre-edit snapshots for files the agent is about to change. */
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { isPathInsideWorkspace, resolvesInsideWorkspace } from './toolPolicy'

export const CHECKPOINT_VERSION = 1
export const MAX_CHECKPOINT_FILE_BYTES = 2 * 1024 * 1024
export const MAX_CHECKPOINT_BYTES = 12 * 1024 * 1024
export const MAX_CHECKPOINTS_PER_SESSION = 20

export type CheckpointFile = {
  relativePath: string
  existed: boolean
  contentBase64?: string
  skipped?: string
}

export type WorkspaceCheckpoint = {
  version: number
  id: string
  sessionId: string
  workspace: string
  label: string
  createdAt: number
  files: CheckpointFile[]
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/

function checkpointFile(baseDir: string, sessionId: string, id: string) {
  if (!SAFE_ID.test(sessionId) || !SAFE_ID.test(id)) throw new Error('Invalid checkpoint id')
  return path.join(baseDir, sessionId, `${id}.json`)
}

async function atomicWrite(target: string, content: string) {
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`
  await fs.promises.writeFile(tmp, content, 'utf-8')
  await fs.promises.rename(tmp, target)
}

export async function createCheckpoint(
  baseDir: string,
  input: { sessionId: string; workspace: string; label: string; paths: string[] }
): Promise<WorkspaceCheckpoint | null> {
  if (!SAFE_ID.test(input.sessionId)) throw new Error('Invalid session id')
  const workspace = path.resolve(input.workspace)
  const candidates = [...new Set(input.paths.map((p) => path.resolve(p)).filter((p) => isPathInsideWorkspace(workspace, p)))]
  const targets: string[] = []
  for (const target of candidates) if (await resolvesInsideWorkspace(workspace, target)) targets.push(target)
  if (targets.length === 0) return null

  const files: CheckpointFile[] = []
  let total = 0
  for (const target of targets) {
    const relativePath = path.relative(workspace, target)
    try {
      const stat = await fs.promises.stat(target)
      if (!stat.isFile()) {
        files.push({ relativePath, existed: true, skipped: 'not a regular file' })
        continue
      }
      if (stat.size > MAX_CHECKPOINT_FILE_BYTES || total + stat.size > MAX_CHECKPOINT_BYTES) {
        files.push({ relativePath, existed: true, skipped: 'file exceeds checkpoint size limit' })
        continue
      }
      const content = await fs.promises.readFile(target)
      total += content.length
      files.push({ relativePath, existed: true, contentBase64: content.toString('base64') })
    } catch (err: any) {
      if (err?.code === 'ENOENT') files.push({ relativePath, existed: false })
      else throw err
    }
  }

  const createdAt = Date.now()
  const checkpoint: WorkspaceCheckpoint = {
    version: CHECKPOINT_VERSION,
    id: `cp-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: input.sessionId,
    workspace,
    label: input.label.slice(0, 160),
    createdAt,
    files,
  }
  await atomicWrite(checkpointFile(baseDir, checkpoint.sessionId, checkpoint.id), JSON.stringify(checkpoint, null, 2))
  const retained = await listCheckpoints(baseDir, checkpoint.sessionId)
  await Promise.all(retained.slice(MAX_CHECKPOINTS_PER_SESSION).map((old) => (
    fs.promises.rm(checkpointFile(baseDir, old.sessionId, old.id), { force: true })
  )))
  return checkpoint
}

export async function readCheckpoint(baseDir: string, sessionId: string, id: string): Promise<WorkspaceCheckpoint> {
  const raw = JSON.parse(await fs.promises.readFile(checkpointFile(baseDir, sessionId, id), 'utf-8'))
  if (!raw || raw.version !== CHECKPOINT_VERSION || raw.id !== id || raw.sessionId !== sessionId || !Array.isArray(raw.files)) {
    throw new Error('Checkpoint is invalid or unsupported')
  }
  return raw
}

export async function restoreCheckpoint(baseDir: string, sessionId: string, id: string) {
  const checkpoint = await readCheckpoint(baseDir, sessionId, id)
  const restored: string[] = []
  const removed: string[] = []
  const skipped: string[] = []
  for (const file of checkpoint.files) {
    const target = path.resolve(checkpoint.workspace, file.relativePath)
    if (!isPathInsideWorkspace(checkpoint.workspace, target) || !await resolvesInsideWorkspace(checkpoint.workspace, target)) {
      throw new Error('Checkpoint path escaped the workspace')
    }
    if (file.skipped) {
      skipped.push(file.relativePath)
      continue
    }
    if (file.existed) {
      if (typeof file.contentBase64 !== 'string') {
        skipped.push(file.relativePath)
        continue
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true })
      await fs.promises.writeFile(target, Buffer.from(file.contentBase64, 'base64'))
      restored.push(file.relativePath)
    } else {
      try {
        await fs.promises.unlink(target)
        removed.push(file.relativePath)
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err
      }
    }
  }
  return { checkpoint, restored, removed, skipped }
}

export async function listCheckpoints(baseDir: string, sessionId: string): Promise<WorkspaceCheckpoint[]> {
  if (!SAFE_ID.test(sessionId)) throw new Error('Invalid session id')
  const dir = path.join(baseDir, sessionId)
  let names: string[]
  try { names = await fs.promises.readdir(dir) } catch { return [] }
  const checkpoints: WorkspaceCheckpoint[] = []
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      checkpoints.push(await readCheckpoint(baseDir, sessionId, name.slice(0, -5)))
    } catch {}
  }
  return checkpoints.sort((a, b) => b.createdAt - a.createdAt)
}
