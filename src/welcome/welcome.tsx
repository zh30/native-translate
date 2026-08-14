import '../styles/tailwind.css'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ModelDownloadToast } from '@/components/ModelDownloadToast'
import { Button } from '@/components/ui/button'
import { DEFAULT_TARGET_LANGUAGE, type LanguageCode } from '@/shared/languages'
import {
  type FirstRunModelStatus,
  type FirstRunStatus,
  POPUP_SETTINGS_KEY,
  type PopupSettings,
  WELCOME_TOUR_KEY,
} from '@/shared/settings'
import type { TranslatorInstance } from '@/shared/streaming'
import { cn } from '@/utils/cn'
import { t } from '@/utils/i18n'
import { getUILocale, isRTLLanguage } from '@/utils/rtl'
import { useChromeLocalStorage } from '@/utils/useChromeLocalStorage'
import { useFirstRunStatus } from '@/utils/useFirstRunStatus'
import {
  DEFAULT_WELCOME_TOUR,
  fallbackTranslation,
  normalizeWelcomeTour,
  type WelcomeTourStep,
} from './tour'
import { WelcomeTour } from './WelcomeTour'

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

const defaultPopupSettings: PopupSettings = {
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  hotkeyModifier: 'alt',
}

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

function extensionIconUrl(): string {
  try {
    return chrome.runtime.getURL('public/icon48.png')
  } catch {
    return 'public/icon48.png'
  }
}

function statusTone(status: FirstRunModelStatus): 'idle' | 'progress' | 'ready' | 'warn' {
  if (status === 'ready') return 'ready'
  if (status === 'failed' || status === 'unsupported') return 'warn'
  if (status === 'preparing' || status === 'downloading') return 'progress'
  return 'idle'
}

function statusCopy(status: FirstRunStatus): { title: string; description: string } {
  switch (status.status) {
    case 'preparing':
      return {
        title: t('first_run_status_preparing_title'),
        description: t('first_run_status_preparing_desc'),
      }
    case 'downloading':
      return {
        title: t('first_run_status_downloading_title'),
        description: t('first_run_status_downloading_desc', [
          typeof status.progress === 'number' ? status.progress : 0,
        ]),
      }
    case 'ready':
      return {
        title: t('first_run_status_ready_title'),
        description: t('first_run_status_ready_desc'),
      }
    case 'failed':
      return {
        title: t('first_run_status_failed_title'),
        description: t('first_run_status_failed_desc'),
      }
    case 'unsupported':
      return {
        title: t('first_run_status_unsupported_title'),
        description: t('first_run_status_unsupported_desc'),
      }
    default:
      return {
        title: t('first_run_status_new_title'),
        description: t('first_run_status_new_desc'),
      }
  }
}

interface StatusPanelProps {
  status: FirstRunStatus
  ready: boolean
  isPreparing: boolean
  onRetry: () => void
  compact?: boolean
}

