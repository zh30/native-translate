import {
  BookOpen,
  CheckCircle2,
  Globe2,
  Keyboard,
  Loader2,
  MousePointer2,
  PanelRightOpen,
} from 'lucide-react'
import React from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import type { LanguageCode } from '@/shared/languages'
import { cn } from '@/utils/cn'
import { t } from '@/utils/i18n'
import { isRTLLanguage } from '@/utils/rtl'
import {
  hotkeyKeycap,
  isModifierActive,
  nextTourStep,
  PRACTICE_PARAGRAPHS,
  TOUR_STEPS,
  TYPE_SAMPLE_TEXT,
  tourStepIndex,
  type WelcomeTourStep,
} from './tour'

type HotkeyModifier = 'alt' | 'control' | 'shift'

interface WelcomeTourProps {
  step: WelcomeTourStep
  onStepChange: (step: WelcomeTourStep) => void
  onComplete: () => void
  sampleResult: string
  isPreparing: boolean
  error: string | null
  onTrySample: () => void
  onOpenSidePanel: () => void
  isOpeningSidePanel: boolean
  translateText: (text: string) => Promise<string | null>
  hotkey: HotkeyModifier
  targetLanguage: LanguageCode
  iconUrl: string
}

function stepLabel(step: Exclude<WelcomeTourStep, 'done'>): string {
  return t(`welcome_tour_step_${step}`)
}

function hotkeyName(modifier: HotkeyModifier): string {
  if (modifier === 'alt') return t('hotkey_alt')
  if (modifier === 'control') return t('hotkey_control')
  return t('hotkey_shift')
}

