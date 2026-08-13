import type { LanguageModelLike, SummarizerLike } from '@/shared/ai/types'

const MAX_SESSIONS = 4
const IDLE_MS = 5 * 60 * 1000

interface PoolEntry<T> {
  key: string
  value: T
  lastUsed: number
}

export class LruSessionPool<T extends { destroy?: () => void }> {
  private readonly items: PoolEntry<T>[] = []

  constructor(private readonly max = MAX_SESSIONS) {}

  get(key: string): T | undefined {
    const found = this.items.find((item) => item.key === key)
    if (!found) return undefined
    found.lastUsed = Date.now()
    return found.value
  }

  set(key: string, value: T): void {
    const existing = this.items.find((item) => item.key === key)
    if (existing) {
      existing.value = value
      existing.lastUsed = Date.now()
      return
    }
    this.items.push({ key, value, lastUsed: Date.now() })
    this.evict()
  }

  delete(key: string): void {
    const index = this.items.findIndex((item) => item.key === key)
    if (index < 0) return
    this.items[index].value.destroy?.()
    this.items.splice(index, 1)
  }

  keys(): string[] {
    return this.items.map((item) => item.key)
  }

  get size(): number {
    return this.items.length
  }

  sweepIdle(now = Date.now(), idleMs = IDLE_MS): string[] {
    const removed: string[] = []
    for (const item of [...this.items]) {
      if (now - item.lastUsed >= idleMs) {
        this.delete(item.key)
        removed.push(item.key)
      }
    }
    return removed
  }

  clear(): void {
    for (const item of this.items) item.value.destroy?.()
    this.items.length = 0
  }

  private evict(): void {
    while (this.items.length > this.max) {
      let oldest = 0
      for (let i = 1; i < this.items.length; i += 1) {
        if (this.items[i].lastUsed < this.items[oldest].lastUsed) oldest = i
      }
      this.items[oldest].value.destroy?.()
      this.items.splice(oldest, 1)
    }
  }
}

export const languageModelPool = new LruSessionPool<LanguageModelLike>()
export const summarizerPool = new LruSessionPool<SummarizerLike>()

export function sessionKey(parts: Array<string | number | undefined>): string {
  return parts.filter(Boolean).join(':')
}

export async function compactSessionWithSummarizer(
  historyText: string,
  summarizer: SummarizerLike,
  signal?: AbortSignal,
): Promise<string> {
  return summarizer.summarize(historyText, { signal })
}

let sweepTimer: number | null = null

export function startSessionIdleSweep(): void {
  if (sweepTimer !== null) return
  if (typeof window === 'undefined') return
  sweepTimer = window.setInterval(() => {
    languageModelPool.sweepIdle()
    summarizerPool.sweepIdle()
  }, 30_000)
}

export function stopSessionIdleSweep(): void {
  if (sweepTimer === null) return
  window.clearInterval(sweepTimer)
  sweepTimer = null
}
