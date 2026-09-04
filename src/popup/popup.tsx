import '../styles/tailwind.css'
import {
  BookOpen,
  Camera,
  Globe2,
  GraduationCap,
  Keyboard,
  Languages,
  Loader2,
  PanelRightOpen,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ModelDownloadToast } from '@/components/ModelDownloadToast'
import { AiModelGate } from '@/components/ui/ai-model-gate'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { AppSelect } from '@/components/ui/select'
import { isAiReady, useAiCapabilities } from '@/shared/ai/capabilities'
import type { CefrLevel } from '@/shared/ai/types'
import {
  DEFAULT_INPUT_TARGET_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  type LanguageCode,
  SUPPORTED_LANGUAGES,
} from '@/shared/languages'
import {
  MSG_START_REGION_SELECT,
  MSG_TOGGLE_LEARNING_MODE,
  MSG_TRANSLATE_PAGE,
  MSG_UPDATE_HOTKEY,
  MSG_WARM_TRANSLATOR,
} from '@/shared/messages'
import {
  AI_SETTINGS_KEY,
  type AiSettings,
  DEFAULT_AI_SETTINGS,
  POPUP_SETTINGS_KEY,
  SIDE_PANEL_INTENT_KEY,
} from '@/shared/settings'
import { cn } from '@/utils/cn'
import { t } from '@/utils/i18n'
import { getUILocale, isRTLLanguage } from '@/utils/rtl'
import { useChromeLocalStorage } from '@/utils/useChromeLocalStorage'
import { useFirstRunStatus } from '@/utils/useFirstRunStatus'

interface PopupSettings {
  targetLanguage: LanguageCode
  hotkeyModifier?: 'alt' | 'control' | 'shift'
  inputTargetLanguage?: LanguageCode
}

const defaultSettings: PopupSettings = {
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  hotkeyModifier: 'alt',
  inputTargetLanguage: DEFAULT_INPUT_TARGET_LANGUAGE,
}

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((lang) => ({
  value: lang.code,
  label: lang.label,
}))

function extensionIconUrl(): string {
  try {
    return chrome.runtime.getURL('public/icon48.png')
  } catch {
    return 'public/icon48.png'
  }
}

const HOTKEY_OPTIONS: ReadonlyArray<{
  value: NonNullable<PopupSettings['hotkeyModifier']>
  labelKey: 'hotkey_alt' | 'hotkey_control' | 'hotkey_shift'
}> = [
  { value: 'alt', labelKey: 'hotkey_alt' },
  { value: 'control', labelKey: 'hotkey_control' },
  { value: 'shift', labelKey: 'hotkey_shift' },
]