const WelcomeTour: React.FC<WelcomeTourProps> = ({
  step,
  onStepChange,
  onComplete,
  sampleResult,
  isPreparing,
  error,
  onTrySample,
  onOpenSidePanel,
  isOpeningSidePanel,
  translateText,
  hotkey,
  targetLanguage,
  iconUrl,
}) => {
  const [translations, setTranslations] = React.useState<Record<string, string>>({})
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const [modifierDown, setModifierDown] = React.useState(false)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const [finePointer, setFinePointer] = React.useState(true)
  const [composeValue, setComposeValue] = React.useState(TYPE_SAMPLE_TEXT)
  const [composeResult, setComposeResult] = React.useState('')
  const [composePending, setComposePending] = React.useState(false)
  const [composingIme, setComposingIme] = React.useState(false)
  const [popupOpen, setPopupOpen] = React.useState(false)
  const [pageTranslated, setPageTranslated] = React.useState(false)
  const [lessonError, setLessonError] = React.useState<string | null>(null)
  const hoveredIdRef = React.useRef<string | null>(null)
  const modifierDownRef = React.useRef(false)
  const translateTextRef = React.useRef(translateText)
  const translatedIdsRef = React.useRef<Set<string>>(new Set())
  const inflightRef = React.useRef<Set<string>>(new Set())

  hoveredIdRef.current = hoveredId
  modifierDownRef.current = modifierDown
  translateTextRef.current = translateText

  const targetRtl = isRTLLanguage(targetLanguage)
  const currentIndex = tourStepIndex(step)
  const hoverDone = Object.keys(translations).length > 0
  const typeDone = composeResult.length > 0
  const pageDone = pageTranslated
  const readyDone = sampleResult.length > 0
  const stepComplete =
    step === 'ready'
      ? readyDone
      : step === 'hover'
        ? hoverDone
        : step === 'type'
          ? typeDone
          : step === 'page'
            ? pageDone
            : true

  React.useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setFinePointer(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const markPending = React.useCallback((id: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const translateParagraph = React.useCallback(
    async (id: string, text: string) => {
      if (translatedIdsRef.current.has(id) || inflightRef.current.has(id)) return
      inflightRef.current.add(id)
      markPending(id, true)
      setLessonError(null)
      try {
        const result = await translateTextRef.current(text)
        if (!result) {
          setLessonError(t('create_translator_failed'))
          return
        }
        translatedIdsRef.current.add(id)
        setTranslations((current) => ({ ...current, [id]: result }))
      } finally {
        inflightRef.current.delete(id)
        markPending(id, false)
      }
    },
    [markPending],
  )

  React.useEffect(() => {
    if (step !== 'hover' && step !== 'page') {
      setModifierDown(false)
    }
    if (step !== 'page') setPopupOpen(false)
  }, [step])

  React.useEffect(() => {
    if (!popupOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopupOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [popupOpen])

  React.useEffect(() => {
    if (step !== 'hover') return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModifierActive(event, hotkey)) return
      setModifierDown(true)
      const id = hoveredIdRef.current
      if (!id) return
      const paragraph = PRACTICE_PARAGRAPHS.find((item) => item.id === id)
      if (paragraph) void translateParagraph(paragraph.id, paragraph.text)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isModifierActive(event, hotkey)) setModifierDown(false)
    }
    const onBlur = () => setModifierDown(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [hotkey, step, translateParagraph])

  const handleParagraphEnter = React.useCallback(
    (id: string, text: string) => {
      setHoveredId(id)
      if (step !== 'hover') return
      if (finePointer && !modifierDownRef.current) return
      void translateParagraph(id, text)
    },
    [finePointer, step, translateParagraph],
  )

  const handleComposeKeyDown = React.useCallback(
    async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (step !== 'type' || composingIme || composePending) return
      const isSpace = event.key === ' ' || event.code === 'Space'
      if (!isSpace) return
      const field = event.currentTarget
      const start = field.selectionStart
      const end = field.selectionEnd
      if (start === null || end === null || start !== end) return
      const left = composeValue.slice(0, start)
      if (!left.endsWith('  ')) return
      event.preventDefault()
      const nextValue = composeValue.slice(0, start - 2) + composeValue.slice(start)
      setComposeValue(nextValue)
      setComposePending(true)
      setLessonError(null)
      try {
        const result = await translateTextRef.current(nextValue.trim())
        if (!result) {
          setLessonError(t('create_translator_failed'))
          return
        }
        setComposeResult(result)
        setComposeValue(result)
      } finally {
        setComposePending(false)
      }
    },
    [composePending, composeValue, composingIme, step],
  )

  const handleTranslatePage = React.useCallback(async () => {
    setPopupOpen(false)
    setLessonError(null)
    for (const paragraph of PRACTICE_PARAGRAPHS) {
      await translateParagraph(paragraph.id, paragraph.text)
    }
    setPageTranslated(true)
  }, [translateParagraph])

  const goNext = React.useCallback(() => {
    const next = nextTourStep(step)
    if (next === 'done') onComplete()
    else onStepChange(next)
  }, [onComplete, onStepChange, step])

  const skipAll = React.useCallback(() => {
    onComplete()
  }, [onComplete])

  const replay = React.useCallback(() => {
    translatedIdsRef.current = new Set()
    inflightRef.current = new Set()
    setTranslations({})
    setComposeValue(TYPE_SAMPLE_TEXT)
    setComposeResult('')
    setPageTranslated(false)
    setPopupOpen(false)
    setLessonError(null)
    onStepChange(readyDone ? 'hover' : 'ready')
  }, [onStepChange, readyDone])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)] lg:items-start lg:gap-16">
      <div className="min-w-0">
        {step === 'ready' || step === 'done' ? (
          <div>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15] dark:text-zinc-50">
              {step === 'done' ? t('welcome_tour_done_title') : t('welcome_title')}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600 sm:text-base dark:text-zinc-300">
              {step === 'done' ? t('welcome_tour_done_desc') : t('welcome_try_desc')}
            </p>
          </div>
        ) : (
          <div>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">
              {t(`welcome_tour_${step}_title`)}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600 sm:text-base dark:text-zinc-300">
              {step === 'hover'
                ? t(finePointer ? 'welcome_tour_hover_desc' : 'welcome_tour_hover_desc_touch', [
                    hotkeyName(hotkey),
                  ])
                : t(`welcome_tour_${step}_desc`)}
            </p>
          </div>
        )}

        {step === 'ready' ? (
          <ReadyCard
            isPreparing={isPreparing}
            onTrySample={onTrySample}
            sampleResult={sampleResult}
            targetLanguage={targetLanguage}
            targetRtl={targetRtl}
          />
        ) : (
          <PracticeBrowser
            composePending={composePending}
            composeResult={composeResult}
            composeValue={composeValue}
            finePointer={finePointer}
            hoveredId={hoveredId}
            iconUrl={iconUrl}
            modifierDown={modifierDown}
            onClosePopup={() => setPopupOpen(false)}
            onComposeChange={setComposeValue}
            onComposeComposition={setComposingIme}
            onComposeKeyDown={handleComposeKeyDown}
            onOpenPopup={() => setPopupOpen(true)}
            onParagraphEnter={handleParagraphEnter}
            onParagraphLeave={() => setHoveredId(null)}
            onTranslatePage={handleTranslatePage}
            pendingIds={pendingIds}
            popupOpen={popupOpen}
            showCompose={step === 'type'}
            showToolbarAction={step === 'page' || pageDone}
            step={step}
            targetRtl={targetRtl}
            translations={translations}
          />
        )}
      </div>

      <aside className="grid gap-6 lg:pt-2">
        <StepRail current={step} onSelect={onStepChange} />

        <LessonCoach
          error={lessonError ?? (step === 'ready' ? error : null)}
          isOpeningSidePanel={isOpeningSidePanel}
          onContinue={goNext}
          onOpenSidePanel={onOpenSidePanel}
          onReplay={replay}
          onSkip={goNext}
          onSkipAll={skipAll}
          step={step}
          stepComplete={stepComplete}
        />

        {step === 'hover' && finePointer && (
          <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <span>{t('welcome_tour_hover_hint', [hotkeyName(hotkey)])}</span>
            <Kbd
              className={cn(
                'text-[11px]',
                modifierDown &&
                  'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
              )}
            >
              {hotkeyKeycap(hotkey)}
            </Kbd>
          </p>
        )}

        {stepComplete && step !== 'done' && step !== 'ready' && (
          <p className="animate-fade-up text-sm leading-6 text-cyan-800 dark:text-cyan-200">
            {t(`welcome_tour_${step}_success`)}
          </p>
        )}

        {step === 'done' && <DoneRecap />}

        {step !== 'done' && (
          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {t('welcome_tour_progress', [String(Math.min(currentIndex + 1, 4)), '4'])}
          </p>
        )}
      </aside>
    </div>
  )
}

