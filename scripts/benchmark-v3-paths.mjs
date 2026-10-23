import path from 'node:path'

export function taskWorkspacePath(modelRoot, taskId) {
  return path.join(modelRoot, `task-${taskId}`, 'workspace')
}

export function taskUserDataPath(modelRoot, taskId) {
  return path.join(modelRoot, `task-${taskId}`, 'userdata')
}
