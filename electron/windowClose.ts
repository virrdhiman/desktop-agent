import path from 'node:path'

export type UnsavedChoice = 'save' | 'dont-save' | 'cancel'

export function nextQaDialogChoice(queue: UnsavedChoice[]): UnsavedChoice | undefined {
  return queue.shift()
}

export function isSafeWorkspaceFile(workspacePath: string, filePath: string): boolean {
  const workspace = path.resolve(workspacePath)
  const candidate = path.resolve(filePath)
  return candidate === workspace || candidate.startsWith(`${workspace}${path.sep}`)
}
