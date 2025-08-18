import '../styles/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { t } from '@/utils/i18n';
import { getUILocale, isRTLLanguage } from '@/utils/rtl';
import { AppSelect } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { debounce } from 'radash';
import { ArrowLeftRight, Languages, Type, Sparkles } from 'lucide-react';

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

type LanguageOption = LanguageCode | 'auto';

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

// ============ Local built-in AI APIs (optional, best-effort) ============
interface TranslatorInstance {
  ready?: Promise<void>;
  translate: (text: string) => Promise<string>;
}

interface TranslatorStaticLegacy {
  create: (opts: { sourceLanguage: LanguageCode; targetLanguage: LanguageCode; monitor?: (m: unknown) => void }) => Promise<TranslatorInstance> | TranslatorInstance;
}

interface TranslatorStaticModern {
  createTranslator: (opts: { sourceLanguage: LanguageCode; targetLanguage: LanguageCode; monitor?: (m: unknown) => void }) => Promise<TranslatorInstance> | TranslatorInstance;
}

interface LanguageDetectorInstance {
  detect: (text: string) => Promise<Array<{ detectedLanguage: LanguageCode; confidence: number }>>;
}

interface LanguageDetectorStatic {
  create: (opts?: { monitor?: (m: unknown) => void }) => Promise<LanguageDetectorInstance> | LanguageDetectorInstance;
}

async function resolveLocalTranslatorAdapter(): Promise<
  | { kind: 'legacy'; api: TranslatorStaticLegacy }
  | { kind: 'modern'; api: TranslatorStaticModern }
  | null
> {
  const w = window as unknown as Record<string, unknown>;
  const legacy = (w as any).Translator as TranslatorStaticLegacy | undefined;
  if (legacy && typeof legacy.create === 'function') {
    return { kind: 'legacy', api: legacy };
  }
  const modern = (w as any).translation as TranslatorStaticModern | undefined;
  if (modern && typeof (modern as any).createTranslator === 'function') {
    return { kind: 'modern', api: modern };
  }
  return null;
}

async function getOrCreateLocalTranslator(source: LanguageCode, target: LanguageCode): Promise<TranslatorInstance> {
  const key = `__nt_sp_translator_${source}_${target}`;
  const anyWin = window as any;
  if (anyWin[key]) return anyWin[key] as TranslatorInstance;
  const adapter = await resolveLocalTranslatorAdapter();
  if (!adapter) throw new Error('Translator API unavailable');
  let instance: TranslatorInstance;
  if (adapter.kind === 'legacy') {
    instance = await adapter.api.create({ sourceLanguage: source, targetLanguage: target });
  } else {
    instance = await (adapter.api as TranslatorStaticModern).createTranslator({ sourceLanguage: source, targetLanguage: target });
  }
  if (instance && instance.ready) {
    try { await instance.ready; } catch { }
  }
  anyWin[key] = instance;
  return instance;
}

async function getOrCreateLocalDetector(): Promise<LanguageDetectorInstance> {
  const cacheKey = '__nt_sp_detector';
  const anyWin = window as any;
  if (anyWin[cacheKey]) return anyWin[cacheKey] as LanguageDetectorInstance;
  const detectorApi = (anyWin.LanguageDetector as LanguageDetectorStatic | undefined);
  if (!detectorApi || typeof detectorApi.create !== 'function') throw new Error('Language Detector API unavailable');
  const det = await detectorApi.create();
  anyWin[cacheKey] = det;
  return det;
}

async function detectLanguageLocal(text: string): Promise<LanguageCode | null> {
  try {
    const det = await getOrCreateLocalDetector();
    const res = await det.detect(text.slice(0, 2000));
    return res?.[0]?.detectedLanguage ?? null;
  } catch {
    return null;
  }
}

