import { Sparkles } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { ProgressRing } from '@/components/ui/progress-ring'
import {
  type AiCapabilitiesSnapshot,
  markCapabilitiesDownloading,
  probeAiCapabilities,
} from '@/shared/ai/capabilities'
import { t } from '@/utils/i18n'

export interface AiModelGateProps {
  capabilities: AiCapabilitiesSnapshot
  children: React.ReactNode
  hideWhenUnavailable?: boolean
  onRefresh?: () => Promise<void> | void
}

export function AiModelGate({
  capabilities,
  children,
  hideWhenUnavailable = true,
  onRefresh,
}: AiModelGateProps) {
  const [busy, setBusy] = React.useState(false)

  if (capabilities.gate === 'ready') return <>{children}</>
  if (capabilities.gate === 'unavailable' && hideWhenUnavailable) return null

  const startDownload = async () => {
    setBusy(true)
    try {
      await markCapabilitiesDownloading(0)
      const w = window as Window & {
        LanguageModel?: { create?: (opts: unknown) => Promise<unknown> }
        Summarizer?: { create?: (opts: unknown) => Promise<unknown> }
      }
      const monitor = (m: { addEventListener: (type: string, cb: (e: Event) => void) => void }) => {
        m.addEventListener('downloadprogress', (event) => {
          const progress = Number((event as Event & { loaded?: number }).loaded ?? 0)
          void markCapabilitiesDownloading(Math.round(progress * 100))
        })
      }
      if (w.LanguageModel?.create) {
        await w.LanguageModel.create({ monitor })
      } else if (w.Summarizer?.create) {
        await w.Summarizer.create({ type: 'key-points', monitor })
      }
      await probeAiCapabilities({ force: true })
      await onRefresh?.()
    } finally {
      setBusy(false)
    }
  }

  if (capabilities.gate === 'downloading') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <ProgressRing value={capabilities.progress ?? 0} />
        <div>
          <p className="text-sm font-medium">{t('ai_gate_downloading')}</p>
          <p className="text-xs text-zinc-500 tabular-nums">{capabilities.progress ?? 0}%</p>
        </div>
      </div>
    )
  }

  if (capabilities.gate === 'downloadable') {
    return (
      <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--color-ai-from)]" />
          <p className="text-sm font-medium">{t('ai_gate_enable')}</p>
        </div>
        <p className="mb-3 text-xs text-zinc-500">{t('ai_gate_download_desc')}</p>
        <Button variant="ai" size="sm" disabled={busy} onClick={() => void startDownload()}>
          {t('ai_gate_download_cta')}
        </Button>
      </div>
    )
  }

  if (capabilities.gate === 'unavailable') {
    return (
      <p className="text-xs text-zinc-500">
        {t('ai_gate_unavailable')} {t('ai_gate_unavailable_hint')}
      </p>
    )
  }

  if (capabilities.gate === 'error') {
    return <p className="text-xs text-red-500">{t('ai_gate_error')}</p>
  }

  return <p className="text-xs text-zinc-500">{t('ai_gate_checking')}</p>
}
