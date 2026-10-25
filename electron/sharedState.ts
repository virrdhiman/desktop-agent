import type { SharedAppState } from '../src/types'

/** In-memory bridge state. The renderer remains the source of truth for UI state. */
export class SharedStateStore {
  private state: SharedAppState | null = null

  get(): SharedAppState | null {
    return this.state
  }

  set(next: SharedAppState): void {
    this.state = next
  }
}
