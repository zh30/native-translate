import '../styles/tailwind.css'
import { ModelDownloadToast } from '@/components/ModelDownloadToast'
import { Button } from '@/components/ui/button'
import { DEFAULT_TARGET_LANGUAGE, type LanguageCode } from '@/shared/languages'
import type { TranslatorInstance } from '@/shared/streaming'
import { cn } from '@/utils/cn'
import { t } from '@/utils/i18n'
import { getUILocale, isRTLLanguage } from '@/utils/rtl'
import { useFirstRunStatus } from '@/utils/useFirstRunStatus'
import { ArrowRight, CheckCircle2, Globe2, Loader2, PanelRightOpen, Sparkles } from 'lucide-react'
import React from 'react'
import ReactDOM from 'react-dom/client'

interface TranslatorMonitorEvent extends Event {
  loaded?: number
}

interface TranslatorMonitor {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: TranslatorMonitorEvent) => void,
  ): void
}

interface TranslatorCreateOptions {
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  monitor?: (monitor: TranslatorMonitor) => void
}

interface TranslatorStaticLegacy {
  create(options: TranslatorCreateOptions): Promise<TranslatorInstance>
}

interface TranslatorStaticModern {
  createTranslator(options: TranslatorCreateOptions): Promise<TranslatorInstance>
}

type WelcomeWindow = Window &
  typeof globalThis & {
    Translator?: TranslatorStaticLegacy
    translation?: TranslatorStaticModern
  }

const SAMPLE_TEXT = 'Hello, welcome to Native Translate.'
const SAMPLE_SOURCE_LANGUAGE: LanguageCode = 'en'
const SAMPLE_TARGET_LANGUAGE: LanguageCode = DEFAULT_TARGET_LANGUAGE

function resolveTranslatorAdapter(): {
  create(options: TranslatorCreateOptions): Promise<TranslatorInstance>
} | null {
  const win = window as WelcomeWindow
  if (win.Translator?.create) return { create: win.Translator.create.bind(win.Translator) }
  if (win.translation?.createTranslator) {
    return { create: win.translation.createTranslator.bind(win.translation) }
  }
  return null
}

