import '../styles/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { t } from '@/utils/i18n';
import { getUILocale, isRTLLanguage } from '@/utils/rtl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppSelect } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { useChromeLocalStorage } from '@/utils/useChromeLocalStorage';
import { cn } from '@/utils/cn';
import { Globe2, Keyboard, Languages, Loader2, PanelRightOpen, Wand2 } from 'lucide-react';
import {
  LanguageCode,
  SUPPORTED_LANGUAGES,
  DEFAULT_TARGET_LANGUAGE,
  DEFAULT_INPUT_TARGET_LANGUAGE,
} from '@/shared/languages';
import { POPUP_SETTINGS_KEY } from '@/shared/settings';
import { MSG_TRANSLATE_PAGE, MSG_UPDATE_HOTKEY, MSG_WARM_TRANSLATOR } from '@/shared/messages';

interface PopupSettings {
  targetLanguage: LanguageCode;
  hotkeyModifier?: 'alt' | 'control' | 'shift';
  inputTargetLanguage?: LanguageCode;
}

const defaultSettings: PopupSettings = {
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  hotkeyModifier: 'alt',
  inputTargetLanguage: DEFAULT_INPUT_TARGET_LANGUAGE,
};

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((lang) => ({
  value: lang.code,
  label: lang.label,
}));

const HOTKEY_OPTIONS: ReadonlyArray<{
  value: NonNullable<PopupSettings['hotkeyModifier']>;
  labelKey: 'hotkey_alt' | 'hotkey_control' | 'hotkey_shift';
}> = [
  { value: 'alt', labelKey: 'hotkey_alt' },
  { value: 'control', labelKey: 'hotkey_control' },
  { value: 'shift', labelKey: 'hotkey_shift' },
];

