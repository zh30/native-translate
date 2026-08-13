import { MessageSquare } from 'lucide-react'
import React from 'react'
import { AiModelGate } from '@/components/ui/ai-model-gate'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MarkdownView } from '@/components/ui/markdown-view'
import { ProgressRing } from '@/components/ui/progress-ring'
import { Textarea } from '@/components/ui/textarea'
import { useAiCapabilities } from '@/shared/ai/capabilities'
import { runAiTask, streamAiTask } from '@/shared/ai/client'
import { extractFromTextBlocks, joinExtractedText } from '@/shared/extract'
import type { LanguageCode } from '@/shared/languages'
import { MSG_GET_PAGE_CONTENT } from '@/shared/messages'
import { t } from '@/utils/i18n'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export interface ChatTabProps {
  targetLanguage: LanguageCode
}

export function ChatTab({ targetLanguage }: ChatTabProps) {
  const { capabilities, refresh } = useAiCapabilities()
  const [title, setTitle] = React.useState('')
  const [digest, setDigest] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [emptyPage, setEmptyPage] = React.useState(false)
  const [pageChanged, setPageChanged] = React.useState(false)
  const [compacted, setCompacted] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState('')
  const [suggested, setSuggested] = React.useState<string[]>([])
  const [usage, setUsage] = React.useState(0)
  const sessionId = React.useRef(`chat-${Date.now()}`)
  const pageKey = React.useRef('')

  const loadContext = React.useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        setEmptyPage(true)
        return
      }
      const payload = (await chrome.tabs.sendMessage(tab.id, { type: MSG_GET_PAGE_CONTENT })) as {
        title: string
        url?: string
        blocks: string[]
      }
      const extracted = extractFromTextBlocks({
        title: payload.title,
        blocks: payload.blocks ?? [],
      })
      const text = joinExtractedText(extracted)
      setEmptyPage(text.length < 40)
      setTitle(payload.title)
      setUrl(payload.url ?? tab.url ?? '')
      setDigest(text.slice(0, 12_000))
      pageKey.current = `${tab.id}:${tab.url}`
      setPageChanged(false)
      sessionId.current = `chat-${Date.now()}`
      setMessages([])
      if (text.length >= 40) {
        try {
          const result = (await runAiTask({
            kind: 'suggestQuestions',
            digest: text.slice(0, 6000),
            title: payload.title,
            targetLanguage,
          })) as { questions?: string[] }
          setSuggested((result.questions ?? []).filter(Boolean).slice(0, 3))
        } catch {
          setSuggested([])
        }
      }
    } catch {
      setEmptyPage(true)
      setSuggested([])
    }
  }, [targetLanguage])

  React.useEffect(() => {
    void loadContext()
  }, [loadContext])

  React.useEffect(() => {
    const onActivated = () => setPageChanged(true)
    const onUpdated = (_tabId: number, info: { url?: string }) => {
      if (info.url) setPageChanged(true)
    }
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [])

  const send = async (question: string) => {
    if (!question.trim() || emptyPage) return
    setInput('')
    const userId = `user-${Date.now()}`
    const assistantId = `assistant-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text: question },
      { id: assistantId, role: 'assistant', text: '' },
    ])
    let acc = ''
    try {
      const result = (await streamAiTask(
        {
          kind: 'chat',
          sessionId: sessionId.current,
          question,
          pageDigest: digest,
          targetLanguage,
        },
        (frame) => {
          if (frame.type === 'chunk') {
            acc += frame.delta
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last) next[next.length - 1] = { ...last, role: 'assistant', text: acc }
              return next
            })
          }
          if (frame.type === 'done') {
            const usageValue = frame.usage
            const pct = usageValue
              ? Math.round((usageValue.contextUsage / Math.max(1, usageValue.contextWindow)) * 100)
              : 0
            if (usageValue) setUsage(pct)
            const compactedFlag = Boolean(
              (frame.result as { compacted?: boolean } | undefined)?.compacted,
            )
            if (compactedFlag || pct >= 85) setCompacted(true)
          }
        },
      )) as { text?: string }
      const finalText = result?.text ?? acc
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last) next[next.length - 1] = { ...last, role: 'assistant', text: finalText }
        return next
      })
    } catch (error) {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last) {
          next[next.length - 1] = {
            ...last,
            role: 'assistant',
            text: error instanceof Error ? error.message : t('ai_error_internal'),
          }
        }
        return next
      })
    }
  }

  return (
    <AiModelGate capabilities={capabilities} onRefresh={refresh}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {t('ai_chat_reading')}: {title || '—'}
            </p>
            <p className="truncate text-zinc-500">{url}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void loadContext()}>
            {t('ai_chat_reload')}
          </Button>
        </div>
        {pageChanged ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {t('ai_chat_page_changed')}{' '}
            <button type="button" className="underline" onClick={() => void loadContext()}>
              {t('ai_chat_reload_context')}
            </button>
          </div>
        ) : null}
        {compacted ? <p className="text-xs text-zinc-500">{t('ai_chat_compacted')}</p> : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          {emptyPage ? (
            <EmptyState icon={<MessageSquare className="h-5 w-5" />} title={t('ai_chat_empty')} />
          ) : null}
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'text-right' : ''}>
              {message.role === 'user' ? (
                <p className="inline-block rounded-xl bg-zinc-100 px-3 py-2 text-[13px] dark:bg-zinc-800">
                  {message.text}
                </p>
              ) : (
                <MarkdownView text={message.text} />
              )}
            </div>
          ))}
          {suggested.length > 0 && messages.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {suggested.map((question) => (
                <Button
                  key={question}
                  size="sm"
                  variant="outline"
                  onClick={() => void send(question)}
                >
                  {question}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            placeholder={t('ai_chat_placeholder')}
            className="min-h-[64px]"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send(input)
              }
            }}
          />
          <Button variant="ai" onClick={() => void send(input)}>
            {t('ai_chat_send')}
          </Button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <ProgressRing value={usage} size={18} />
            {t('ai_chat_usage')} {usage}%
          </span>
          <button type="button" onClick={() => setMessages([])}>
            {t('ai_chat_clear')}
          </button>
        </div>
      </div>
    </AiModelGate>
  )
}
