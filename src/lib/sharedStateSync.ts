export function initialSharedStateReady(isIdeWindow: boolean, snapshot: unknown): boolean {
  return snapshot !== null && snapshot !== undefined || !isIdeWindow
}

export function shouldAcceptSharedStateUpdate(senderRole: 'main' | 'ide', currentWorkspace: string, nextWorkspace: string): boolean {
  return !(senderRole === 'ide' && Boolean(currentWorkspace) && !nextWorkspace)
}
