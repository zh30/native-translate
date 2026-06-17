import {
  estimateTranslatorConcurrency,
  groupSegmentsByText,
  mapWithConcurrency,
} from '@/shared/translationQueue'
import { describe, expect, it } from 'vitest'

describe('translationQueue helpers', () => {
  it('groups duplicate segment text while preserving source indices', () => {
    const groups = groupSegmentsByText([
      { originalText: 'Alpha' },
      { originalText: 'Beta' },
      { originalText: 'Alpha' },
    ])

    expect(groups).toEqual([
      { text: 'Alpha', indices: [0, 2] },
      { text: 'Beta', indices: [1] },
    ])
  })

  it('keeps mapper results ordered while respecting concurrency', async () => {
    let inFlight = 0
    let maxInFlight = 0

    const results = await mapWithConcurrency([30, 10, 20, 5], 2, async (delay, index) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, delay))
      inFlight -= 1
      return `item-${index}`
    })

    expect(results).toEqual(['item-0', 'item-1', 'item-2', 'item-3'])
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })

  it('estimates bounded translator concurrency from hardware cores', () => {
    expect(estimateTranslatorConcurrency(2)).toBe(4)
    expect(estimateTranslatorConcurrency(8)).toBe(6)
    expect(estimateTranslatorConcurrency(64)).toBe(12)
    expect(estimateTranslatorConcurrency(undefined)).toBe(6)
  })
})
