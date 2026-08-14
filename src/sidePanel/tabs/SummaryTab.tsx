import { FileText } from 'lucide-react'
import React from 'react'
import { AiBadge } from '@/components/ui/ai-badge'
import { AiModelGate } from '@/components/ui/ai-model-gate'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MarkdownView } from '@/components/ui/markdown-view'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAiCapabilities } from '@/shared/ai/capabilities'
import { streamAiTask } from '@/shared/ai/client'
import { isAiAbortError } from '@/shared/ai/productInvariants'
import type { SummaryFormat, SummaryLength } from '@/shared/ai/types'
import { extractFromTextBlocks, joinExtractedText } from '@/shared/extract'
import type { LanguageCode } from '@/shared/languages'
import { MSG_GET_PAGE_CONTENT } from '@/shared/messages'
import { AI_SETTINGS_KEY, type AiSettings, DEFAULT_AI_SETTINGS } from '@/shared/settings'
import { t } from '@/utils/i18n'
import { useChromeLocalStorage } from '@/utils/useChromeLocalStorage'

interface PageContent {
  title: string
  lang?: string
  url?: string
  blocks: string[]
  truncated?: boolean
}

export interface SummaryTabProps {
  targetLanguage: LanguageCode
  autoStart?: boolean
  onAskPage?: () => void
}

const cache = new Map<string, { text: string; originals?: string[] }>()

export function SummaryTab({ targetLanguage, autoStart, onAskPage }: SummaryTabProps) {
  const { capabilities, refresh } = useAiCapabilities()
  const [aiSettings, setAiSettings] = useChromeLocalStorage<AiSettings>(
    AI_SETTINGS_KEY,
    DEFAULT_AI_SETTINGS,
  )
  const [page, setPage] = React.useState<PageContent | null>(null)
  const [text, setText] = React.useState('')
  const [bilingual, setBilingual] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const startedRef = React.useRef(false)
  const runGen = React.useRef(0)

  const format = aiSettings.summary.format
  const length = aiSettings.summary.length
  const showBilingual = aiSettings.summary.bilingual

  const loadPage = React.useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error(t('active_tab_not_found'))
    const payload = (await chrome.tabs.sendMessage(tab.id, {
      type: MSG_GET_PAGE_CONTENT,
    })) as PageContent
    setPage(payload)
    return payload
  }, [])

  const run = React.useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++runGen.current
    setLoading(true)
    setError(null)
    setText('')
    setBilingual([])
    try {
      const content = page ?? (await loadPage())
      const extracted = extractFromTextBlocks({
        title: content.title,
        lang: content.lang,
        blocks: content.blocks,
      })
      const joined = joinExtractedText(extracted)
      const cacheKey = `${joined.slice(0, 80)}:${format}:${length}:${targetLanguage}:${showBilingual}`
      const hit = cache.get(cacheKey)
      if (hit) {
        if (gen !== runGen.current) return
        setText(hit.text)
        setBilingual(hit.originals ?? [])
        return
      }
      let acc = ''
      const result = (await streamAiTask(
        { kind: 'summarize', text: joined, format, length, targetLanguage },
        (frame) => {
          if (frame.type === 'chunk') {
            acc += frame.delta
            setText(acc)
          }
        },
        controller.signal,
      )) as { text?: string; sourceText?: string }
      const finalText = result?.text ?? acc
      if (gen !== runGen.current) return
      setText(finalText)
      const originals =
        showBilingual && result?.sourceText && result.sourceText !== finalText
          ? result.sourceText.split('\n').filter((line) => line.trim())
          : []
      setBilingual(originals)
      cache.set(cacheKey, { text: finalText, originals })
    } catch (err) {
      if (gen !== runGen.current) return
      if (isAiAbortError(err)) return
      setError(err instanceof Error ? err.message : t('ai_error_internal'))
    } finally {
      if (gen === runGen.current) setLoading(false)
    }
  }, [format, length, loadPage, page, showBilingual, targetLanguage])

  React.useEffect(() => {
    if (!autoStart && !startedRef.current) return
    startedRef.current = true
    void run()
  }, [autoStart, run])

  return (
    <AiModelGate capabilities={capabilities} onRefresh={refresh}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel={t('ai_summary_format')}
            value={format}
            onChange={(value) =>
              setAiSettings((s) => ({ ...s, summary: { ...s.summary, format: value } }))
            }
            options={[
              { value: 'key-points' as SummaryFormat, label: t('ai_summary_format_key_points') },
              { value: 'tldr' as SummaryFormat, label: t('ai_summary_format_tldr') },
              { value: 'teaser' as SummaryFormat, label: t('ai_summary_format_teaser') },
              { value: 'headline' as SummaryFormat, label: t('ai_summary_format_headline') },
            ]}
          />
          <SegmentedControl
            ariaLabel={t('ai_summary_length')}
            value={length}
            onChange={(value) =>
              setAiSettings((s) => ({ ...s, summary: { ...s.summary, length: value } }))
            }
            options={[
              { value: 'short' as SummaryLength, label: t('ai_summary_length_short') },
              { value: 'medium' as SummaryLength, label: t('ai_summary_length_medium') },
              { value: 'long' as SummaryLength, label: t('ai_summary_length_long') },
            ]}
          />
          <label
            htmlFor="nt-summary-bilingual"
            className="ml-auto inline-flex items-center gap-1 text-xs"
          >
            <Switch
              id="nt-summary-bilingual"
              checked={showBilingual}
              onCheckedChange={(checked) =>
                setAiSettings((s) => ({ ...s, summary: { ...s.summary, bilingual: checked } }))
              }
            />
            {t('ai_summary_bilingual')}
          </label>
          <Button size="sm" variant="ghost" onClick={() => void run()}>
            {t('ai_summary_refresh')}
          </Button>
        </div>

        {page ? (
          <div className="text-xs text-zinc-500">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{page.title}</span>
            {page.url ? <span className="ml-2">{new URL(page.url).host}</span> : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_16px_48px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
          {loading && !text ? <Skeleton lines={3} /> : null}
          {text ? <MarkdownView text={text} /> : null}
          {showBilingual && bilingual.length > 0 ? (
            <div className="mt-3 space-y-1 text-[12px] text-cyan-800 dark:text-cyan-200">
              {bilingual.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          {!loading && !text ? (
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={t('ai_summary_empty')}
              action={
                <Button size="sm" variant="ai" onClick={() => void run()}>
                  {t('ai_summary_page')}
                </Button>
              }
            />
          ) : null}
          {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
          {page?.truncated ? (
            <p className="mt-2 text-xs text-amber-600">{t('ai_summary_truncated')}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(text)}
          >
            {t('ai_summary_copy')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(text)}
          >
            {t('ai_summary_copy_md')}
          </Button>
          <AiBadge className="ml-auto" />
          {onAskPage ? (
            <Button size="sm" variant="ghost" onClick={onAskPage}>
              {t('ai_summary_ask_more')}
            </Button>
          ) : null}
        </div>
      </div>
    </AiModelGate>
  )
}
