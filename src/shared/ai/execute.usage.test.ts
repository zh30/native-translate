import { describe, expect, it } from 'vitest'
import {
  readAvailabilityStatus,
  readSessionUsage,
  shouldCompactSession,
  shouldCreateDespiteAvailability,
} from '@/shared/ai/execute'
import { compactSessionWithSummarizer } from '@/shared/ai/sessionManager'

describe('availability probe', () => {
  it('treats a hung availability() as timeout and still allows create', async () => {
    const status = await readAvailabilityStatus(() => new Promise(() => undefined), undefined, 20)
    expect(status).toBe('timeout')
    expect(shouldCreateDespiteAvailability('timeout')).toBe(true)
    expect(shouldCreateDespiteAvailability('missing')).toBe(true)
    expect(shouldCreateDespiteAvailability('available')).toBe(true)
    expect(shouldCreateDespiteAvailability('downloadable')).toBe(false)
    expect(shouldCreateDespiteAvailability('unavailable')).toBe(false)
  })

  it('returns missing when the API has no availability method', async () => {
    expect(await readAvailabilityStatus(undefined)).toBe('missing')
  })
})

describe('chat usage and compacting', () => {
  it('reads session usage for done frames', () => {
    expect(
      readSessionUsage({
        prompt: async () => '',
        contextUsage: 850,
        contextWindow: 1000,
      }),
    ).toEqual({ contextUsage: 850, contextWindow: 1000 })
  })

  it('compacts when usage crosses 85% using the shipped summarizer helper', async () => {
    const usage = readSessionUsage({
      prompt: async () => '',
      contextUsage: 900,
      contextWindow: 1000,
    })
    expect(shouldCompactSession(usage)).toBe(true)
    expect(shouldCompactSession({ contextUsage: 10, contextWindow: 1000 })).toBe(false)
    const compacted = await compactSessionWithSummarizer('old turn one\nold turn two', {
      summarize: async (text) => `DIGEST:${text.slice(0, 12)}`,
    })
    expect(compacted.startsWith('DIGEST:')).toBe(true)
  })
})
