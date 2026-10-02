/** Release every owned resource even when an earlier cleanup fails. */
export async function disposeAll(cleanups: readonly (() => unknown | Promise<unknown>)[]): Promise<void> {
  const failures: unknown[] = []
  for (const cleanup of cleanups) {
    try { await cleanup() } catch (error) { failures.push(error) }
  }
  if (failures.length !== 0) throw new AggregateError(failures, 'Plugin resource cleanup failed')
}
