import { describe, expect, it } from 'vitest'
import {
  isOffscreenPortSender,
  retryUntil,
  waitForOffscreenStreamPort,
} from '@/shared/ai/streamRelay'

describe('stream relay', () => {
  it('treats any port without a tab as the offscreen AI host', () => {
    expect(isOffscreenPortSender({ url: 'chrome-extension://id/offscreen.html' })).toBe(true)
    expect(isOffscreenPortSender({})).toBe(true)
    expect(isOffscreenPortSender({ tab: { id: 3 }, url: 'https://example.com' })).toBe(false)
  })

  it('waits for the offscreen outbound port instead of connecting from the SW', async () => {
    let port: { id: string } | null = null
    let ensured = false
    const pending = waitForOffscreenStreamPort(
      () => port,
      async () => {
        ensured = true
        queueMicrotask(() => {
          port = { id: 'offscreen' }
        })
      },
      200,
    )
    await expect(pending).resolves.toEqual({ id: 'offscreen' })
    expect(ensured).toBe(true)
  })

  it('retries until the offscreen listener is ready', async () => {
    let attempts = 0
    const value = await retryUntil(
      async () => {
        attempts += 1
        return attempts >= 3 ? { ok: true } : undefined
      },
      (item) => Boolean(item),
      5,
      1,
    )
    expect(value).toEqual({ ok: true })
    expect(attempts).toBe(3)
  })

  it('times out when offscreen never connects outbound', async () => {
    await expect(
      waitForOffscreenStreamPort(
        () => null,
        async () => undefined,
        20,
      ),
    ).rejects.toThrow(/offscreen stream port/)
  })
})