const SidePanel: React.FC = () => {
  const [sourceLanguage, setSourceLanguage] = React.useState<LanguageOption>('auto');
  const [targetLanguage, setTargetLanguage] = React.useState<LanguageCode>('zh-CN');
  const [inputText, setInputText] = React.useState<string>('');
  const [outputText, setOutputText] = React.useState<string>('');
  const [detectedSource, setDetectedSource] = React.useState<LanguageCode | null>(null);
  const [isTranslating, setIsTranslating] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const activeTabIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const ui = getUILocale();
    const dir = isRTLLanguage(ui) ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', ui);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTabIdRef.current = tab?.id ?? null;
      } catch (_e) {
        activeTabIdRef.current = null;
      }
    })();
  }, []);

  const pingOnce = React.useCallback(async (tabId: number): Promise<boolean> => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: '__PING__' });
      return Boolean(res && (res as any).ok);
    } catch (_e) {
      return false;
    }
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const ensureContentScript = React.useCallback(async () => {
    const tabId = activeTabIdRef.current;
    if (!tabId) return;
    const ok = await pingOnce(tabId);
    if (ok) return;
    try {
      const tab = (await chrome.tabs.get(tabId)) as chrome.tabs.Tab;
      const url = tab.url ?? '';
      if (/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) return;
      await chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] });
      await sleep(50);
      await pingOnce(tabId);
    } catch (_err) { }
  }, []);

  const translate = React.useCallback(async () => {
    const tabId = activeTabIdRef.current;
    if (!tabId || !inputText.trim()) {
      setOutputText('');
      setDetectedSource(null);
      return;
    }
    setError(null);
    setIsTranslating(true);
    try {
      // 1) 尝试本地直译（若内置 API 在侧边栏可用）
      let localSucceeded = false;
      try {
        const src: LanguageCode = sourceLanguage === 'auto'
          ? (await detectLanguageLocal(inputText)) || 'en'
          : (sourceLanguage as LanguageCode);
        if (src && targetLanguage && src !== targetLanguage) {
          const translator = await getOrCreateLocalTranslator(src, targetLanguage);
          const out = await translator.translate(inputText);
          setOutputText(out);
          setDetectedSource(sourceLanguage === 'auto' ? src : null);
          localSucceeded = true;
        } else {
          // 同语种，无需翻译
          setOutputText(inputText);
          setDetectedSource(sourceLanguage === 'auto' ? src : null);
          localSucceeded = true;
        }
      } catch {
        localSucceeded = false;
      }

      if (!localSucceeded) {
        // 2) 回退到内容脚本（页面主世界桥或直接使用内容脚本的内置 API）
        const sendTranslate = async () => {
          const res = await chrome.tabs.sendMessage(tabId, {
            type: 'NATIVE_TRANSLATE_TRANSLATE_TEXT',
            payload: {
              text: inputText,
              sourceLanguage,
              targetLanguage,
            },
          });
          return res as any;
        };

        await ensureContentScript();
        let res: any;
        try {
          res = await sendTranslate();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/Receiving end does not exist|Could not establish connection/i.test(msg)) {
            await ensureContentScript();
            await sleep(50);
            res = await sendTranslate();
          } else {
            throw err;
          }
        }
        if (res && res.ok) {
          setOutputText(res.result as string);
          setDetectedSource((res.detectedSource as LanguageCode | undefined) ?? null);
        } else {
          throw new Error((res && res.error) || t('send_translate_command_failed'));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('unknown_error'));
    } finally {
      setIsTranslating(false);
    }
  }, [inputText, sourceLanguage, targetLanguage, ensureContentScript]);

  const debouncedTranslateRef = React.useRef<(((arg?: unknown) => void) & { cancel?: () => void }) | null>(null);
  React.useEffect(() => {
    const fn = debounce({ delay: 500 }, (_?: unknown) => { void translate(); }) as unknown as
      ((arg?: unknown) => void) & { cancel?: () => void };
    debouncedTranslateRef.current = fn;
    return () => {
      fn.cancel?.();
    };
  }, [translate]);

  React.useEffect(() => {
    debouncedTranslateRef.current?.('input');
  }, [inputText]);

  React.useEffect(() => {
    // 语言切换时立即翻译，确保目标语言与检测一致
    void translate();
  }, [sourceLanguage, targetLanguage]);

  return (
    <div className="p-4 h-screen box-border text-sm text-gray-900 dark:text-gray-100">
      <div className="grid h-full gap-4 grid-rows-[1fr_1fr] min-[520px]:grid-rows-1 min-[520px]:grid-cols-2">
        <div className="flex h-full min-h-0 flex-col gap-2">
          <Label className="inline-flex items-center gap-1">
            <Languages className="h-4 w-4" />
            {t('source_language')}
          </Label>
          <AppSelect
            value={sourceLanguage}
            onValueChange={(v) => setSourceLanguage((v as LanguageOption) || 'auto')}
            options={[{ value: 'auto', label: t('auto_detect') }, ...SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))]}
          />
          <Textarea
            className="flex-1 min-h-0 resize-none"
            placeholder={t('sidepanel_input_placeholder')}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>
        <div className="flex h-full min-h-0 flex-col gap-2">
          <Label className="inline-flex items-center gap-1">
            <ArrowLeftRight className="h-4 w-4" />
            {t('target_language')}
          </Label>
          <AppSelect
            value={targetLanguage}
            onValueChange={(v) => setTargetLanguage(v as LanguageCode)}
            options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          />
          <Textarea
            className="flex-1 min-h-0 resize-none"
            placeholder={t('sidepanel_output_placeholder')}
            value={outputText}
            readOnly
          />
          {detectedSource && sourceLanguage === 'auto' && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
              <Type className="h-3.5 w-3.5" />
              {t('source_language')}: {detectedSource}
            </div>
          )}
          {isTranslating && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {t('preparing_translator')}
            </div>
          )}
          {error && (
            <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container as HTMLElement);
root.render(<SidePanel />);