const StatusPanel: React.FC<StatusPanelProps> = ({
  status,
  ready,
  isPreparing,
  onRetry,
  compact = false,
}) => {
  const copy = statusCopy(status)
  const tone = statusTone(status.status)
  const progress =
    status.status === 'downloading' && typeof status.progress === 'number'
      ? Math.max(0, Math.min(100, status.progress))
      : null
  const canRetry = status.status === 'failed' || status.status === 'unsupported'

  if (compact) {
    return (
      <p aria-live="polite" className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg',
            tone === 'ready' &&
              'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
            tone === 'progress' && 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
            tone === 'warn' && 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
            tone === 'idle' && 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300',
          )}
        >
          {!ready || tone === 'progress' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : tone === 'ready' ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="font-medium">{ready ? copy.title : t('checking')}</span>
        {progress !== null && (
          <span className="tabular-nums text-cyan-700 dark:text-cyan-300">{progress}%</span>
        )}
      </p>
    )
  }

  return (
    <section aria-live="polite" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg',
            tone === 'ready' &&
              'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
            tone === 'progress' && 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
            tone === 'warn' && 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
            tone === 'idle' && 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300',
          )}
        >
          {!ready || tone === 'progress' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : tone === 'ready' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{ready ? copy.title : t('checking')}</p>
          {progress !== null && (
            <p className="mt-0.5 text-xs tabular-nums text-cyan-700 dark:text-cyan-300">
              {progress}%
            </p>
          )}
        </div>
      </div>

      {progress !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-cyan-100 dark:bg-cyan-950">
          <div
            className="h-full rounded-full bg-cyan-600 transition-[width] duration-300 dark:bg-cyan-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div>
        {tone === 'ready' ? (
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{copy.description}</p>
        ) : (
          <>
            <p className="text-xs font-medium text-cyan-800 dark:text-cyan-300">
              {t('welcome_setup_label')}
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              {t('welcome_setup_title')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {t('welcome_setup_desc')}
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              {copy.description}
            </p>
          </>
        )}
      </div>

      {canRetry && (
        <Button
          className="h-9 w-fit gap-2 rounded-lg"
          disabled={isPreparing}
          onClick={onRetry}
          type="button"
          variant="outline"
        >
          {isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('first_run_prepare_action')}
        </Button>
      )}
    </section>
  )
}

const Welcome: React.FC = () => {
  const [firstRunStatus, firstRunStatusReady, setFirstRunStatus] = useFirstRunStatus()
  const [sampleResult, setSampleResult] = React.useState('')
  const [isPreparing, setIsPreparing] = React.useState(false)
  const [isOpeningSidePanel, setIsOpeningSidePanel] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const prepareStartedRef = React.useRef(false)
  const translatorRef = React.useRef<TranslatorInstance | null>(null)
  const [popupSettings] = useChromeLocalStorage<PopupSettings>(
    POPUP_SETTINGS_KEY,
    defaultPopupSettings,
  )
  const [tour, setTour] = useChromeLocalStorage(WELCOME_TOUR_KEY, DEFAULT_WELCOME_TOUR, {
    deserialize: normalizeWelcomeTour,
  })

  React.useEffect(() => {
    const ui = getUILocale()
    const dir = isRTLLanguage(ui) ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', ui)
  }, [])

  const prepareTranslator = React.useCallback(
    async (options?: { showError?: boolean }): Promise<TranslatorInstance | null> => {
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
        translatorRef.current = translator
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

  const handleRetryPrepare = React.useCallback(() => {
    prepareStartedRef.current = true
    void prepareTranslator({ showError: true })
  }, [prepareTranslator])

  const translateText = React.useCallback(
    async (text: string): Promise<string | null> => {
      const trimmed = text.trim()
      if (!trimmed) return null
      let translator = translatorRef.current
      if (!translator) translator = await prepareTranslator({ showError: false })
      if (translator) {
        try {
          return await translator.translate(trimmed)
        } catch {
          // Use the authored demo line when the live translator cannot finish.
        }
      }
      return fallbackTranslation(trimmed, SAMPLE_TARGET_LANGUAGE)
    },
    [prepareTranslator],
  )

  const visibleStep: WelcomeTourStep = tour.completed ? 'done' : tour.step

  const handleTourStepChange = React.useCallback(
    (step: WelcomeTourStep) => {
      setTour({ step, completed: false })
    },
    [setTour],
  )

  const handleTourComplete = React.useCallback(() => {
    setTour({ step: 'done', completed: true })
  }, [setTour])

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 start-[-8rem] h-[28rem] w-[28rem] rounded-full bg-cyan-200/45 blur-3xl dark:bg-cyan-500/10" />
        <div className="absolute top-[36%] -end-24 h-[22rem] w-[22rem] rounded-full bg-sky-100/70 blur-3xl dark:bg-sky-400/10" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              alt=""
              className="h-10 w-10 rounded-lg"
              height={40}
              src={extensionIconUrl()}
              width={40}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t('extension_name')}</p>
              <p className="mt-0.5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                {t('welcome_subtitle')}
              </p>
            </div>
          </div>
          <StatusPanel
            compact
            isPreparing={isPreparing}
            onRetry={handleRetryPrepare}
            ready={firstRunStatusReady}
            status={firstRunStatus}
          />
        </header>

        {statusTone(firstRunStatus.status) !== 'ready' && (
          <div className="mt-6">
            <StatusPanel
              isPreparing={isPreparing}
              onRetry={handleRetryPrepare}
              ready={firstRunStatusReady}
              status={firstRunStatus}
            />
          </div>
        )}

        <section className="mt-8 flex-1 content-center">
          <WelcomeTour
            error={error}
            hotkey={popupSettings.hotkeyModifier ?? 'alt'}
            iconUrl={extensionIconUrl()}
            isOpeningSidePanel={isOpeningSidePanel}
            isPreparing={isPreparing}
            onComplete={handleTourComplete}
            onOpenSidePanel={handleOpenSidePanel}
            onStepChange={handleTourStepChange}
            onTrySample={handleTrySample}
            sampleResult={sampleResult}
            step={visibleStep}
            targetLanguage={SAMPLE_TARGET_LANGUAGE}
            translateText={translateText}
          />
        </section>
      </div>
      <ModelDownloadToast status={firstRunStatus} />
    </main>
  )
}

const container = document.getElementById('root')
const root = ReactDOM.createRoot(container as HTMLElement)
root.render(<Welcome />)
