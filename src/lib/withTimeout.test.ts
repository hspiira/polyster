import { describe, expect, it } from 'vitest'
import { withTimeout } from './withTimeout'

describe('withTimeout', () => {
  it('resolves normally when the promise settles first', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'timed out')).resolves.toBe('ok')
  })

  it('rejects with the given message when the promise never settles', async () => {
    const never = new Promise(() => {})
    await expect(withTimeout(never, 20, 'timed out')).rejects.toThrow('timed out')
  })

  it('propagates the original rejection when the promise rejects first', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50, 'timed out')).rejects.toThrow(
      'boom',
    )
  })
})