const Popup: React.FC = () => {
  const [settings, setSettings, settingsReady] = useChromeLocalStorage<PopupSettings>(
    POPUP_SETTINGS_KEY,
    defaultSettings,
  )
  const [error, setError] = React.useState<string | null>(null)
  const [isTranslatingPage, setIsTranslatingPage] = React.useState<boolean>(false)
  const [isOpeningSidePanel, setIsOpeningSidePanel] = React.useState<boolean>(false)
  const [firstRunStatus, , setFirstRunStatus] = useFirstRunStatus()
  const [aiSettings, setAiSettings] = useChromeLocalStorage<AiSettings>(
    AI_SETTINGS_KEY,
    DEFAULT_AI_SETTINGS,
  )
  const { capabilities, refresh } = useAiCapabilities()
  const [learningOn, setLearningOn] = React.useState(false)
  const translateBusyRef = React.useRef<boolean>(false)
  const sidePanelBusyRef = React.useRef<boolean>(false)

  const warmActiveTabTranslator = React.useCallback(
    async (payload: { targetLanguage?: LanguageCode; sourceLanguage?: LanguageCode | 'auto' }) => {
      try {
        await setFirstRunStatus({
          status: 'preparing',
          sourceLanguage: payload.sourceLanguage,
          targetLanguage: payload.targetLanguage,
          updatedAt: Date.now(),
        })
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.id) return
        const tabId = tab.id
        const sendWarm = async () => {
          await chrome.tabs.sendMessage(tabId, {
            type: MSG_WARM_TRANSLATOR,
            payload,
          })
        }
        try {
          await sendWarm()
        } catch (error) {
          const url = tab.url ?? ''
          if (!/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['contentScript.js'],
              })
              await sendWarm()
            } catch (_e) {
              // ignore warm failure
            }
          }
        }
      } catch (_err) {
        // ignore
      }
    },
    [setFirstRunStatus],
  )

  React.useEffect(() => {
    // 根据 UI 语言设置方向
    const ui = getUILocale()
    const dir = isRTLLanguage(ui) ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', ui)
  }, [])

  React.useEffect(() => {
    void chrome.action.setBadgeText({ text: '' })
  }, [])

  // Removed global availability check logic

  React.useEffect(() => {
    if (!settingsReady) return
    void warmActiveTabTranslator({ targetLanguage: settings.targetLanguage })
  }, [settings.targetLanguage, settingsReady, warmActiveTabTranslator])

  React.useEffect(() => {
    if (!settingsReady) return
    const inputTarget = settings.inputTargetLanguage ?? DEFAULT_INPUT_TARGET_LANGUAGE
    void warmActiveTabTranslator({ targetLanguage: inputTarget })
  }, [settings.inputTargetLanguage, settingsReady, warmActiveTabTranslator])

  const handleTranslatePage = React.useCallback(async () => {
    if (translateBusyRef.current) return
    setError(null)
    translateBusyRef.current = true
    setIsTranslatingPage(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error(t('active_tab_not_found'))
      const tabId = tab.id
      const send = async () => {
        return chrome.tabs.sendMessage(tabId, {
          type: MSG_TRANSLATE_PAGE,
          payload: {
            targetLanguage: settings.targetLanguage,
          },
        })
      }

      try {
        await send()
      } catch (_err) {
        // 若内容脚本未就绪，则主动注入后重试
        try {
          const url = tab.url ?? ''
          if (/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) {
            throw new Error('This page is not scriptable')
          }
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['contentScript.js'],
          })
          await send()
        } catch (injectionErr) {
          throw injectionErr instanceof Error
            ? injectionErr
            : new Error('Failed to inject content script')
        }
      }
      window.close()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('send_translate_command_failed'))
    } finally {
      translateBusyRef.current = false
      setIsTranslatingPage(false)
    }
  }, [settings.targetLanguage])

  const handleOpenSidePanel = React.useCallback(async () => {
    if (sidePanelBusyRef.current) return
    setError(null)
    sidePanelBusyRef.current = true
    setIsOpeningSidePanel(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error(t('active_tab_not_found'))

      try {
        await chrome.sidePanel.setOptions({
          tabId: tab.id,
          path: 'sidePanel.html',
          enabled: true,
        })
      } catch (_e) {
        /* noop */
      }

      try {
        await chrome.sidePanel.open({ tabId: tab.id })
      } catch (_e) {
        try {
          await chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: false })
          await chrome.sidePanel.open({ tabId: tab.id })
        } catch (err) {
          throw err instanceof Error ? err : new Error('Failed to open side panel')
        }
      }
      window.close()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('unknown_error'))
    } finally {
      sidePanelBusyRef.current = false
      setIsOpeningSidePanel(false)
    }
  }, [])

  const sendToActiveTab = React.useCallback(async (message: unknown) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error(t('active_tab_not_found'))
    try {
      await chrome.tabs.sendMessage(tab.id, message)
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['contentScript.js'],
      })
      await chrome.tabs.sendMessage(tab.id, message)
    }
    return tab
  }, [])

  const openSidePanelWithIntent = React.useCallback(async (kind: 'summary' | 'chat' | 'vocab') => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error(t('active_tab_not_found'))
    await chrome.storage.local.set({
      [SIDE_PANEL_INTENT_KEY]: { kind, tabId: tab.id, createdAt: Date.now() },
    })
    try {
      await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidePanel.html', enabled: true })
    } catch {
      // ignore
    }
    await chrome.sidePanel.open({ tabId: tab.id })
    window.close()
  }, [])

  return (
    <main
      className={cn(
        'box-border w-full min-w-0 bg-[#f5f7f8] p-3 text-sm text-zinc-950',
        'dark:bg-[#111315] dark:text-zinc-100',
      )}
    >
      <div
        className={cn(
          'min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white',
          'shadow-[0_16px_48px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-zinc-950',
          'dark:shadow-[0_16px_48px_rgba(0,0,0,0.35)]',
        )}
      >
        <header className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg"
                height={40}
                src={extensionIconUrl()}
                width={40}
              />
              <div className="min-w-0">
                <h1 className="text-base font-semibold leading-tight">{t('popup_title')}</h1>
                <p
                  className={cn(
                    'mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500',
                    'dark:text-zinc-400',
                  )}
                >
                  {t('extension_description')}
                </p>
              </div>
            </div>
            <div
              role="img"
              aria-label={t('extension_description')}
              className={cn(
                'inline-flex shrink-0 items-center rounded-md p-1.5',
                'bg-emerald-50 text-emerald-700',
                'dark:bg-emerald-950 dark:text-emerald-300',
              )}
              title={t('extension_description')}
            >
              <ShieldCheck className="h-3 w-3" />
            </div>
          </div>
        </header>

        <div className="space-y-3 p-4">
          {!settingsReady ? (
            <div
              className={cn(
                'flex h-40 items-center justify-center gap-2 rounded-lg border border-dashed',
                'border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400',
              )}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('checking')}
            </div>
          ) : (
            <>
              <section className="grid gap-2">
                <Button
                  onClick={handleTranslatePage}
                  disabled={isTranslatingPage}
                  className={cn(
                    'h-11 w-full gap-2 rounded-lg bg-zinc-950 text-white',
                    'hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
                  )}
                >
                  {isTranslatingPage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe2 className="h-4 w-4" />
                  )}
                  {t('translate_full_page')}
                  <Kbd className="ml-auto">Alt+Shift+T</Kbd>
                </Button>

                <Button
                  onClick={handleOpenSidePanel}
                  disabled={isOpeningSidePanel}
                  className={cn(
                    'h-10 w-full gap-2 rounded-lg border-zinc-200 bg-white text-zinc-900',
                    'hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950',
                    'dark:text-zinc-100 dark:hover:bg-zinc-900',
                  )}
                  variant="outline"
                >
                  {isOpeningSidePanel ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                  {t('open_sidepanel')}
                </Button>

                {isAiReady(capabilities) ||
                capabilities.gate === 'downloadable' ||
                capabilities.gate === 'downloading' ||
                capabilities.gate === 'checking' ? (
                  <AiModelGate capabilities={capabilities} onRefresh={refresh} hideWhenUnavailable>
                    <div className="grid gap-2">
                      {aiSettings.features.summary ? (
                        <Button
                          variant="ai"
                          className="h-10 w-full gap-2"
                          onClick={() => void openSidePanelWithIntent('summary')}
                        >
                          <Sparkles className="h-4 w-4" />
                          {t('ai_summary_page')}
                          <Kbd className="ml-auto">Alt+Shift+Y</Kbd>
                        </Button>
                      ) : null}
                      {aiSettings.features.screenshot ? (
                        <Button
                          variant="outline"
                          className="h-10 w-full gap-2"
                          onClick={() => {
                            void sendToActiveTab({ type: MSG_START_REGION_SELECT }).then(() =>
                              window.close(),
                            )
                          }}
                        >
                          <Camera className="h-4 w-4" />
                          {t('ai_screenshot_title')}
                          <Kbd className="ml-auto">Alt+Shift+S</Kbd>
                        </Button>
                      ) : null}
                      {aiSettings.features.learning ? (
                        <Button
                          variant={learningOn ? 'default' : 'outline'}
                          className="h-10 w-full gap-2"
                          onClick={() => {
                            const next = !learningOn
                            setLearningOn(next)
                            void sendToActiveTab({
                              type: MSG_TOGGLE_LEARNING_MODE,
                              payload: { enabled: next },
                            })
                          }}
                        >
                          <GraduationCap className="h-4 w-4" />
                          {learningOn ? t('ai_learning_disable') : t('ai_learning_enable')}
                        </Button>
                      ) : null}
                      {aiSettings.features.learning ? (
                        <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                          <span className="text-xs">{t('ai_learning_level')}</span>
                          <SegmentedControl
                            value={aiSettings.learning.level}
                            onChange={(level: CefrLevel) =>
                              setAiSettings((s) => ({ ...s, learning: { ...s.learning, level } }))
                            }
                            options={[
                              { value: 'A2', label: 'A2' },
                              { value: 'B1', label: 'B1' },
                              { value: 'B2', label: 'B2' },
                              { value: 'C1', label: 'C1' },
                            ]}
                          />
                        </div>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="h-9 w-full gap-2"
                        onClick={() => void openSidePanelWithIntent('vocab')}
                      >
                        <BookOpen className="h-4 w-4" />
                        {t('ai_learning_vocab')}
                      </Button>
                    </div>
                  </AiModelGate>
                ) : capabilities.gate === 'unavailable' ? (
                  <p className="text-[11px] text-zinc-500">{t('ai_gate_unavailable')}</p>
                ) : null}
              </section>

              <section
                className={cn(
                  'divide-y divide-zinc-200 rounded-2xl border border-zinc-200',
                  'dark:divide-zinc-800 dark:border-zinc-800',
                )}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9.75rem)] items-center gap-2 p-3">
                  <Label
                    className={cn(
                      'inline-flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-600',
                      'dark:text-zinc-300',
                    )}
                  >
                    <Languages className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
                    <span className="truncate">{t('target_language')}</span>
                  </Label>
                  <div className="min-w-0">
                    <AppSelect
                      value={settings.targetLanguage}
                      disabled={!settingsReady}
                      onValueChange={(v) => {
                        const next = v as LanguageCode
                        setSettings((s) => ({ ...s, targetLanguage: next }))
                        void warmActiveTabTranslator({ targetLanguage: next })
                      }}
                      options={LANGUAGE_OPTIONS}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9.75rem)] items-center gap-2 p-3">
                  <Label
                    className={cn(
                      'inline-flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-600',
                      'dark:text-zinc-300',
                    )}
                  >
                    <Wand2 className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
                    <span className="truncate">{t('input_target_language')}</span>
                  </Label>
                  <div className="min-w-0">
                    <AppSelect
                      value={settings.inputTargetLanguage ?? DEFAULT_INPUT_TARGET_LANGUAGE}
                      disabled={!settingsReady}
                      onValueChange={(v) => {
                        const next = v as LanguageCode
                        setSettings((s) => ({ ...s, inputTargetLanguage: next }))
                        void warmActiveTabTranslator({ targetLanguage: next })
                      }}
                      options={LANGUAGE_OPTIONS}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9.75rem)] items-center gap-2 p-3">
                  <Label
                    className={cn(
                      'inline-flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-600',
                      'dark:text-zinc-300',
                    )}
                  >
                    <Keyboard className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
                    <span className="truncate">{t('hover_hotkey')}</span>
                  </Label>
                  <div className="min-w-0">
                    <AppSelect
                      value={settings.hotkeyModifier ?? 'alt'}
                      disabled={!settingsReady}
                      onValueChange={async (v) => {
                        const next = v as 'alt' | 'control' | 'shift'
                        setSettings((s) => ({ ...s, hotkeyModifier: next }))
                        try {
                          const [tab] = await chrome.tabs.query({
                            active: true,
                            currentWindow: true,
                          })
                          if (tab?.id) {
                            try {
                              await chrome.tabs.sendMessage(tab.id, {
                                type: MSG_UPDATE_HOTKEY,
                                payload: { hotkeyModifier: next },
                              })
                            } catch (_err) {
                              const url = tab.url ?? ''
                              if (!/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) {
                                try {
                                  await chrome.scripting.executeScript({
                                    target: { tabId: tab.id },
                                    files: ['contentScript.js'],
                                  })
                                  await chrome.tabs.sendMessage(tab.id, {
                                    type: MSG_UPDATE_HOTKEY,
                                    payload: { hotkeyModifier: next },
                                  })
                                } catch (_e) {
                                  /* noop */
                                }
                              }
                            }
                          }
                        } catch (_e) {
                          /* noop */
                        }
                      }}
                      options={HOTKEY_OPTIONS.map((option) => ({
                        value: option.value,
                        label: t(option.labelKey),
                      }))}
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <footer
          className={cn(
            'border-t border-zinc-100 px-4 py-3 text-[10px] leading-4 text-zinc-500',
            'dark:border-zinc-800 dark:text-zinc-400',
          )}
        >
          {t('footer_note')}
        </footer>
      </div>
      <ModelDownloadToast status={firstRunStatus} />
    </main>
  )
}

const container = document.getElementById('root')
const root = ReactDOM.createRoot(container as HTMLElement)
root.render(<Popup />)
