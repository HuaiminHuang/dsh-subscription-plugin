/** Client projection of Host state, ordered within one Host lifetime. */
import type { CodexSubscriptionState } from '../types.ts'

export class StateStore {
  private readonly listeners = new Set<() => void>()
  private state: CodexSubscriptionState = { status: 'checking', models: [] }

  getSnapshot = (): CodexSubscriptionState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  set(state: CodexSubscriptionState): void {
    if (state.instanceId !== undefined && state.instanceId === this.state.instanceId
      && state.revision !== undefined && this.state.revision !== undefined
      && state.revision < this.state.revision) return
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

