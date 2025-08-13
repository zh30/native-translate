import '../styles/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { t } from '@/utils/i18n';
import { getUILocale, isRTLLanguage } from '@/utils/rtl';

type AvailabilityState = 'unknown' | 'available' | 'downloadable' | 'unavailable';

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

interface TranslatorDownloadProgressEvent extends Event {
  // 0..1
  loaded?: number;
}

interface TranslatorMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (e: TranslatorDownloadProgressEvent) => void
  ) => void;
}

interface TranslatorInstance {
  translate: (text: string) => Promise<string>;
  // Non-standard in specs preview, but referenced in docs for readiness after download
  ready?: Promise<void>;
}

interface TranslatorCreateOptions {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  monitor?: (m: TranslatorMonitor) => void;
}

interface TranslatorStatic {
  availability: (
    opts?: { sourceLanguage?: LanguageCode; targetLanguage?: LanguageCode }
  ) => Promise<AvailabilityState>;
  create: (opts: TranslatorCreateOptions) => Promise<TranslatorInstance>;
}

declare global {
  interface Window {
    Translator?: TranslatorStatic;
  }
}

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
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}

const defaultSettings: PopupSettings = {
  sourceLanguage: 'en',
  targetLanguage: 'zh-CN',
};

const Popup: React.FC = () => {
  const [settings, setSettings] = React.useState<PopupSettings>(defaultSettings);
  const [availabilityGlobal, setAvailabilityGlobal] = React.useState<AvailabilityState>('unknown');
  const [availabilityPair, setAvailabilityPair] = React.useState<AvailabilityState>('unknown');
  const [isChecking, setIsChecking] = React.useState<boolean>(false);
  const [isCreating, setIsCreating] = React.useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = React.useState<number>(0);
  const [translatorReady, setTranslatorReady] = React.useState<boolean>(false);
  const translatorRef = React.useRef<TranslatorInstance | null>(null);
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

  const checkAvailability = React.useCallback(async () => {
    setError(null);
    setIsChecking(true);
    try {
      const api = window.Translator;
      if (!api) {
        setAvailabilityGlobal('unavailable');
        setAvailabilityPair('unavailable');
        return;
      }
      let global: AvailabilityState;
      try {
        // 有些实现要求至少 1 个参数，这里传空对象以兼容
        global = await (api as any).availability({});
      } catch (_e) {
        // 回退到使用当前语言对检测，避免零参报错
        global = await api.availability({
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: settings.targetLanguage,
        });
      }
      setAvailabilityGlobal(global);
      const pair = await api.availability({
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
      });
      setAvailabilityPair(pair);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('unknown_error'));
      setAvailabilityGlobal('unavailable');
      setAvailabilityPair('unavailable');
    } finally {
      setIsChecking(false);
    }
  }, [settings.sourceLanguage, settings.targetLanguage]);

  React.useEffect(() => {
    // Auto-check once on mount
    void checkAvailability();
  }, [checkAvailability]);

  const createTranslator = React.useCallback(async () => {
    setError(null);
    setIsCreating(true);
    setDownloadProgress(0);
    setTranslatorReady(false);
    try {
      const api = window.Translator;
      if (!api) throw new Error(t('translator_unavailable'));
      const translator = await api.create({
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            const loaded = typeof e.loaded === 'number' ? e.loaded : 0;
            setDownloadProgress(Math.round(loaded * 100));
          });
        },
      });
      translatorRef.current = translator;
      if (translator.ready) {
        await translator.ready;
      }
      // 标记该语言对已就绪，便于内容脚本复用
      try {
        const key = `${settings.sourceLanguage}->${settings.targetLanguage}`;
        const ns: 'session' | 'local' = (chrome.storage as any).session ? 'session' : 'local';
        const data = await chrome.storage[ns].get('nativeTranslate:readyPairs');
        const map = (data?.['nativeTranslate:readyPairs'] as Record<string, number> | undefined) ?? {};
        map[key] = Date.now();
        await chrome.storage[ns].set({ 'nativeTranslate:readyPairs': map });
      } catch (_e) { }
      setTranslatorReady(true);
      // 更新可用性
      await checkAvailability();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('create_translator_failed'));
      setTranslatorReady(false);
    } finally {
      setIsCreating(false);
    }
  }, [settings.sourceLanguage, settings.targetLanguage, checkAvailability]);

  const handleTranslatePage = React.useCallback(async () => {
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error(t('active_tab_not_found'));
      await chrome.tabs.sendMessage(tab.id, {
        type: 'NATIVE_TRANSLATE_TRANSLATE_PAGE',
        payload: {
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: settings.targetLanguage,
        },
      });
      window.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('send_translate_command_failed'));
    }
  }, [settings.sourceLanguage, settings.targetLanguage]);

  const availabilityBadge = (state: AvailabilityState) => {
    const map: Record<AvailabilityState, { text: string; cls: string }> = {
      unknown: { text: t('availability_unknown'), cls: 'bg-gray-200 text-gray-700' },
      available: { text: t('availability_available'), cls: 'bg-green-100 text-green-700' },
      downloadable: { text: t('availability_downloadable'), cls: 'bg-yellow-100 text-yellow-800' },
      unavailable: { text: t('availability_unavailable'), cls: 'bg-red-100 text-red-700' },
    };
    const v = map[state];
    return <span className={`px-2 py-0.5 rounded text-xs ${v.cls}`}>{v.text}</span>;
  };

  return (
    <div className="p-4 space-y-4 text-sm text-gray-900">
      <h1 className="text-lg font-semibold">{t('popup_title')}</h1>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">{t('global_availability')}</span>
          {availabilityBadge(availabilityGlobal)}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">{t('pair_availability')}</span>
          {availabilityBadge(availabilityPair)}
        </div>
        <button
          onClick={checkAvailability}
          disabled={isChecking}
          className="w-full inline-flex items-center justify-center rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60"
        >
          {isChecking ? t('checking') : t('recheck_availability')}
        </button>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-gray-600">{t('source_language')}</label>
        <select
          className="w-full rounded border border-gray-300 bg-white p-2"
          value={settings.sourceLanguage}
          onChange={(e) => setSettings((s) => ({ ...s, sourceLanguage: e.target.value as LanguageCode }))}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>

        <label className="block text-xs text-gray-600 mt-2">{t('target_language')}</label>
        <select
          className="w-full rounded border border-gray-300 bg-white p-2"
          value={settings.targetLanguage}
          onChange={(e) => setSettings((s) => ({ ...s, targetLanguage: e.target.value as LanguageCode }))}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <button
          onClick={createTranslator}
          disabled={isCreating}
          className="w-full inline-flex items-center justify-center rounded bg-black text-white px-3 py-2 hover:bg-gray-800 disabled:opacity-60"
        >
          {isCreating ? t('preparing_translator') : t('create_prepare_translator')}
        </button>
        {(isCreating || downloadProgress > 0) && (
          <div className="w-full">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>{t('download_progress')}</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded mt-1">
              <div className="h-2 bg-blue-600 rounded" style={{ width: `${downloadProgress}%` }} />
            </div>
          </div>
        )}
        {translatorReady && (
          <div className="text-xs text-green-700">{t('translator_ready')}</div>
        )}
      </div>

      <div className="space-y-2">
        <button
          onClick={handleTranslatePage}
          disabled={!translatorReady}
          className="w-full inline-flex items-center justify-center rounded bg-blue-600 text-white px-3 py-2 hover:bg-blue-700 disabled:opacity-60"
        >
          {t('translate_full_page')}
        </button>
        <p className="text-[11px] text-gray-500">{t('translate_full_page_desc')}</p>
      </div>

      {error && (
        <div className="text-xs text-red-600">{error}</div>
      )}

      <footer className="pt-2 border-t border-gray-200 text-[11px] text-gray-500">
        {t('footer_note')}
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container as HTMLElement);
root.render(<Popup />);
