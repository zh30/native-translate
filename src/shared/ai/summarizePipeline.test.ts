import { describe, expect, it } from 'vitest'
import { splitTextToQuota, summarizeLongText } from '@/shared/ai/summarizePipeline'
import type { SummarizerLike } from '@/shared/ai/types'

function makeText(id: string, size: number): string {
  return `${id}:${'x'.repeat(size)}`
}

describe('splitTextToQuota', () => {
  it('keeps a short document as a single chunk', () => {
    expect(splitTextToQuota('one paragraph', 100, (value) => value.length)).toEqual([
      'one paragraph',
    ])
  })

  it('splits oversized paragraphs while preserving order', () => {
    const text = `${makeText('A', 40)}\n\n${makeText('B', 40)}\n\n${makeText('C', 40)}`
    const chunks = splitTextToQuota(text, 50, (value) => value.length)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join(' ')).toContain('A:')
    expect(chunks.join(' ')).toContain('C:')
    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true)
  })
})

describe('summarizeLongText', () => {
  it('summarizes under quota in one call', async () => {
    const calls: string[] = []
    const summarizer: SummarizerLike = {
      inputQuota: 10_000,
      measureInputUsage: async (text) => text.length,
      summarize: async (text) => {
        calls.push(text)
        return `SUM:${text.slice(0, 8)}`
      },
    }
    const result = await summarizeLongText({
      text: 'short article',
      format: 'key-points',
      length: 'short',
      summarizer,
    })
    expect(calls).toEqual(['short article'])
    expect(result).toBe('SUM:short ar')
  })

  it('chunks over-quota text, preserves merge order, then summarizes the merge', async () => {
    const seen: string[] = []
    const summarizer: SummarizerLike = {
      inputQuota: 80,
      measureInputUsage: async (text) => text.length,
      summarize: async (text) => {
        seen.push(text)
        if (text.startsWith('Chunk')) return `MERGED:${seen.length}`
        const id = text.slice(0, 1)
        return `P${id}`
      },
    }
    const text = ['A'.repeat(40), 'B'.repeat(40), 'C'.repeat(40)].join('\n\n')
    const result = await summarizeLongText({
      text,
      format: 'key-points',
      length: 'medium',
      summarizer,
      concurrency: 2,
      fallbackMeasure: (value) => value.length,
    })
    expect(seen.length).toBeGreaterThan(1)
    expect(seen.some((item) => item.includes('Chunk 1'))).toBe(true)
    expect(seen[seen.length - 1]?.startsWith('Chunk')).toBe(true)
    expect(result.startsWith('MERGED:')).toBe(true)
  })

  it('propagates AbortSignal before summarizing', async () => {
    const controller = new AbortController()
    controller.abort()
    const summarizer: SummarizerLike = {
      summarize: async () => 'nope',
    }
    await expect(
      summarizeLongText({
        text: 'anything',
        format: 'tldr',
        length: 'short',
        summarizer,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
