import '../styles/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { t } from '@/utils/i18n';
import { getUILocale, isRTLLanguage } from '@/utils/rtl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppSelect } from '@/components/ui/select';

// Removed global availability check types and UI; popup page context cannot reliably query Translator availability

type LanguageCode =
  | 'en'
  | 'zh-CN'
  | 'zh-TW'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'
  | 'it'
  | 'pt'
  | 'ru'
  | 'ar'
  | 'hi'
  | 'bn'
  | 'id'
  | 'tr'
  | 'vi'
  | 'th'
  | 'nl'
  | 'pl'
  | 'fa'
  | 'ur'
  | 'uk'
  | 'sv'
  | 'fil';

// Removed Translator typing in popup; translation runs in content script

const SUPPORTED_LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'fa', label: 'فارسی' },
  { code: 'ur', label: 'اردو' },
  { code: 'uk', label: 'Українська' },
  { code: 'sv', label: 'Svenska' },
  { code: 'fil', label: 'Filipino' },
];

const STORAGE_KEY = 'nativeTranslate.settings';

interface PopupSettings {
  targetLanguage: LanguageCode;
  hotkeyModifier?: 'alt' | 'control' | 'shift';
  inputTargetLanguage?: LanguageCode;
}

const defaultSettings: PopupSettings = {
  targetLanguage: 'zh-CN',
  hotkeyModifier: 'alt',
  inputTargetLanguage: 'en',
};

const Popup: React.FC = () => {
  const [settings, setSettings] = React.useState<PopupSettings>(defaultSettings);
  // Removed global availability state
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // 根据 UI 语言设置方向
    const ui = getUILocale();
    const dir = isRTLLanguage(ui) ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', ui);

    chrome.storage.local.get(STORAGE_KEY, (res) => {
      const saved = (res?.[STORAGE_KEY] as PopupSettings | undefined) ?? defaultSettings;
      setSettings(saved);
    });
  }, []);

  React.useEffect(() => {
    chrome.storage.local.set({ [STORAGE_KEY]: settings });
  }, [settings]);

  // Removed global availability check logic

  const handleTranslatePage = React.useCallback(async () => {
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error(t('active_tab_not_found'));
      const send = async () => {
        return chrome.tabs.sendMessage(tab.id!, {
          type: 'NATIVE_TRANSLATE_TRANSLATE_PAGE',
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
          throw injectionErr instanceof Error ? injectionErr : new Error('Failed to inject content script');
        }
      }
      window.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('send_translate_command_failed'));
    }
  }, [settings.targetLanguage]);

  // Removed availability badge UI

  return (
    <div className="p-4 space-y-4 text-sm text-gray-900 dark:text-gray-100">
      <h1 className="text-lg font-semibold">{t('popup_title')}</h1>

      {/* Removed global availability section */}

      <div className="space-y-2">
        <Label className="inline-block">{t('target_language')}</Label>
        <AppSelect
          value={settings.targetLanguage}
          onValueChange={(v) => setSettings((s) => ({ ...s, targetLanguage: v as LanguageCode }))}
          options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        />
      </div>

      <div className="space-y-2">
        <Label className="inline-block">{t('input_target_language')}</Label>
        <AppSelect
          value={settings.inputTargetLanguage ?? 'en'}
          onValueChange={(v) => setSettings((s) => ({ ...s, inputTargetLanguage: v as LanguageCode }))}
          options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        />
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('input_target_language_desc')}</p>
      </div>

      <div className="space-y-2">
        <Label className="inline-block">{t('hover_hotkey')}</Label>
        <AppSelect
          value={settings.hotkeyModifier ?? 'alt'}
          onValueChange={async (v) => {
            const next = v as 'alt' | 'control' | 'shift';
            setSettings((s) => ({ ...s, hotkeyModifier: next }));
            try {
              const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
              if (tab?.id) {
                try {
                  await chrome.tabs.sendMessage(tab.id, {
                    type: 'NATIVE_TRANSLATE_UPDATE_HOTKEY',
                    payload: { hotkeyModifier: next },
                  });
                } catch (_err) {
                  // 若内容脚本未注入，尝试注入后重发
                  const url = tab.url ?? '';
                  if (!/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) {
                    try {
                      await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['contentScript.js'],
                      });
                      await chrome.tabs.sendMessage(tab.id, {
                        type: 'NATIVE_TRANSLATE_UPDATE_HOTKEY',
                        payload: { hotkeyModifier: next },
                      });
                    } catch (_e) { }
                  }
                }
              }
            } catch (_e) { }
          }}
          options={[
            { value: 'alt', label: t('hotkey_alt') },
            { value: 'control', label: t('hotkey_control') },
            { value: 'shift', label: t('hotkey_shift') },
          ]}
        />
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('hover_hotkey_desc')}</p>
      </div>

      <div className="space-y-2">
        <Button onClick={handleTranslatePage} className="w-full">
          {t('translate_full_page')}
        </Button>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('translate_full_page_desc')}</p>
      </div>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
      )}

      <footer className="pt-2 border-t border-gray-200 dark:border-neutral-800 text-[11px] text-gray-500 dark:text-gray-400">
        {t('footer_note')}
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container as HTMLElement);
root.render(<Popup />);


