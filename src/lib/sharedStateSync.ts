export function initialSharedStateReady(isIdeWindow: boolean, snapshot: unknown): boolean {
  return snapshot !== null && snapshot !== undefined || !isIdeWindow
}
