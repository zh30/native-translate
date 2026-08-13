import type { SummarizerLike, SummaryFormat, SummaryLength } from '@/shared/ai/types'
import { mapWithConcurrency } from '@/shared/translationQueue'

export interface SummarizePipelineOptions {
  text: string
  format: SummaryFormat
  length: SummaryLength
  summarizer: SummarizerLike
  concurrency?: number
  signal?: AbortSignal
  fallbackMeasure?: (text: string) => number
}

function defaultMeasure(text: string): number {
  return text.length
}

export function splitTextToQuota(
  text: string,
  quota: number,
  measure: (value: string) => number,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  if (measure(normalized) <= quota) return [normalized]

  const paragraphs = normalized.split(/\n{2,}/)
  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }

  const pushPiece = (piece: string) => {
    const candidate = current ? `${current}\n\n${piece}` : piece
    if (current && measure(candidate) > quota) {
      flush()
      if (measure(piece) <= quota) {
        current = piece
        return
      }
    } else if (!current && measure(piece) <= quota) {
      current = piece
      return
    }
    if (measure(piece) <= quota) {
      current = current ? `${current}\n\n${piece}` : piece
      return
    }
    const words = piece.split(/\s+/)
    let window = ''
    for (const word of words) {
      const next = window ? `${window} ${word}` : word
      if (window && measure(next) > quota) {
        chunks.push(window)
        window = word
      } else {
        window = next
      }
    }
    if (window) current = current ? `${current}\n\n${window}` : window
  }

  for (const paragraph of paragraphs) {
    pushPiece(paragraph.trim())
  }
  flush()
  return chunks.filter(Boolean)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('aborted')
    error.name = 'AbortError'
    throw error
  }
}

export async function summarizeLongText(options: SummarizePipelineOptions): Promise<string> {
  const { text, summarizer, signal } = options
  throwIfAborted(signal)
  const measure = summarizer.measureInputUsage
    ? async (value: string) => summarizer.measureInputUsage?.(value) ?? defaultMeasure(value)
    : async (value: string) => (options.fallbackMeasure ?? defaultMeasure)(value)

  const quota =
    typeof summarizer.inputQuota === 'number' && summarizer.inputQuota > 0
      ? Math.max(8, Math.floor(summarizer.inputQuota * 0.75))
      : 12_000

  const wholeUsage = await measure(text)
  throwIfAborted(signal)
  if (wholeUsage <= quota) {
    return summarizer.summarize(text, { signal })
  }

  const syncMeasure = options.fallbackMeasure ?? defaultMeasure
  const chunks = splitTextToQuota(text, quota, syncMeasure)
  const concurrency = options.concurrency ?? 2
  const partials = await mapWithConcurrency(chunks, concurrency, async (chunk) => {
    throwIfAborted(signal)
    return summarizer.summarize(chunk, { signal })
  })
  throwIfAborted(signal)
  const merged = partials.map((item, index) => `Chunk ${index + 1}:\n${item}`).join('\n\n')
  return summarizer.summarize(merged, { signal })
}
