/** Own request cancellation and wait for callers to release their leases. */
export class RequestLifetime {
  private readonly active = new Set<{ controller: AbortController; finished: Promise<void> }>()

  open(signal: AbortSignal | undefined): Disposable & { readonly signal: AbortSignal } {
    const controller = new AbortController()
    const abort = (): void => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    let finish!: () => void
    const request = { controller, finished: new Promise<void>(resolve => { finish = resolve }) }
    this.active.add(request)
    let disposed = false
    return {
      signal: controller.signal,
      [Symbol.dispose]: () => {
        if (disposed) return
        disposed = true
        signal?.removeEventListener('abort', abort)
        controller.abort('Codex subscription request completed')
        this.active.delete(request)
        finish()
      },
    }
  }

  async abort(reason: string): Promise<void> {
    const requests = [...this.active]
    for (const request of requests) request.controller.abort(reason)
    await Promise.all(requests.map(request => request.finished))
  }
}
