export function initialSharedStateReady(isIdeWindow: boolean, snapshot: unknown): boolean {
  return snapshot !== null && snapshot !== undefined || !isIdeWindow
}

export function shouldAcceptSharedStateUpdate(senderRole: 'main' | 'ide', currentWorkspace: string, nextWorkspace: string): boolean {
  if (!nextWorkspace && (senderRole === 'ide' || currentWorkspace)) return false
  return true
}
