export interface SegmentLike {
  originalText: string
}

export interface SegmentGroup {
  text: string
  indices: number[]
}

export function clampConcurrency(value: number, min = 1, max = 12): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}

export function estimateTranslatorConcurrency(hardwareConcurrency?: number): number {
  const cores =
    typeof hardwareConcurrency === 'number' && hardwareConcurrency > 0 ? hardwareConcurrency : 8
  return clampConcurrency(Math.floor(cores * 0.75), 4, 12)
}

export function groupSegmentsByText<T extends SegmentLike>(segments: readonly T[]): SegmentGroup[] {
  const groups = new Map<string, SegmentGroup>()
  for (let index = 0; index < segments.length; index += 1) {
    const text = segments[index].originalText
    const existing = groups.get(text)
    if (existing) {
      existing.indices.push(index)
      continue
    }
    groups.set(text, { text, indices: [index] })
  }
  return Array.from(groups.values())
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrencyLimit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []

  const limit = clampConcurrency(concurrencyLimit, 1, items.length)
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(
    Array.from({ length: limit }, async () => {
      await runWorker()
    }),
  )

  return results
}
