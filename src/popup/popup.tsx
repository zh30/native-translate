import '../styles/tailwind.css'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AppSelect } from '@/components/ui/select'
import {
  DEFAULT_INPUT_TARGET_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  type LanguageCode,
  SUPPORTED_LANGUAGES,
} from '@/shared/languages'
import { MSG_TRANSLATE_PAGE, MSG_UPDATE_HOTKEY, MSG_WARM_TRANSLATOR } from '@/shared/messages'
import { POPUP_SETTINGS_KEY } from '@/shared/settings'
import { cn } from '@/utils/cn'
import { t } from '@/utils/i18n'
import { getUILocale, isRTLLanguage } from '@/utils/rtl'
import { useChromeLocalStorage } from '@/utils/useChromeLocalStorage'
import {
  Globe2,
  Keyboard,
  Languages,
  Loader2,
  PanelRightOpen,
  ShieldCheck,
  Wand2,
} from 'lucide-react'
import React from 'react'
import ReactDOM from 'react-dom/client'

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
  const translateBusyRef = React.useRef<boolean>(false)
  const sidePanelBusyRef = React.useRef<boolean>(false)

  const warmActiveTabTranslator = React.useCallback(
    async (payload: { targetLanguage?: LanguageCode; sourceLanguage?: LanguageCode | 'auto' }) => {
      try {
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
    [],
  )

  React.useEffect(() => {
    // 根据 UI 语言设置方向
    const ui = getUILocale()
    const dir = isRTLLanguage(ui) ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', ui)
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

  return (
    <main
      className={cn(
        'w-[360px] bg-[#f5f7f8] p-3 text-sm text-zinc-950',
        'dark:bg-[#111315] dark:text-zinc-100',
      )}
    >
      <div
        className={cn(
          'rounded-lg border border-zinc-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.14)]',
          'dark:border-zinc-800 dark:bg-zinc-950',
        )}
      >
        <header className="border-b border-zinc-100 p-4 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg',
                  'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
                )}
              >
                <Globe2 className="h-5 w-5" />
              </div>
              <div>
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
              </section>

              <section
                className={cn(
                  'divide-y divide-zinc-100 rounded-lg border border-zinc-200',
                  'dark:divide-zinc-800 dark:border-zinc-800',
                )}
              >
                <div className="grid grid-cols-[1fr_156px] items-center gap-3 p-3">
                  <Label
                    className={cn(
                      'inline-flex items-center gap-2 text-xs font-medium text-zinc-600',
                      'dark:text-zinc-300',
                    )}
                  >
                    <Languages className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                    {t('target_language')}
                  </Label>
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

                <div className="grid grid-cols-[1fr_156px] items-center gap-3 p-3">
                  <Label
                    className={cn(
                      'inline-flex items-center gap-2 text-xs font-medium text-zinc-600',
                      'dark:text-zinc-300',
                    )}
                  >
                    <Wand2 className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                    {t('input_target_language')}
                  </Label>
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

                <div className="grid grid-cols-[1fr_156px] items-center gap-3 p-3">
                  <Label
                    className={cn(
                      'inline-flex items-center gap-2 text-xs font-medium text-zinc-600',
                      'dark:text-zinc-300',
                    )}
                  >
                    <Keyboard className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                    {t('hover_hotkey')}
                  </Label>
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
    </main>
  )
}

const container = document.getElementById('root')
const root = ReactDOM.createRoot(container as HTMLElement)
root.render(<Popup />)
