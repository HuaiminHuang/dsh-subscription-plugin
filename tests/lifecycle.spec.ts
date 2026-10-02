import { expect, it, vi } from 'vitest'
import { disposeAll } from '../src/lifecycle.ts'

it('awaits every cleanup in ownership order and reports failures afterward', async () => {
  const order: string[] = []
  const last = vi.fn(() => { order.push('last') })
  await expect(disposeAll([
    async () => { order.push('first'); throw new Error('first failure') },
    async () => { await Promise.resolve(); order.push('second'); throw new Error('second failure') },
    last,
  ])).rejects.toMatchObject({ errors: [expect.any(Error), expect.any(Error)] })
  expect(order).toEqual(['first', 'second', 'last'])
  expect(last).toHaveBeenCalledOnce()
})
