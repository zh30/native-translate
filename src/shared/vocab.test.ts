import { describe, expect, it } from 'vitest'
import {
  upsertVocabEntry,
  VOCAB_LIMIT,
  type VocabEntry,
  vocabToAnkiTsv,
  vocabToCsv,
} from '@/shared/vocab'

function entry(word: string, lastUsedAt: number): VocabEntry {
  return {
    id: word,
    word,
    lemma: word,
    meaning: `meaning-${word}`,
    addedAt: lastUsedAt,
    lastUsedAt,
  }
}

describe('upsertVocabEntry', () => {
  it('evicts the least-recently-used item at 2000', () => {
    const seed = Array.from({ length: VOCAB_LIMIT }, (_, i) => entry(`w${i}`, i + 1))
    const result = upsertVocabEntry(
      seed,
      {
        word: 'newest',
        lemma: 'new',
        meaning: 'fresh',
      },
      50_000,
    )
    expect(result.entries).toHaveLength(VOCAB_LIMIT)
    expect(result.evicted?.word).toBe('w0')
    expect(result.entries.some((item) => item.word === 'newest')).toBe(true)
    expect(result.created).toBe(true)
  })

  it('refreshes lastUsedAt when the same word is added again', () => {
    const first = upsertVocabEntry([], { word: 'apple', lemma: 'apple', meaning: 'fruit' }, 10)
    const second = upsertVocabEntry(
      first.entries,
      { word: 'Apple', lemma: 'apple', meaning: 'fruit' },
      99,
    )
    expect(second.created).toBe(false)
    expect(second.entries).toHaveLength(1)
    expect(second.entries[0].lastUsedAt).toBe(99)
  })
})

describe('vocab export formats', () => {
  it('writes CSV with a header and escaped commas', () => {
    const csv = vocabToCsv([
      {
        id: '1',
        word: 'break a leg',
        lemma: 'break a leg',
        meaning: 'good luck, idiom',
        sentence: 'Break a leg tonight',
        addedAt: 1,
        lastUsedAt: 1,
      },
    ])
    expect(csv.startsWith('word,lemma,meaning,sentence,phonetic,source')).toBe(true)
    expect(csv).toContain('"good luck, idiom"')
  })

  it('writes Anki TSV as front/back columns', () => {
    const tsv = vocabToAnkiTsv([
      {
        id: '1',
        word: 'ephemeral',
        lemma: 'ephemeral',
        meaning: 'short-lived',
        phonetic: '/ɪˈfem.ər.əl/',
        sentence: 'Fame is ephemeral.',
        addedAt: 1,
        lastUsedAt: 1,
      },
    ])
    expect(tsv).toBe('ephemeral\t/ɪˈfem.ər.əl/ — short-lived — Fame is ephemeral.')
    expect(tsv.includes('\t')).toBe(true)
    expect(tsv.split('\t')).toHaveLength(2)
  })
})