interface StepRailProps {
  current: WelcomeTourStep
  onSelect: (step: WelcomeTourStep) => void
}

const StepRail: React.FC<StepRailProps> = ({ current, onSelect }) => {
  const currentIndex = tourStepIndex(current)
  return (
    <ol className="flex flex-wrap gap-2">
      {TOUR_STEPS.map((item, index) => {
        const active = current === item
        const reachable = index <= currentIndex || current === 'done'
        return (
          <li key={item}>
            <button
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                active && 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950',
                !active &&
                  reachable &&
                  'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300',
                !reachable && 'cursor-default text-zinc-400 dark:text-zinc-600',
              )}
              disabled={!reachable}
              onClick={() => reachable && onSelect(item)}
              type="button"
            >
              {stepLabel(item)}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

interface LessonCoachProps {
  step: WelcomeTourStep
  stepComplete: boolean
  isOpeningSidePanel: boolean
  error: string | null
  onContinue: () => void
  onSkip: () => void
  onSkipAll: () => void
  onReplay: () => void
  onOpenSidePanel: () => void
}

const LessonCoach: React.FC<LessonCoachProps> = ({
  step,
  stepComplete,
  isOpeningSidePanel,
  error,
  onContinue,
  onSkip,
  onSkipAll,
  onReplay,
  onOpenSidePanel,
}) => {
  return (
    <div className="grid gap-3">
      {step === 'done' ? (
        <>
          <Button
            className={cn(
              'h-10 w-full gap-2 rounded-lg bg-zinc-950 text-white hover:bg-zinc-800',
              'dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
            )}
            disabled={isOpeningSidePanel}
            onClick={onOpenSidePanel}
            type="button"
          >
            {isOpeningSidePanel ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
            {t('open_sidepanel')}
          </Button>
          <Button className="h-9 w-fit rounded-lg" onClick={onReplay} type="button" variant="ghost">
            {t('welcome_tour_replay')}
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            className={cn(
              'h-10 gap-2 rounded-lg bg-zinc-950 text-white hover:bg-zinc-800',
              'dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
              step === 'ready' && !stepComplete && 'hidden',
            )}
            disabled={!stepComplete}
            onClick={onContinue}
            type="button"
          >
            {step === 'page' ? t('welcome_tour_finish') : t('welcome_tour_continue')}
          </Button>
          <Button className="h-10 rounded-lg" onClick={onSkip} type="button" variant="outline">
            {t('welcome_tour_skip')}
          </Button>
          <Button className="h-10 rounded-lg" onClick={onSkipAll} type="button" variant="ghost">
            {t('welcome_tour_skip_all')}
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="warning">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

interface ReadyCardProps {
  sampleResult: string
  isPreparing: boolean
  onTrySample: () => void
  targetLanguage: LanguageCode
  targetRtl: boolean
}

const ReadyCard: React.FC<ReadyCardProps> = ({
  sampleResult,
  isPreparing,
  onTrySample,
  targetLanguage,
  targetRtl,
}) => {
  return (
    <div
      className={cn(
        'mt-8 rounded-2xl border border-zinc-200 bg-white p-5',
        'shadow-[0_16px_48px_rgba(15,23,42,0.08)] sm:p-8',
        'dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]',
      )}
    >
      <p className="text-sm font-medium">{t('welcome_try_title')}</p>
      <p className="mt-5 text-2xl font-semibold leading-snug tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
        Hello, welcome to Native Translate.
      </p>
      <p
        aria-live="polite"
        className={cn(
          'mt-3 text-lg leading-relaxed sm:text-xl',
          sampleResult && 'animate-fade-up',
          sampleResult ? 'text-cyan-800 dark:text-cyan-200' : 'text-zinc-500 dark:text-zinc-400',
          isPreparing && !sampleResult && 'animate-shimmer',
        )}
        dir={targetRtl ? 'rtl' : 'ltr'}
        lang={targetLanguage}
        role="status"
      >
        {sampleResult || t('welcome_sample_placeholder')}
      </p>
      <Button
        className={cn(
          'mt-8 h-10 w-full gap-2 rounded-lg bg-zinc-950 text-white hover:bg-zinc-800 sm:w-auto',
          'dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
        )}
        disabled={isPreparing}
        onClick={onTrySample}
        type="button"
      >
        {isPreparing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {t('welcome_try_action')}
      </Button>
    </div>
  )
}

interface PracticeBrowserProps {
  step: WelcomeTourStep
  iconUrl: string
  translations: Record<string, string>
  pendingIds: ReadonlySet<string>
  hoveredId: string | null
  modifierDown: boolean
  finePointer: boolean
  showCompose: boolean
  showToolbarAction: boolean
  composeValue: string
  composeResult: string
  composePending: boolean
  popupOpen: boolean
  targetRtl: boolean
  onParagraphEnter: (id: string, text: string) => void
  onParagraphLeave: () => void
  onComposeChange: (value: string) => void
  onComposeKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onComposeComposition: (composing: boolean) => void
  onOpenPopup: () => void
  onClosePopup: () => void
  onTranslatePage: () => void
}

const PracticeBrowser: React.FC<PracticeBrowserProps> = ({
  step,
  iconUrl,
  translations,
  pendingIds,
  hoveredId,
  modifierDown,
  finePointer,
  showCompose,
  showToolbarAction,
  composeValue,
  composeResult,
  composePending,
  popupOpen,
  targetRtl,
  onParagraphEnter,
  onParagraphLeave,
  onComposeChange,
  onComposeKeyDown,
  onComposeComposition,
  onOpenPopup,
  onClosePopup,
  onTranslatePage,
}) => {
  const trailingSpaces = composeValue.endsWith('  ') ? 2 : composeValue.endsWith(' ') ? 1 : 0

  return (
    <div
      className={cn(
        'relative mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white',
        'shadow-[0_16px_48px_rgba(15,23,42,0.08)]',
        'dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]',
      )}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span aria-hidden className="flex gap-1 px-1">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        </span>
        <p className="min-w-0 flex-1 truncate rounded-md bg-zinc-100 px-3 py-1 text-center text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          {t('welcome_tour_page_address')}
        </p>
        <button
          aria-expanded={popupOpen}
          aria-haspopup="dialog"
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            showToolbarAction
              ? 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
              : 'cursor-default opacity-50',
          )}
          disabled={!showToolbarAction}
          onClick={onOpenPopup}
          type="button"
        >
          <img
            alt={t('popup_title')}
            className="h-5 w-5 rounded-sm"
            height={20}
            src={iconUrl}
            width={20}
          />
        </button>
      </div>

      <article className="grid gap-5 p-5 sm:p-8">
        {PRACTICE_PARAGRAPHS.map((paragraph) => {
          const activeHover =
            step === 'hover' && hoveredId === paragraph.id && (!finePointer || modifierDown)
          const translated = translations[paragraph.id]
          const pending = pendingIds.has(paragraph.id)
          const interactive = step === 'hover'
          const body = (
            <>
              <p className="text-base leading-7 text-zinc-950 dark:text-zinc-50">
                {paragraph.text}
              </p>
              {(translated || pending) && (
                <p
                  className={cn(
                    'mt-2 text-[0.95rem] leading-7',
                    translated
                      ? 'animate-fade-up text-cyan-800 dark:text-cyan-200'
                      : 'text-zinc-500 dark:text-zinc-400',
                  )}
                  dir={targetRtl ? 'rtl' : 'ltr'}
                  role="status"
                >
                  {translated || t('welcome_sample_placeholder')}
                </p>
              )}
            </>
          )
          const surfaceClass = cn(
            'rounded-lg px-1 py-1 text-start transition-colors',
            activeHover && 'bg-cyan-50 dark:bg-cyan-950/40',
            interactive &&
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          )
          return interactive ? (
            <button
              className={surfaceClass}
              key={paragraph.id}
              onBlur={onParagraphLeave}
              onFocus={() => onParagraphEnter(paragraph.id, paragraph.text)}
              onMouseEnter={() => onParagraphEnter(paragraph.id, paragraph.text)}
              onMouseLeave={onParagraphLeave}
              type="button"
            >
              {body}
            </button>
          ) : (
            <div className={surfaceClass} key={paragraph.id}>
              {body}
            </div>
          )
        })}

        {showCompose && (
          <div className="grid gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <label className="text-sm font-medium" htmlFor="welcome-tour-compose">
              {t('welcome_tour_type_title')}
            </label>
            <textarea
              className={cn(
                'min-h-20 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2',
                'text-sm leading-6 text-zinc-950 outline-none',
                'focus-visible:ring-2 focus-visible:ring-blue-500',
                'dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50',
              )}
              disabled={composePending}
              id="welcome-tour-compose"
              onChange={(event) => onComposeChange(event.target.value)}
              onCompositionEnd={() => onComposeComposition(false)}
              onCompositionStart={() => onComposeComposition(true)}
              onKeyDown={onComposeKeyDown}
              placeholder={t('welcome_tour_type_placeholder')}
              value={composeValue}
            />
            <div className="flex items-center gap-2" aria-hidden>
              {[0, 1, 2].map((index) => (
                <span
                  className={cn(
                    'h-1.5 w-6 rounded-full',
                    index < trailingSpaces || composeResult
                      ? 'bg-cyan-600 dark:bg-cyan-300'
                      : 'bg-zinc-200 dark:bg-zinc-800',
                  )}
                  key={index}
                />
              ))}
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {t('welcome_tour_space_meter')}
              </span>
            </div>
          </div>
        )}
      </article>

      {popupOpen && (
        <div className="absolute end-3 top-12 z-10 w-[16.5rem]">
          <div
            className={cn(
              'rounded-lg border border-zinc-200 bg-white p-3',
              'shadow-[0_16px_48px_rgba(15,23,42,0.14)] dark:border-zinc-800 dark:bg-zinc-950',
            )}
            role="dialog"
          >
            <div className="mb-3 flex items-center gap-2">
              <img alt="" className="h-6 w-6 rounded" height={24} src={iconUrl} width={24} />
              <p className="text-sm font-semibold">{t('popup_title')}</p>
            </div>
            <Button
              className="h-10 w-full gap-2 rounded-lg bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950"
              onClick={onTranslatePage}
              type="button"
            >
              <Globe2 className="h-4 w-4" />
              {t('translate_full_page')}
            </Button>
            <Button
              className="mt-2 h-8 w-full rounded-lg"
              onClick={onClosePopup}
              type="button"
              variant="ghost"
            >
              {t('welcome_tour_close_popup')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

const DoneRecap: React.FC = () => {
  const items = [
    { key: 'welcome_next_hover', icon: MousePointer2 },
    { key: 'welcome_next_page', icon: Globe2 },
    { key: 'welcome_tour_done_type', icon: Keyboard },
    { key: 'welcome_next_sidepanel', icon: PanelRightOpen },
    { key: 'welcome_next_file', icon: BookOpen },
  ] as const

  return (
    <ul className="grid gap-3">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <li className="flex items-start gap-3" key={item.key}>
            <span
              className={cn(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <p className="pt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t(item.key)}</p>
          </li>
        )
      })}
    </ul>
  )
}

export { WelcomeTour }