const Popup: React.FC = () => {
  const [settings, setSettings, settingsReady] = useChromeLocalStorage<PopupSettings>(
    POPUP_SETTINGS_KEY,
    defaultSettings
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isTranslatingPage, setIsTranslatingPage] = React.useState<boolean>(false);
  const [isOpeningSidePanel, setIsOpeningSidePanel] = React.useState<boolean>(false);
  const translateBusyRef = React.useRef<boolean>(false);
  const sidePanelBusyRef = React.useRef<boolean>(false);

  const warmActiveTabTranslator = React.useCallback(
    async (payload: { targetLanguage?: LanguageCode; sourceLanguage?: LanguageCode | 'auto' }) => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        const sendWarm = async () => {
          await chrome.tabs.sendMessage(tab.id!, {
            type: MSG_WARM_TRANSLATOR,
            payload,
          });
        };
        try {
          await sendWarm();
        } catch (error) {
          const url = tab.url ?? '';
          if (!/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['contentScript.js'],
              });
              await sendWarm();
            } catch (_e) {
              // ignore warm failure
            }
          }
        }
      } catch (_err) {
        // ignore
      }
    },
    []
  );

  React.useEffect(() => {
    // 根据 UI 语言设置方向
    const ui = getUILocale();
    const dir = isRTLLanguage(ui) ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', ui);

  }, []);

  // Removed global availability check logic

  React.useEffect(() => {
    if (!settingsReady) return;
    void warmActiveTabTranslator({ targetLanguage: settings.targetLanguage });
  }, [settings.targetLanguage, settingsReady, warmActiveTabTranslator]);

  React.useEffect(() => {
    if (!settingsReady) return;
    const inputTarget = settings.inputTargetLanguage ?? DEFAULT_INPUT_TARGET_LANGUAGE;
    void warmActiveTabTranslator({ targetLanguage: inputTarget });
  }, [settings.inputTargetLanguage, settingsReady, warmActiveTabTranslator]);

  const handleTranslatePage = React.useCallback(async () => {
    if (translateBusyRef.current) return;
    setError(null);
    translateBusyRef.current = true;
    setIsTranslatingPage(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error(t('active_tab_not_found'));
      const send = async () => {
        return chrome.tabs.sendMessage(tab.id!, {
          type: MSG_TRANSLATE_PAGE,
          payload: {
            targetLanguage: settings.targetLanguage,
          },
        });
      };

      try {
        await send();
      } catch (_err) {
        // 若内容脚本未就绪，则主动注入后重试
        try {
          const url = tab.url ?? '';
          if (/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) {
            throw new Error('This page is not scriptable');
          }
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['contentScript.js'],
          });
          await send();
        } catch (injectionErr) {
          throw injectionErr instanceof Error
            ? injectionErr
            : new Error('Failed to inject content script');
        }
      }
      window.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('send_translate_command_failed'));
    } finally {
      translateBusyRef.current = false;
      setIsTranslatingPage(false);
    }
  }, [settings.targetLanguage]);

  const handleOpenSidePanel = React.useCallback(async () => {
    if (sidePanelBusyRef.current) return;
    setError(null);
    sidePanelBusyRef.current = true;
    setIsOpeningSidePanel(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error(t('active_tab_not_found'));

      try {
        await chrome.sidePanel.setOptions({
          tabId: tab.id,
          path: 'sidePanel.html',
          enabled: true,
        });
      } catch (_e) { /* noop */ }

      try {
        await chrome.sidePanel.open({ tabId: tab.id } as any);
      } catch (_e) {
        try {
          await chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: false } as any);
          await chrome.sidePanel.open({ tabId: tab.id } as any);
        } catch (err) {
          throw err instanceof Error
            ? err
            : new Error('Failed to open side panel');
        }
      }
      window.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('unknown_error'));
    } finally {
      sidePanelBusyRef.current = false;
      setIsOpeningSidePanel(false);
    }
  }, []);

  return (
    <div
      className={cn(
        'min-w-[320px] max-w-[360px] space-y-4 p-4 text-sm text-gray-900',
        'dark:text-gray-100'
      )}
    >
      <header className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full',
            'bg-blue-500/10 text-blue-500 dark:bg-blue-400/10 dark:text-blue-300'
          )}
        >
          <Globe2 className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold leading-tight">{t('popup_title')}</h1>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {t('translate_full_page_desc')}
          </p>
        </div>
      </header>

      {!settingsReady ? (
        <Card className="border-dashed">
          <CardContent
            className={cn(
              'flex items-center justify-center gap-2 py-6',
              'text-gray-500 dark:text-gray-400'
            )}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('checking')}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card
            className={cn(
              'border-gray-200/80 bg-white/70',
              'dark:border-neutral-800/80 dark:bg-neutral-950/70'
            )}
          >
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <Label
                  className={cn(
                    'inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide',
                    'text-gray-500 dark:text-gray-400'
                  )}
                >
                  <Languages className="h-4 w-4" />
                  {t('target_language')}
                </Label>
                <AppSelect
                  value={settings.targetLanguage}
                  disabled={!settingsReady}
                  onValueChange={(v) => {
                    const next = v as LanguageCode;
                    setSettings((s) => ({ ...s, targetLanguage: next }));
                    void warmActiveTabTranslator({ targetLanguage: next });
                  }}
                  options={LANGUAGE_OPTIONS}
                />
              </div>

              <div className="space-y-2">
                <Label
                  className={cn(
                    'inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide',
                    'text-gray-500 dark:text-gray-400'
                  )}
                >
                  <Wand2 className="h-4 w-4" />
                  {t('input_target_language')}
                </Label>
                <AppSelect
                  value={settings.inputTargetLanguage ?? DEFAULT_INPUT_TARGET_LANGUAGE}
                  disabled={!settingsReady}
                  onValueChange={(v) => {
                    const next = v as LanguageCode;
                    setSettings((s) => ({ ...s, inputTargetLanguage: next }));
                    void warmActiveTabTranslator({ targetLanguage: next });
                  }}
                  options={LANGUAGE_OPTIONS}
                />
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {t('input_target_language_desc')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              'border-gray-200/80 bg-white/70',
              'dark:border-neutral-800/80 dark:bg-neutral-950/70'
            )}
          >
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <Label
                  className={cn(
                    'inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide',
                    'text-gray-500 dark:text-gray-400'
                  )}
                >
                  <Keyboard className="h-4 w-4" />
                  {t('hover_hotkey')}
                </Label>
                <AppSelect
                  value={settings.hotkeyModifier ?? 'alt'}
                  disabled={!settingsReady}
                  onValueChange={async (v) => {
                    const next = v as 'alt' | 'control' | 'shift';
                    setSettings((s) => ({ ...s, hotkeyModifier: next }));
                    try {
                      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                      if (tab?.id) {
                        try {
                          await chrome.tabs.sendMessage(tab.id, {
                            type: MSG_UPDATE_HOTKEY,
                            payload: { hotkeyModifier: next },
                          });
                        } catch (_err) {
                          const url = tab.url ?? '';
                          if (!/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) {
                            try {
                              await chrome.scripting.executeScript({
                                target: { tabId: tab.id },
                                files: ['contentScript.js'],
                              });
                              await chrome.tabs.sendMessage(tab.id, {
                                type: MSG_UPDATE_HOTKEY,
                                payload: { hotkeyModifier: next },
                              });
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
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {t('hover_hotkey_desc')}
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleTranslatePage}
                  disabled={isTranslatingPage}
                  className="w-full inline-flex items-center gap-2"
                >
                  {isTranslatingPage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe2 className="h-4 w-4" />
                  )}
                  {t('translate_full_page')}
                </Button>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {t('translate_full_page_desc')}
                </p>
              </div>

              <Button
                onClick={handleOpenSidePanel}
                disabled={isOpeningSidePanel}
                className="w-full inline-flex items-center gap-2"
                variant="outline"
              >
                {isOpeningSidePanel ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
                {t('open_sidepanel')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {error && (
        <Alert variant="destructive" role="status" aria-live="polite">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <footer
        className={cn(
          'border-t border-gray-200 pt-2 text-[11px] text-gray-500',
          'dark:border-neutral-800 dark:text-gray-400'
        )}
      >
        {t('footer_note')}
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container as HTMLElement);
root.render(<Popup />);
