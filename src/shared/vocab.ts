export const VOCAB_LIMIT = 2000

export interface VocabEntry {
  id: string
  word: string
  lemma: string
  meaning: string
  sentence?: string
  phonetic?: string
  sourceUrl?: string
  sourceHost?: string
  addedAt: number
  lastUsedAt: number
}

export interface VocabUpsertResult {
  entries: VocabEntry[]
  evicted: VocabEntry | null
  created: boolean
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase()
}

export function createVocabId(word: string, sourceHost?: string): string {
  return `${sourceHost ?? 'page'}:${normalizeWord(word)}`
}

export function upsertVocabEntry(
  entries: readonly VocabEntry[],
  incoming: Omit<VocabEntry, 'id' | 'addedAt' | 'lastUsedAt'> & {
    id?: string
    addedAt?: number
    lastUsedAt?: number
  },
  now = Date.now(),
): VocabUpsertResult {
  const id = incoming.id ?? createVocabId(incoming.word, incoming.sourceHost)
  const existingIndex = entries.findIndex(
    (item) => item.id === id || normalizeWord(item.word) === normalizeWord(incoming.word),
  )
  if (existingIndex >= 0) {
    const existing = entries[existingIndex]
    const next = [...entries]
    next[existingIndex] = {
      ...existing,
      ...incoming,
      id: existing.id,
      addedAt: existing.addedAt,
      lastUsedAt: now,
    }
    return { entries: next, evicted: null, created: false }
  }

  const created: VocabEntry = {
    id,
    word: incoming.word,
    lemma: incoming.lemma,
    meaning: incoming.meaning,
    sentence: incoming.sentence,
    phonetic: incoming.phonetic,
    sourceUrl: incoming.sourceUrl,
    sourceHost: incoming.sourceHost,
    addedAt: incoming.addedAt ?? now,
    lastUsedAt: incoming.lastUsedAt ?? now,
  }
  const next = [created, ...entries]
  let evicted: VocabEntry | null = null
  if (next.length > VOCAB_LIMIT) {
    let oldestIndex = 0
    for (let i = 1; i < next.length; i += 1) {
      if (next[i].lastUsedAt < next[oldestIndex].lastUsedAt) oldestIndex = i
    }
    evicted = next[oldestIndex]
    next.splice(oldestIndex, 1)
  }
  return { entries: next, evicted, created: true }
}

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function vocabToCsv(entries: readonly VocabEntry[]): string {
  const header = ['word', 'lemma', 'meaning', 'sentence', 'phonetic', 'source']
  const rows = entries.map((entry) =>
    [
      entry.word,
      entry.lemma,
      entry.meaning,
      entry.sentence ?? '',
      entry.phonetic ?? '',
      entry.sourceUrl ?? entry.sourceHost ?? '',
    ]
      .map(csvEscape)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

export function vocabToAnkiTsv(entries: readonly VocabEntry[]): string {
  return entries
    .map((entry) => {
      const front = entry.word
      const backParts = [entry.meaning]
      if (entry.phonetic) backParts.unshift(entry.phonetic)
      if (entry.sentence) backParts.push(entry.sentence)
      return `${front.replace(/\t/g, ' ')}\t${backParts.join(' — ').replace(/\t/g, ' ')}`
    })
    .join('\n')
}