const Welcome: React.FC = () => {
  const [firstRunStatus, firstRunStatusReady, setFirstRunStatus] = useFirstRunStatus()
  const [sampleResult, setSampleResult] = React.useState('')
  const [isPreparing, setIsPreparing] = React.useState(false)
  const [isOpeningSidePanel, setIsOpeningSidePanel] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const prepareStartedRef = React.useRef(false)

  React.useEffect(() => {
    const ui = getUILocale()
    const dir = isRTLLanguage(ui) ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', ui)
  }, [])

  const prepareTranslator = React.useCallback(
    async (options?: {
      showError?: boolean
    }): Promise<TranslatorInstance | null> => {
      const showError = options?.showError ?? true
      if (isPreparing) return null
      setError(null)
      setIsPreparing(true)
      try {
        const adapter = resolveTranslatorAdapter()
        if (!adapter) {
          await setFirstRunStatus({
            status: 'unsupported',
            sourceLanguage: SAMPLE_SOURCE_LANGUAGE,
            targetLanguage: SAMPLE_TARGET_LANGUAGE,
            updatedAt: Date.now(),
            error: 'Translator API unavailable',
          })
          if (showError) setError(t('first_run_status_unsupported_desc'))
          return null
        }

        await setFirstRunStatus({
          status: 'preparing',
          sourceLanguage: SAMPLE_SOURCE_LANGUAGE,
          targetLanguage: SAMPLE_TARGET_LANGUAGE,
          updatedAt: Date.now(),
        })

        const translator = await adapter.create({
          sourceLanguage: SAMPLE_SOURCE_LANGUAGE,
          targetLanguage: SAMPLE_TARGET_LANGUAGE,
          monitor(monitor) {
            monitor.addEventListener('downloadprogress', (event) => {
              const progress = Math.round((event.loaded ?? 0) * 100)
              void setFirstRunStatus({
                status: 'downloading',
                progress,
                sourceLanguage: SAMPLE_SOURCE_LANGUAGE,
                targetLanguage: SAMPLE_TARGET_LANGUAGE,
                updatedAt: Date.now(),
              })
            })
          },
        })
        if (translator.ready) await translator.ready
        await setFirstRunStatus({
          status: 'ready',
          sourceLanguage: SAMPLE_SOURCE_LANGUAGE,
          targetLanguage: SAMPLE_TARGET_LANGUAGE,
          updatedAt: Date.now(),
        })
        return translator
      } catch (prepareError) {
        const message = prepareError instanceof Error ? prepareError.message : String(prepareError)
        await setFirstRunStatus({
          status: /Translator API unavailable/i.test(message) ? 'unsupported' : 'failed',
          sourceLanguage: SAMPLE_SOURCE_LANGUAGE,
          targetLanguage: SAMPLE_TARGET_LANGUAGE,
          updatedAt: Date.now(),
          error: message,
        })
        if (showError) setError(message)
        return null
      } finally {
        setIsPreparing(false)
      }
    },
    [isPreparing, setFirstRunStatus],
  )

  React.useEffect(() => {
    if (!firstRunStatusReady || prepareStartedRef.current || firstRunStatus.status === 'ready') {
      return
    }
    prepareStartedRef.current = true
    void prepareTranslator({ showError: false })
  }, [firstRunStatus.status, firstRunStatusReady, prepareTranslator])

  const handleTrySample = React.useCallback(async () => {
    setError(null)
    setSampleResult('')
    const translator = await prepareTranslator({ showError: true })
    if (!translator) return
    try {
      setSampleResult(await translator.translate(SAMPLE_TEXT))
    } catch (translationError) {
      setError(translationError instanceof Error ? translationError.message : t('unknown_error'))
    }
  }, [prepareTranslator])

  const handleOpenSidePanel = React.useCallback(async () => {
    setError(null)
    setIsOpeningSidePanel(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error(t('active_tab_not_found'))
      await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidePanel.html', enabled: true })
      await chrome.sidePanel.open({ tabId: tab.id })
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : t('unknown_error'))
    } finally {
      setIsOpeningSidePanel(false)
    }
  }, [])

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
              <Globe2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">{t('welcome_title')}</h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {t('welcome_subtitle')}
              </p>
            </div>
          </div>
          <span className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {t('extension_name')}
          </span>
        </header>

        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase text-cyan-700 dark:text-cyan-300">
                {t('welcome_setup_label')}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal">
                {t('welcome_setup_title')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {t('welcome_setup_desc')}
              </p>
            </div>

            <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-300" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('welcome_try_title')}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {t('welcome_try_desc')}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 rounded-md bg-white p-3 text-sm dark:bg-zinc-950">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <span>{SAMPLE_TEXT}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
                <div
                  className={cn(
                    'min-h-8 rounded-md border border-dashed border-zinc-200 p-2',
                    'text-zinc-900 dark:border-zinc-800 dark:text-zinc-100',
                  )}
                >
                  {sampleResult || t('welcome_sample_placeholder')}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  className="h-9 gap-2 rounded-lg"
                  disabled={isPreparing}
                  onClick={handleTrySample}
                  type="button"
                >
                  {isPreparing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {t('welcome_try_action')}
                </Button>
                <Button
                  className="h-9 gap-2 rounded-lg"
                  disabled={isOpeningSidePanel}
                  onClick={handleOpenSidePanel}
                  type="button"
                  variant="outline"
                >
                  {isOpeningSidePanel ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                  {t('open_sidepanel')}
                </Button>
              </div>

              {error && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  {error}
                </p>
              )}
            </div>
          </div>

          <aside className="grid content-start gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold">{t('welcome_next_title')}</h2>
            {[
              'welcome_next_page',
              'welcome_next_hover',
              'welcome_next_sidepanel',
              'welcome_next_file',
            ].map((key, index) => (
              <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3" key={key}>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                  {t(key)}
                </p>
              </div>
            ))}
          </aside>
        </section>
      </div>
      <ModelDownloadToast status={firstRunStatus} />
    </main>
  )
}

const container = document.getElementById('root')
const root = ReactDOM.createRoot(container as HTMLElement)
root.render(<Welcome />)
