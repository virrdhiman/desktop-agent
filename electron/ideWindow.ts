/** Small, dependency-free window lifecycle helper used by the Electron main process. */

export interface ManagedWindow {
  isDestroyed(): boolean
  show?: () => void
  focus?: () => void
}

export type WindowFactory<T extends ManagedWindow> = () => T

export class SingleIdeWindow<T extends ManagedWindow> {
  private current: T | null = null

  constructor(private readonly create: WindowFactory<T>) {}

  openOrFocus(): { window: T; created: boolean } {
    if (this.current && !this.current.isDestroyed()) {
      this.current.show?.()
      this.current.focus?.()
      return { window: this.current, created: false }
    }
    const next = this.create()
    this.current = next
    next.show?.()
    next.focus?.()
    return { window: next, created: true }
  }

  setClosed(window: T): void {
    if (this.current === window) this.current = null
  }

  get(): T | null {
    return this.current && !this.current.isDestroyed() ? this.current : null
  }
}
