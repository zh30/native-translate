import { BookMarked } from 'lucide-react'
import React from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { VOCAB_BOOK_KEY } from '@/shared/settings'
import { type VocabEntry, vocabToAnkiTsv, vocabToCsv } from '@/shared/vocab'
import { t } from '@/utils/i18n'
import { useChromeLocalStorage } from '@/utils/useChromeLocalStorage'

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function VocabTab() {
  const [entries, setEntries] = useChromeLocalStorage<VocabEntry[]>(VOCAB_BOOK_KEY, [])
  const [query, setQuery] = React.useState('')
  const filtered = entries.filter((entry) => {
    const hay = `${entry.word} ${entry.meaning} ${entry.sourceHost ?? ''}`.toLowerCase()
    return hay.includes(query.toLowerCase())
  })
  const grouped = React.useMemo(() => {
    const map = new Map<string, VocabEntry[]>()
    for (const entry of filtered) {
      const host = entry.sourceHost || t('ai_vocab_group')
      map.set(host, [...(map.get(host) ?? []), entry])
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
        placeholder={t('ai_vocab_search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        {grouped.length === 0 ? (
          <EmptyState icon={<BookMarked className="h-5 w-5" />} title={t('ai_vocab_empty')} />
        ) : (
          grouped.map(([host, items]) => (
            <section key={host}>
              <h3 className="mb-1 text-xs font-semibold uppercase text-zinc-500">{host}</h3>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-800"
                  >
                    <div className="font-medium">{item.word}</div>
                    <div className="text-xs text-zinc-500">{item.meaning}</div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => download('vocab.csv', vocabToCsv(entries), 'text/csv')}
        >
          {t('ai_vocab_export_csv')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            download('vocab-anki.tsv', vocabToAnkiTsv(entries), 'text/tab-separated-values')
          }
        >
          {t('ai_vocab_export_anki')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEntries([])}>
          {t('ai_vocab_clear')}
        </Button>
      </div>
    </div>
  )
}
