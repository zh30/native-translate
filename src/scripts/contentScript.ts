import {
  DEFAULT_INPUT_TARGET_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
} from '@/shared/languages';
import {
  MSG_TRANSLATE_PAGE,
  MSG_TRANSLATE_TEXT,
  MSG_UPDATE_HOTKEY,
  MSG_WARM_TRANSLATOR,
} from '@/shared/messages';
import { POPUP_SETTINGS_KEY } from '@/shared/settings';
import {
  STREAMING_LENGTH_THRESHOLD,
  type TranslatorInstance,
  normalizeToAsyncStringIterable,
} from '@/shared/streaming';

function tCS(key: string, substitutions?: Array<string | number>): string {
  try {
    const value = chrome?.i18n?.getMessage?.(
      key,
      (substitutions ?? []) as unknown as string | string[]
    );
    return value || key;
  } catch (_e) {
    return key;
  }
}

// 语言代码：使用通用 BCP-47 字符串，兼容检测结果与翻译器要求
type LanguageCode = string;



type InlineHintElement = HTMLElement & {
  __nativeTranslateHintText?: HTMLElement;
  __nativeTranslateHintIcon?: HTMLElement;
};

type SurfaceState = 'info' | 'progress' | 'success' | 'warning';

const DESIGN_STYLE_ID = 'native-translate-design-system';
const DESIGN_SYSTEM_STYLES = `
:root {
  --nt-font-family: 'SF Pro Display', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  --nt-color-surface: rgba(255, 255, 255, 0.72);
  --nt-color-surface-strong: rgba(255, 255, 255, 0.88);
  --nt-color-outline: rgba(0, 0, 0, 0.08);
  --nt-color-text: #000000;
  --nt-color-subtle: rgba(0, 0, 0, 0.5);
  --nt-color-accent: #007AFF;
  --nt-color-accent-strong: #0056B3;
  --nt-color-success: #34C759;
  --nt-color-warning: #FF9500;
  --nt-color-error: #FF3B30;
  --nt-shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04);
  --nt-space-xs: 4px;
  --nt-space-sm: 8px;
  --nt-space-md: 12px;
  --nt-space-lg: 16px;
  --nt-radius-lg: 20px;
  --nt-radius-pill: 999px;
  --nt-progress-value: 0;
  --nt-progress-opacity: 0;
}

@media (prefers-color-scheme: dark) {
  :root {
    --nt-color-surface: rgba(28, 28, 30, 0.72);
    --nt-color-surface-strong: rgba(44, 44, 46, 0.88);
    --nt-color-outline: rgba(255, 255, 255, 0.12);
    --nt-color-text: #FFFFFF;
    --nt-color-subtle: rgba(255, 255, 255, 0.55);
    --nt-shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.2);
  }
}



.native-translate-inline-hint {
  position: fixed;
  z-index: 2147483647;
  pointer-events: none;
  animation: nt-hint-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.native-translate-inline-hint__surface {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--nt-radius-pill);
  background: var(--nt-color-surface-strong);
  color: var(--nt-color-text);
  font-family: var(--nt-font-family);
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border: 0.5px solid var(--nt-color-outline);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.native-translate-inline-hint[data-dir='rtl'] .native-translate-inline-hint__surface {
  flex-direction: row-reverse;
  text-align: right;
}

.native-translate-inline-hint__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--nt-color-accent);
  font-size: 12px;
  flex-shrink: 0;
}

.native-translate-inline-hint--exit {
  animation: nt-hint-out 0.2s ease-in forwards;
}

@keyframes nt-spring-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes nt-spring-out {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
}

@keyframes nt-hint-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes nt-hint-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(4px);
  }
}

.native-translate-skeleton {
  display: block;
  margin-top: 8px;
  width: 100%;
  padding: 4px 0;
  animation: nt-skeleton-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.native-translate-skeleton__line {
  height: 12px;
  background: var(--nt-color-outline);
  border-radius: 4px;
  margin-bottom: 8px;
  width: 100%;
  background: linear-gradient(
    90deg,
    var(--nt-color-outline) 25%,
    var(--nt-color-surface-strong) 50%,
    var(--nt-color-outline) 75%
  );
  background-size: 200% 100%;
  animation: nt-skeleton-pulse 1.5s infinite linear;
}

.native-translate-skeleton__line:last-child {
  margin-bottom: 0;
  width: 60%;
}

@keyframes nt-skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes nt-skeleton-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.native-translate-skeleton__status {
  font-size: 11px;
  color: var(--nt-color-subtle);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--nt-font-family);
}

.native-translate-skeleton__status-icon {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--nt-color-accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: nt-rotate 1s linear infinite;
}

@keyframes nt-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

function ensureDesignSystemStyles(): void {
  if (document.getElementById(DESIGN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DESIGN_STYLE_ID;
  style.textContent = DESIGN_SYSTEM_STYLES;
  (document.head || document.documentElement).appendChild(style);
}

function classifyMessage(message: string): SurfaceState {
  const lower = message.toLowerCase();
  if (
    lower.includes('error') ||
    lower.includes('fail') ||
    message.includes('失败') ||
    message.includes('错误')
  ) {
    return 'warning';
  }
  if (
    lower.includes('complete') ||
    lower.includes('done') ||
    message.includes('完成') ||
    message.includes('已完成')
  ) {
    return 'success';
  }
  if (
    lower.includes('download') ||
    lower.includes('%') ||
    lower.includes('prepare') ||
    lower.includes('translat') ||
    message.includes('下载') ||
    message.includes('准备') ||
    message.includes('翻译')
  ) {
    return 'progress';
  }
  return 'info';
}

function stateIcon(state: SurfaceState): string {
  switch (state) {
    case 'success':
      return '✓';
    case 'warning':
      return '!';
    case 'progress':
      return '⟳';
    default:
      return '🌐';
  }
}

function extractProgressFraction(message: string): number | null {
  const match = message.match(/(\d{1,3})%/);
  if (!match) return null;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return null;
  const clamped = Math.min(100, Math.max(0, value));
  return clamped / 100;
}

interface TranslatorDownloadProgressEvent extends Event {
  loaded?: number; // 0..1
}

interface TranslatorMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (e: TranslatorDownloadProgressEvent) => void
  ) => void;
}

interface TranslatorCreateOptions {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  monitor?: (m: TranslatorMonitor) => void;
}

interface TranslatorStatic {
  availability: (
    opts?: { sourceLanguage?: LanguageCode; targetLanguage?: LanguageCode }
  ) => Promise<'unknown' | 'available' | 'downloadable' | 'unavailable'>;
  create: (opts: TranslatorCreateOptions) => Promise<TranslatorInstance>;
}

// 适配不同浏览器实现（历史/新规范）：
// - 旧提案：window.Translator.create(...)
// - 新提案：window.translation.createTranslator(...)
type TranslatorStaticAdapter = {
  create: (opts: TranslatorCreateOptions) => Promise<TranslatorInstance>;
};

type WindowTranslationAPI = {
  createTranslator?: (opts: TranslatorCreateOptions) => Promise<TranslatorInstance>;
};

function directResolveTranslatorAdapter(): TranslatorStaticAdapter | null {
  const legacy = window.Translator;
  if (legacy && typeof legacy.create === 'function') {
    return { create: legacy.create.bind(legacy) };
  }
  const modern = window.translation;
  if (modern && typeof modern.createTranslator === 'function') {
    return { create: modern.createTranslator.bind(modern) };
  }
  return null;
}

async function resolveTranslatorAdapterWithRetry(
  maxWaitMs = 1200,
): Promise<TranslatorStaticAdapter | null> {
  const cached = window.__nativeTranslateAdapter;
  if (cached) return cached;
  let adapter = directResolveTranslatorAdapter();
  if (adapter) {
    window.__nativeTranslateAdapter = adapter;
    return adapter;
  }
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 150));
    adapter = directResolveTranslatorAdapter();
    if (adapter) {
      window.__nativeTranslateAdapter = adapter;
      return adapter;
    }
  }
  return null;
}

// ========= 主世界桥（page world bridge）=========
const BRIDGE_SCRIPT_ID = 'native-translate-bridge';
const BRIDGE_REQ_TYPE = '__NT_BRIDGE_REQ';
const BRIDGE_RES_TYPE = '__NT_BRIDGE_RES';

interface BridgeRequest {
  type: typeof BRIDGE_REQ_TYPE;
  id: string;
  action: 'translate';
  source: LanguageCode;
  target: LanguageCode;
  text: string;
}

interface BridgeResponse {
  type: typeof BRIDGE_RES_TYPE;
  id: string;
  ok: boolean;
  result?: string;
  error?: string;
}

let bridgeInitialized = false;
const pendingBridgeResponses = new Map<string, (res: BridgeResponse) => void>();

function ensurePageBridgeInjected(): void {
  if (document.getElementById(BRIDGE_SCRIPT_ID)) return;
  const script = document.createElement('script');
  script.id = BRIDGE_SCRIPT_ID;
  script.textContent = `(() => {
  if (window.__nativeTranslateBridgeInit) return;
  window.__nativeTranslateBridgeInit = true;
  const pool = new Map();
  function directAdapter() {
    const legacy = window.Translator;
    if (legacy && typeof legacy.create === 'function') {
      return { create: legacy.create.bind(legacy) };
    }
    const modern = window.translation;
    if (modern && typeof modern.createTranslator === 'function') {
      return { create: modern.createTranslator.bind(modern) };
    }
    return null;
  }
  async function getTranslator(source, target) {
    const key = source + '->' + target;
    if (pool.has(key)) return pool.get(key);
    const adapter = directAdapter();
    if (!adapter) throw new Error('Translator API unavailable');
    const t = await adapter.create({ sourceLanguage: source, targetLanguage: target });
    if (t && t.ready) {
      try { await t.ready; } catch (e) { }
    }
    pool.set(key, t);
    return t;
  }
  window.addEventListener('message', async (event) => {
    const data = event && event.data;
    if (!data || data.type !== '${BRIDGE_REQ_TYPE}') return;
    try {
      if (data.action === 'translate') {
        const t = await getTranslator(data.source, data.target);
        const out = await t.translate(data.text);
        window.postMessage({ type: '${BRIDGE_RES_TYPE}', id: data.id, ok: true, result: out }, '*');
      }
    } catch (err) {
      const msg = (err && (err.message || String(err))) || 'bridge_error';
      window.postMessage({ type: '${BRIDGE_RES_TYPE}', id: data.id, ok: false, error: msg }, '*');
    }
  }, { capture: false });
})(); `;
  (document.documentElement || document.head || document.body || document).appendChild(script);
}

function initBridgeMessageChannel(): void {
  if (bridgeInitialized) return;
  bridgeInitialized = true;
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event?.data as BridgeResponse | undefined;
    if (!data || data.type !== BRIDGE_RES_TYPE) return;
    const handler = pendingBridgeResponses.get(data.id);
    if (handler) {
      pendingBridgeResponses.delete(data.id);
      handler(data);
    }
  });
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function bridgeTranslate(
  text: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): Promise<string> {
  ensurePageBridgeInjected();
  initBridgeMessageChannel();
  const id = randomId();
  const payload: BridgeRequest = {
    type: BRIDGE_REQ_TYPE,
    id,
    action: 'translate',
    source: sourceLanguage,
    target: targetLanguage,
    text,
  };
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingBridgeResponses.delete(id);
      reject(new Error('bridge_timeout'));
    }, 10000);
    pendingBridgeResponses.set(id, (res) => {
      clearTimeout(timeout);
      if (res.ok && typeof res.result === 'string') resolve(res.result);
      else reject(new Error(res.error || 'bridge_error'));
    });
    window.postMessage(payload, '*');
  });
}

// Language Detector API 类型声明（参考文档 https://developer.chrome.com/docs/ai/language-detection?hl=zh-cn）
type AvailabilityState = 'unknown' | 'available' | 'downloadable' | 'unavailable';

interface LanguageDetectorDownloadProgressEvent extends Event {
  loaded?: number; // 0..1
}

interface LanguageDetectorMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (e: LanguageDetectorDownloadProgressEvent) => void
  ) => void;
}

interface LanguageDetectionResult {
  detectedLanguage: string; // BCP-47
  confidence: number; // 0..1
}

interface LanguageDetectorInstance {
  detect: (text: string) => Promise<LanguageDetectionResult[]>;
}

interface LanguageDetectorStatic {
  availability: () => Promise<AvailabilityState>;
  create: (
    opts?: { monitor?: (m: LanguageDetectorMonitor) => void }
  ) => Promise<LanguageDetectorInstance>;
}

// 避免与其他文件的全局 Window 扩展冲突，这里不增强 Window 类型，使用 any 访问

// 运行时常量
const TRANSLATED_ATTR = 'data-native-translate-done';
const TRANSLATED_CLASS = 'native-translate-translation';
const READY_PAIRS_KEY = 'nativeTranslate:readyPairs';
const DETECTOR_READY_KEY = 'nativeTranslate:detectorReady';
let tryTranslateRef: (() => void) | null = null;

// 文本长度阈值（可微调）：
// - 标题等短文本也希望被翻译
const MIN_LENGTH_GENERIC = 4;
const MIN_LENGTH_HEADING = 2; // h1-h6 允许 2 个字符

const translationCache = new Map<string, string>();
const SEGMENTED_ATTR = 'data-nt-segmented';
const WRAPPED_CLASS = 'native-translate-wrapped-segment';

function buildCacheKey(text: string, sourceLanguage: string, targetLanguage: string): string {
  return `${sourceLanguage}| ${targetLanguage}| ${text} `;
}

interface PopupSettings {
  targetLanguage: LanguageCode;
  hotkeyModifier?: 'alt' | 'control' | 'shift';
  inputTargetLanguage?: LanguageCode;
}

const DEFAULT_POPUP_SETTINGS: PopupSettings = {
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  hotkeyModifier: 'alt',
  inputTargetLanguage: DEFAULT_INPUT_TARGET_LANGUAGE,
};

const SKELETON_DELAY_MS = 300;

let cachedPopupSettings: PopupSettings = { ...DEFAULT_POPUP_SETTINGS };
let popupSettingsHydrated = false;
let popupSettingsInitPromise: Promise<void> | null = null;
const popupSettingsObservers = new Set<(settings: PopupSettings) => void>();
let preferredModifier: 'alt' | 'control' | 'shift' = DEFAULT_POPUP_SETTINGS.hotkeyModifier ?? 'alt';

function applyPopupSettings(settings: PopupSettings | undefined): void {
  const next = { ...DEFAULT_POPUP_SETTINGS, ...(settings ?? {}) };
  cachedPopupSettings = next;
  preferredModifier = next.hotkeyModifier ?? 'alt';
  for (const observer of popupSettingsObservers) {
    try {
      observer(next);
    } catch (error) {
      console.warn('popup settings observer failed', error);
    }
  }
}

function addPopupSettingsObserver(observer: (settings: PopupSettings) => void): () => void {
  popupSettingsObservers.add(observer);
  return () => popupSettingsObservers.delete(observer);
}

async function ensurePopupSettings(): Promise<PopupSettings> {
  if (popupSettingsHydrated) return cachedPopupSettings;
  if (!popupSettingsInitPromise) {
    popupSettingsInitPromise = chrome.storage.local
      .get(POPUP_SETTINGS_KEY)
      .then((data) => {
        const settings = (data?.[POPUP_SETTINGS_KEY] as PopupSettings | undefined);
        applyPopupSettings(settings);
        popupSettingsHydrated = true;
      })
      .catch((error) => {
        console.warn('Failed to load popup settings', error);
        applyPopupSettings(undefined);
        popupSettingsHydrated = true;
      })
      .finally(() => {
        popupSettingsInitPromise = null;
      });
  }
  await popupSettingsInitPromise;
  return cachedPopupSettings;
}

if (!window.__nativeTranslatePopupSettingsSubscribed) {
  window.__nativeTranslatePopupSettingsSubscribed = true;
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      const entry = changes?.[POPUP_SETTINGS_KEY];
      if (!entry) return;
      applyPopupSettings(entry.newValue as PopupSettings | undefined);
      popupSettingsHydrated = true;
    });
  } catch (error) {
    console.warn('Failed to subscribe to popup settings changes', error);
  }
}

void ensurePopupSettings();

async function getPreferredTargetLanguage(): Promise<LanguageCode> {
  const settings = await ensurePopupSettings();
  return settings.targetLanguage;
}

async function getPreferredInputTargetLanguage(): Promise<LanguageCode> {
  const settings = await ensurePopupSettings();
  return settings.inputTargetLanguage ?? DEFAULT_INPUT_TARGET_LANGUAGE;
}

async function getHoverHotkeyModifier(): Promise<'alt' | 'control' | 'shift'> {
  const settings = await ensurePopupSettings();
  const value = settings.hotkeyModifier ?? 'alt';
  return value === 'control' || value === 'shift' ? value : 'alt';
}




function runIdle(task: () => void, timeout = 1200): void {
  const idle = window.requestIdleCallback;
  if (typeof idle === 'function') {
    idle(() => {
      try {
        task();
      } catch (error) {
        console.warn('idle task failed', error);
      }
    }, { timeout });
    return;
  }
  window.setTimeout(() => {
    try {
      task();
    } catch (error) {
      console.warn('timeout task failed', error);
    }
  }, Math.min(timeout, 500));
}

const warmingPairs = new Set<string>();

declare global {
  interface Window {
    Translator?: TranslatorStatic;
    translation?: WindowTranslationAPI;
    LanguageDetector?: LanguageDetectorStatic;
    __nativeTranslateAdapter?: TranslatorStaticAdapter;
    __nativeLanguageDetector?: LanguageDetectorInstance;
    __nativeTranslatePool?: Map<string, TranslatorInstance>;
    __nativeTranslatePopupSettingsSubscribed?: boolean;
    __nativeTranslateHoverAltInit?: boolean;
    __nativeTripleSpaceInit?: boolean;
  }
}

async function scheduleWarmTranslatorPair(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<void> {
  if (isSameLanguage(sourceLanguage, targetLanguage)) return;
  const key = getPairKey(sourceLanguage, targetLanguage);
  if (warmingPairs.has(key)) return;
  warmingPairs.add(key);

  const execute = async () => {
    try {
      const ready = await wasPairReady(sourceLanguage, targetLanguage);
      if (ready) return;
      await getOrCreateTranslator(sourceLanguage, targetLanguage);
    } catch (error) {
      console.warn('warm translator failed', error);
    } finally {
      warmingPairs.delete(key);
    }
  };

  runIdle(() => {
    void execute();
  });
}

function inferDocumentLanguage(): LanguageCode {
  const htmlLang = document.documentElement.getAttribute('lang')?.trim();
  if (htmlLang) {
    const normalized = primarySubtag(htmlLang);
    if (normalized) return normalized as LanguageCode;
    return htmlLang as LanguageCode;
  }
  const nav = navigator.language?.toLowerCase();
  if (nav) {
    const normalized = primarySubtag(nav);
    if (normalized) return normalized as LanguageCode;
    return nav as LanguageCode;
  }
  return DEFAULT_INPUT_TARGET_LANGUAGE;
}

// 针对输入框/可编辑区域的行内提示（靠近光标或元素末尾）
type InlineHint = { update: (text: string) => void; remove: () => void };

function getCaretRectForElement(element: Element): DOMRect | null {
  // 仅对可编辑区域尝试使用光标矩形
  const isContentEditableHost = (element as HTMLElement).isContentEditable;
  if (isContentEditableHost) {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        if (element.contains(range.startContainer)) {
          const rect = range.getBoundingClientRect();
          if (rect && (rect.width || rect.height)) return rect;
          const rects = range.getClientRects();
          if (rects.length > 0) return rects[rects.length - 1];
        }
      }
    } catch (_e) { }
  }
  return null;
}

function showInlineHintNearElement(element: Element, initialText: string): InlineHint {
  ensureDesignSystemStyles();
  const container = document.createElement('div');
  container.className = 'native-translate-inline-hint';
  container.style.position = 'fixed';
  container.style.zIndex = '2147483647';
  container.style.pointerEvents = 'none';

  const surface = document.createElement('div');
  surface.className = 'native-translate-inline-hint__surface';

  const iconEl = document.createElement('span');
  iconEl.className = 'native-translate-inline-hint__icon';

  const textEl = document.createElement('span');
  textEl.className = 'native-translate-inline-hint__text';
  textEl.textContent = initialText;

  surface.append(iconEl, textEl);
  container.append(surface);

  const hintEl = container as InlineHintElement;
  hintEl.__nativeTranslateHintText = textEl;
  hintEl.__nativeTranslateHintIcon = iconEl;

  const dir = document.documentElement.getAttribute('dir') || 'ltr';
  container.dataset.dir = dir;

  const applyState = (message: string) => {
    const state = classifyMessage(message);
    container.dataset.state = state;
    if (iconEl) {
      iconEl.textContent = stateIcon(state);
    }
  };

  applyState(initialText);

  const reposition = () => {
    const caretRect = getCaretRectForElement(element);
    const base = caretRect || element.getBoundingClientRect();
    const clampedX = Math.min(
      window.innerWidth - 8,
      Math.max(8, dir === 'rtl' ? base.left : base.right)
    );
    const clampedY = Math.min(window.innerHeight - 8, Math.max(8, base.top));
    container.style.left = `${Math.round(clampedX)} px`;
    container.style.top = `${Math.round(clampedY)} px`;
    const transform = dir === 'rtl'
      ? 'translate(6px, -110%)'
      : 'translate(-100%, -110%)';
    container.style.transform = transform;
    container.style.transformOrigin = dir === 'rtl' ? 'top left' : 'top right';
  };

  (document.body || document.documentElement).appendChild(container);
  reposition();

  const onScroll = () => reposition();
  const onResize = () => reposition();
  const onSelection = () => reposition();
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  document.addEventListener('selectionchange', onSelection);

  return {
    update(text: string) {
      const hint = container as InlineHintElement;
      if (hint.__nativeTranslateHintText) {
        hint.__nativeTranslateHintText.textContent = text;
      } else {
        container.textContent = text;
      }
      applyState(text);
      reposition();
    },
    remove() {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('selectionchange', onSelection);
      if (!container.isConnected) return;
      container.classList.add('native-translate-inline-hint--exit');
      window.setTimeout(() => {
        container.remove();
      }, 160);
    },
  };
}

function clearPreviousTranslationsAndMarks(): void {
  const inserted = Array.from(document.querySelectorAll(`.${TRANSLATED_CLASS} `));
  for (const el of inserted) {
    el.remove();
  }
  const marked = Array.from(document.querySelectorAll(`[${TRANSLATED_ATTR}="1"]`));
  for (const el of marked) {
    (el as HTMLElement).removeAttribute(TRANSLATED_ATTR);
  }
}

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return true;
}

function shouldTranslateElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (
    tag === 'script' ||
    tag === 'style' ||
    tag === 'noscript' ||
    tag === 'meta' ||
    tag === 'link' ||
    tag === 'iframe' ||
    tag === 'canvas' ||
    tag === 'svg' ||
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'table' ||
    tag === 'thead' ||
    tag === 'tbody' ||
    tag === 'tfoot' ||
    tag === 'tr' ||
    tag === 'td' ||
    tag === 'th'
  ) {
    return false;
  }
  // 导航/页眉/页脚/侧边栏默认跳过容器，但允许叶子级文字元素
  const inNavLike = !!element.closest('nav,header,footer,aside');
  if (inNavLike) {
    const t = tag;
    const allow = t === 'a' || t === 'button' || t === 'span' || t === 'li';
    if (!allow) return false;
  }
  if (element.closest(`.${TRANSLATED_CLASS} `)) return false;
  if ((element as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1') return false;
  // 若内部已包含翻译或已被标记处理，跳过，避免父子重复翻译
  if (element.querySelector(`.${TRANSLATED_CLASS}, [${TRANSLATED_ATTR} = "1"]`)) return false;
  return true;
}

const STRONG_BLOCK_TAGS = new Set([
  'article', 'section', 'p', 'li', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'dd', 'dt', 'figcaption', 'summary',
  'ul', 'ol', 'dl', 'table', 'figure',
  'header', 'footer', 'nav', 'aside', 'main'
]);

function isStrongBlock(tag: string): boolean {
  return STRONG_BLOCK_TAGS.has(tag.toLowerCase());
}

function isBlockTag(tag: string): boolean {
  const t = tag.toLowerCase();
  return t === 'div' || isStrongBlock(t) || t === 'hr' || t === 'pre' || t === 'form';
}

function hasStrongBlockDescendants(element: Element): boolean {
  return element.querySelector(Array.from(STRONG_BLOCK_TAGS).join(',')) !== null;
}

function hasAnyBlockDescendants(element: Element): boolean {
  return element.querySelector(Array.from(STRONG_BLOCK_TAGS).concat('div').join(',')) !== null;
}

function segmentAndWrapLooseContent(container: Element) {
  if (!container || container.hasAttribute(SEGMENTED_ATTR)) return;
  const tag = container.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'input' || tag === 'pre' || tag === 'code') return;

  const childNodes = Array.from(container.childNodes);
  let group: Node[] = [];

  const commit = () => {
    if (group.length === 0) return;
    const textContent = group.map(n => n.textContent).join('').trim();
    const hasText = group.some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
    if (hasText && textContent.length >= MIN_LENGTH_GENERIC) {
      const wrapper = document.createElement('div');
      wrapper.className = WRAPPED_CLASS;
      wrapper.style.display = 'block';
      wrapper.style.margin = '1em 0';
      container.insertBefore(wrapper, group[0]);
      for (const n of group) {
        wrapper.appendChild(n);
      }
    }
    group = [];
  };

  for (const child of childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      if (isBlockTag((child as Element).tagName)) {
        commit();
      } else {
        group.push(child);
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      group.push(child);
    } else {
      group.push(child);
    }
  }
  commit();
  container.setAttribute(SEGMENTED_ATTR, '1');
}

function prepareDocumentForTranslation(root: Element | Document = document) {
  const selector = 'article, section, main, .prose, .article, .post-content, .entry-content, div[class*="content"]';
  const containers = root.querySelectorAll(selector);
  for (const c of containers) {
    segmentAndWrapLooseContent(c);
  }

  // 专门针对 Hugging Face 等站点的常见 content div
  if (root === document) {
    const blogContent = document.querySelector('.blog-content');
    if (blogContent) segmentAndWrapLooseContent(blogContent);
  }
}


function getElementText(element: Element): string {
  // 使用 innerText 保留可见文本（排除 display:none 等）
  // 对 pre/code 等不处理以避免破坏代码样式
  const tag = element.tagName.toLowerCase();
  if (tag === 'code' || tag === 'pre' || tag === 'kbd' || tag === 'samp') return '';
  return (element as HTMLElement).innerText.trim();
}

/**
 * 提取带标记的文本，以便在翻译后还原交互元素
 * 对于 <img> 等无内容元素，使用单点标记 [[NTn]]
 * 对于 <a> 等含内容元素，使用边界标记 [[NTn_S]]...[[NTn_E]]，以便翻译其内部文字
 */
function getMarkedWithNodes(element: Element): { text: string; nodeMap: Map<string, Node> } {
  const nodeMap = new Map<string, Node>();
  let counter = 0;

  function process(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      // 在 X 上，Mention 是 <a>，Emoji 是 <img>
      if (tag === 'img') {
        const marker = `[[NT${counter++}]]`;
        nodeMap.set(marker, el.cloneNode(true));
        return marker;
      }

      if (tag === 'a') {
        const markerBase = `[[NT${counter++}]]`;
        const startMarker = markerBase.replace(']]', '_S]]');
        const endMarker = markerBase.replace(']]', '_E]]');
        // 只克隆标签本身（含属性），不含子节点
        nodeMap.set(markerBase, el.cloneNode(false));

        let inner = '';
        for (const child of Array.from(node.childNodes)) {
          inner += process(child);
        }
        return `${startMarker}${inner}${endMarker}`;
      }

      // 如果是普通 span 或者其他 inline 元素，继续递归
      let result = '';
      for (const child of Array.from(node.childNodes)) {
        result += process(child);
      }
      return result;
    }
    return '';
  }

  const rawText = process(element);
  return { text: rawText.trim(), nodeMap };
}

/**
 * 将带标记的译文渲染回 DOM 片段
 */
function renderMarkedText(translatedText: string, nodeMap: Map<string, Node>): DocumentFragment {
  const fragment = document.createDocumentFragment();

  // 匹配 [[NTn]], [[NTn_S]], [[NTn_E]]，使用 gi 忽略大小写
  // 因为某些翻译引擎（如 Google）可能会将占位符转为小写
  const parts = translatedText.split(/(\[\[NT\d+(?:_[SE])?\]\])/gi);

  // 使用栈处理嵌套
  const stack: (DocumentFragment | Element)[] = [fragment];

  for (const part of parts) {
    if (!part) continue;

    const upperPart = part.toUpperCase();
    if (upperPart.endsWith('_S]]')) {
      const baseMarker = upperPart.replace('_S]]', ']]');
      const original = nodeMap.get(baseMarker);
      if (original) {
        const clone = original.cloneNode(false) as Element;
        stack[stack.length - 1].appendChild(clone);
        stack.push(clone);
      } else {
        // 如果找不到对应的节点映射，作为普通文字 fallback
        stack[stack.length - 1].appendChild(document.createTextNode(part));
      }
    } else if (upperPart.endsWith('_E]]')) {
      if (stack.length > 1) {
        stack.pop();
      } else {
        stack[stack.length - 1].appendChild(document.createTextNode(part));
      }
    } else {
      const originalNode = nodeMap.get(upperPart);
      if (originalNode) {
        // 单点标记（如 <img>）
        stack[stack.length - 1].appendChild(originalNode.cloneNode(true));
      } else {
        // 普通文字
        stack[stack.length - 1].appendChild(document.createTextNode(part));
      }
    }
  }

  return fragment;
}

function collectTranslatableBlocks(root: ParentNode): Array<{ element: Element; text: string; nodeMap?: Map<string, Node> }> {
  const results: Array<{ element: Element; text: string; nodeMap?: Map<string, Node> }> = [];

  function walk(node: Element) {
    if (!shouldTranslateElement(node)) return;
    if (!isElementVisible(node)) return;

    const dataTestId = node.getAttribute('data-testid');
    const isTweet = dataTestId === 'tweetText' || dataTestId === 'tweet-text';
    const tag = node.tagName.toLowerCase();

    // 如果是显式的块级标签或是 X 等站点的特定文本容器
    if (isTweet || isStrongBlock(tag) || tag === 'div') {
      // 如果没有更深的“强”块级子元素，将其视为一个连贯的翻译单元
      if (isTweet || !hasStrongBlockDescendants(node)) {
        const { text, nodeMap } = getMarkedWithNodes(node);
        if (text.length >= MIN_LENGTH_GENERIC) {
          results.push({ element: node, text, nodeMap });
          return; // 捕获后停止向下探测，保持段落完整性
        }
      }
      // 有子块，继续深度优先遍历
      for (const child of Array.from(node.children)) {
        walk(child);
      }
    } else if (tag === 'span' || tag === 'a' || tag === 'button') {
      // 这里的 inline 标签只有在不是强块子元素时才会被作为独立块捕获（鲁棒性）
      const { text, nodeMap } = getMarkedWithNodes(node);
      if (text.length >= MIN_LENGTH_GENERIC) {
        results.push({ element: node, text, nodeMap });
      }
      // 通常不进 inline 标签内部
    } else {
      for (const child of Array.from(node.children)) {
        walk(child);
      }
    }
  }

  if (root instanceof Element) {
    walk(root);
  } else {
    for (const child of Array.from((root as Document).body?.children || [])) {
      walk(child as Element);
    }
  }

  return results;
}

function createSkeletonPlaceholder(original: Element): HTMLElement {
  ensureDesignSystemStyles();
  const container = document.createElement('div');
  container.className = 'native-translate-skeleton';

  const status = document.createElement('div');
  status.className = 'native-translate-skeleton__status';

  const icon = document.createElement('span');
  icon.className = 'native-translate-skeleton__status-icon';

  const text = document.createElement('span');
  text.className = 'native-translate-skeleton__status-text';
  text.textContent = tCS('overlay_preparing');

  status.append(icon, text);
  container.appendChild(status);

  // 估算行数：根据高度，大约 24px 一行
  const rect = original.getBoundingClientRect();
  const height = rect.height || 24;
  const lineCount = Math.max(1, Math.min(10, Math.ceil(height / 24)));

  for (let i = 0; i < lineCount; i++) {
    const line = document.createElement('div');
    line.className = 'native-translate-skeleton__line';
    container.appendChild(line);
  }

  return container;
}

function createTranslationSpan(
  original: Element,
  content: string | DocumentFragment,
  targetLanguage: LanguageCode,
): Element {
  const span = document.createElement('span');
  span.classList.add(TRANSLATED_CLASS);
  span.setAttribute(TRANSLATED_ATTR, '1');
  span.setAttribute('lang', targetLanguage);
  // 使用块级表现，确保作为同级兄弟显示在原文下方
  if (span instanceof HTMLElement) {
    const originalTag = original.tagName.toLowerCase();
    const isInlineNavText = originalTag === 'span';
    if (!isInlineNavText) {
      span.style.display = 'block';
      span.style.marginTop = '4px';
      span.style.whiteSpace = 'pre-wrap';
    }
    // 仅在 RTL 时显式标记方向与对齐；LTR 使用浏览器默认
    const rtl = /^(ar|he|fa|ur|ps)(-|$)/i.test(targetLanguage);
    if (rtl) {
      span.dir = 'rtl';
      span.style.textAlign = 'right';
    }
  }

  if (content instanceof DocumentFragment) {
    span.appendChild(content);
  } else {
    span.textContent = content;
  }

  return span;
}

function insertTranslationAdjacent(target: Element, node: Element): void {
  const tag = target.tagName.toLowerCase();
  // 对于内联/可点击小件，放在它后面作为同级以减少布局干扰
  if (tag === 'span' || tag === 'a' || tag === 'button') {
    try {
      target.insertAdjacentElement('afterend', node);
      return;
    } catch (_e) { /* fallback below */ }
  }
  // 默认：作为子节点插入
  (target as Element).appendChild(node);
}

// 流式工具改为从共享模块导入

async function translateLineWithStreamingSupport(
  translator: TranslatorInstance | null,
  line: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  onPartial?: (partial: string) => void,
): Promise<string> {
  // 优先使用内容脚本内的本地流式能力
  if (translator) {
    const canStream =
      typeof translator.translateStreaming === 'function' &&
      line.length >= STREAMING_LENGTH_THRESHOLD;
    if (canStream) {
      let partial = '';
      let received = false;
      try {
        const streamLike = (translator.translateStreaming as (text: string) => unknown)(line);
        for await (const chunk of normalizeToAsyncStringIterable(streamLike)) {
          received = true;
          partial += chunk;
          onPartial?.(partial);
        }
      } catch {
        // ignore and fallback
      }
      if (received && partial) return partial;
      try {
        const out = await translator.translate(line);
        onPartial?.(out);
        return out;
      } catch {
        // 如果本地失败，回退到桥
        const out = await bridgeTranslate(line, sourceLanguage, targetLanguage);
        onPartial?.(out);
        return out;
      }
    }
    // 无流式或不满足阈值，则直接一次性
    try {
      const out = await translator.translate(line);
      onPartial?.(out);
      return out;
    } catch {
      const out = await bridgeTranslate(line, sourceLanguage, targetLanguage);
      onPartial?.(out);
      return out;
    }
  }
  // 没有本地翻译器，使用主世界桥（不支持流式）
  const bridged = await bridgeTranslate(line, sourceLanguage, targetLanguage);
  onPartial?.(bridged);
  return bridged;
}

async function translateIntoElementPreservingNewlines(
  original: Element,
  translator: TranslatorInstance | null,
  text: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  nodeMap?: Map<string, Node>
): Promise<void> {
  const placeholder = createTranslationSpan(original, '', targetLanguage);
  insertTranslationAdjacent(original, placeholder);
  (original as HTMLElement).setAttribute(TRANSLATED_ATTR, '1');
  placeholder.textContent = '';

  const lines = text.split(/\r?\n/);
  const resultLines: string[] = [];
  for (const line of lines) {
    if (!line) {
      resultLines.push('');
      placeholder.textContent = resultLines.join('\n');
      continue;
    }
    const cacheKey = buildCacheKey(line, sourceLanguage, targetLanguage);
    const cached = translationCache.get(cacheKey);
    if (cached) {
      resultLines.push(cached);
      placeholder.textContent = resultLines.join('\n');
      continue;
    }
    const finalLine = await translateLineWithStreamingSupport(
      translator,
      line,
      sourceLanguage,
      targetLanguage,
      (partial) => {
        // 增量更新当前行
        placeholder.textContent = resultLines.concat(partial).join('\n');
      }
    );
    translationCache.set(cacheKey, finalLine);
    resultLines.push(finalLine);
    placeholder.textContent = resultLines.join('\n');
  }

  // 翻译完全结束后，如果存在 nodeMap，进行最终的精细渲染还原节点
  if (nodeMap && nodeMap.size > 0) {
    const finalContent = resultLines.join('\n');
    const fragment = renderMarkedText(finalContent, nodeMap);
    placeholder.textContent = '';
    placeholder.appendChild(fragment);
  }
}

async function translateTextPreservingNewlines(
  translator: TranslatorInstance | null,
  text: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): Promise<string> {
  // 按原始换行分段翻译，保证换行结构不被打乱
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line) {
      out.push('');
      continue;
    }
    const lineKey = buildCacheKey(line, sourceLanguage, targetLanguage);
    let translatedLine = translationCache.get(lineKey);
    if (!translatedLine) {
      try {
        if (translator) {
          translatedLine = await translator.translate(line);
        } else {
          translatedLine = await bridgeTranslate(line, sourceLanguage, targetLanguage);
        }
        translationCache.set(lineKey, translatedLine);
      } catch (_e) {
        translatedLine = '';
      }
    }
    out.push(translatedLine);
  }
  return out.join('\n');
}

async function translateBlocksSequentially(
  translator: TranslatorInstance | null,
  items: Array<{ element: Element; text: string; nodeMap?: Map<string, Node> }>,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  _onProgress: (done: number, total: number) => void
): Promise<void> {
  const BATCH_SIZE = 20;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    // 为当前批次中的所有元素插入骨架屏
    const skeletons = batch.map(({ element }) => {
      const sk = createSkeletonPlaceholder(element);
      insertTranslationAdjacent(element, sk);
      return { element, skeleton: sk };
    });

    for (let j = 0; j < batch.length; j++) {
      const { element, text, nodeMap } = batch[j];
      const skeleton = skeletons[j].skeleton;

      const cacheKey = buildCacheKey(text, sourceLanguage, targetLanguage);
      let translated = translationCache.get(cacheKey);

      if (!translated) {
        try {
          if (text.length >= STREAMING_LENGTH_THRESHOLD) {
            // 流式翻译会自动替换骨架屏前面的占位，这里我们需要特殊处理
            // 为简单起见，流式翻译内部会创建自己的 placeholder，所以我们先删掉骨架屏
            skeleton.remove();
            await translateIntoElementPreservingNewlines(
              element,
              translator,
              text,
              sourceLanguage,
              targetLanguage,
              nodeMap
            );
            continue;
          }

          translated = await translateTextPreservingNewlines(
            translator,
            text,
            sourceLanguage,
            targetLanguage
          );
          translationCache.set(cacheKey, translated);
        } catch (_e) {
          translated = '';
        }
      }

      skeleton.remove();
      if (translated) {
        let content: string | DocumentFragment = translated;
        if (nodeMap && nodeMap.size > 0) {
          content = renderMarkedText(translated, nodeMap);
        }
        const clone = createTranslationSpan(element, content, targetLanguage);
        insertTranslationAdjacent(element, clone);
        (element as HTMLElement).setAttribute(TRANSLATED_ATTR, '1');
      }
    }

    // 让出事件循环
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function getPairKey(sourceLanguage: LanguageCode, targetLanguage: LanguageCode): string {
  return `${sourceLanguage} -> ${targetLanguage} `;
}

async function markPairReady(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<void> {
  const key = getPairKey(sourceLanguage, targetLanguage);
  try {
    const storageNs: 'session' | 'local' = 'session' in chrome.storage ? 'session' : 'local';
    const data = await chrome.storage[storageNs].get(READY_PAIRS_KEY);
    const map = (data?.[READY_PAIRS_KEY] as Record<string, number> | undefined) ?? {};
    map[key] = Date.now();
    await chrome.storage[storageNs].set({ [READY_PAIRS_KEY]: map });
  } catch (_e) {
    // ignore
  }
}

async function wasPairReady(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<boolean> {
  const key = getPairKey(sourceLanguage, targetLanguage);
  try {
    const storageNs: 'session' | 'local' = 'session' in chrome.storage ? 'session' : 'local';
    const data = await chrome.storage[storageNs].get(READY_PAIRS_KEY);
    const map = (data?.[READY_PAIRS_KEY] as Record<string, number> | undefined) ?? {};
    return Boolean(map[key]);
  } catch (_e) {
    return false;
  }
}

async function getOrCreateTranslator(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  onProgress?: (pct: number) => void
): Promise<TranslatorInstance> {
  const adapter = await resolveTranslatorAdapterWithRetry(1000);
  if (!adapter) throw new Error('Translator API unavailable');

  if (!window.__nativeTranslatePool) {
    window.__nativeTranslatePool = new Map<string, TranslatorInstance>();
  }
  const pool = window.__nativeTranslatePool;
  const pairKey = getPairKey(sourceLanguage, targetLanguage);
  const existing = pool.get(pairKey);
  if (existing) return existing;

  let lastPct = 0;
  const translator = await adapter.create({
    sourceLanguage,
    targetLanguage,
    monitor(m) {
      if (!onProgress) return;
      m.addEventListener('downloadprogress', (e) => {
        const loaded = typeof e.loaded === 'number' ? e.loaded : 0;
        const pct = Math.round(loaded * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          onProgress(pct);
        }
      });
    },
  });
  if (translator.ready) await translator.ready;
  pool.set(pairKey, translator);
  await markPairReady(sourceLanguage, targetLanguage);
  return translator;
}

function primarySubtag(lang: string | undefined): string {
  if (!lang) return '';
  return lang.split('-')[0].toLowerCase();
}

function isSameLanguage(a: string, b: string): boolean {
  return primarySubtag(a) === primarySubtag(b);
}

function buildDetectionSample(maxChars = 4000): string {
  const blocks = collectTranslatableBlocks(document.body);
  if (blocks.length === 0) {
    // 回退到全文可见文本（可能较长）
    return (document.body?.innerText || '').trim().slice(0, maxChars);
  }
  let sample = '';
  for (const item of blocks) {
    if (!item.text) continue;
    if (sample.length + item.text.length > maxChars) break;
    sample += sample ? `\n${item.text} ` : item.text;
    if (sample.length >= maxChars) break;
  }
  return sample.slice(0, maxChars);
}

async function getOrCreateLanguageDetector(
  onProgress?: (pct: number) => void,
): Promise<LanguageDetectorInstance> {
  const api = window.LanguageDetector;
  if (!api) throw new Error('Language Detector API unavailable');
  const cached = window.__nativeLanguageDetector;
  if (cached) return cached;
  let lastPct = -1;
  const detector = await api.create({
    monitor(m) {
      if (!onProgress) return;
      m.addEventListener('downloadprogress', (e) => {
        const loaded = typeof e.loaded === 'number' ? e.loaded : 0;
        const pct = Math.round(loaded * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          onProgress(pct);
        }
      });
    },
  });
  window.__nativeLanguageDetector = detector;
  try {
    const storageNs: 'session' | 'local' = 'session' in chrome.storage ? 'session' : 'local';
    await chrome.storage[storageNs].set({ [DETECTOR_READY_KEY]: Date.now() });
  } catch (_e) { }
  return detector;
}

async function detectSourceLanguageForPage(
  onProgress?: (pct: number) => void,
): Promise<{
  lang: LanguageCode;
  confidence: number;
} | null> {
  const api = window.LanguageDetector;
  if (!api) return null;
  try {
    const state = await api.availability();
    // 如果尚未下载模型，则创建时会触发下载
    if (state === 'unavailable') return null;
  } catch (_e) { }

  const sample = buildDetectionSample();
  if (!sample || sample.split(/\s+/g).length < 4) {
    // 样本过短，退回 documentElement 的 lang 提示
    const htmlLang = document.documentElement.getAttribute('lang') || '';
    if (htmlLang) return { lang: htmlLang, confidence: 0.5 };
  }

  const detector = await getOrCreateLanguageDetector(onProgress);
  const results = await detector.detect(sample);
  if (!results || results.length === 0) return null;
  const best = results[0];
  return { lang: best.detectedLanguage, confidence: best.confidence };
}

async function translateFullPage(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): Promise<void> {
  let translator: TranslatorInstance | null = null;
  try {
    translator = await getOrCreateTranslator(sourceLanguage, targetLanguage);
  } catch (_err) {
    translator = null;
  }

  const blocks = collectTranslatableBlocks(document.body);
  if (blocks.length === 0) {
    return;
  }

  await translateBlocksSequentially(
    translator,
    blocks,
    sourceLanguage,
    targetLanguage,
    () => { }
  );
}

async function translateFullPageAutoDetect(targetLanguage: LanguageCode): Promise<void> {
  const translatorApi = window.Translator;
  if (!translatorApi) {
    return;
  }

  // 预处理：包裹散乱文本为块，确保能被 collectTranslatableBlocks 识别
  prepareDocumentForTranslation(document.body);

  const detection = await detectSourceLanguageForPage();

  const htmlLang = document.documentElement.getAttribute('lang') || '';
  const sourceLanguage = detection?.lang || htmlLang || 'en';

  if (isSameLanguage(sourceLanguage, targetLanguage)) {
    return;
  }

  clearPreviousTranslationsAndMarks();
  await translateFullPage(sourceLanguage, targetLanguage);
}

// 消息通道：接收 Popup 指令
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === MSG_TRANSLATE_PAGE) {
    const { targetLanguage } = (message.payload ?? {}) as {
      targetLanguage: LanguageCode;
    };
    void translateFullPageAutoDetect(targetLanguage);
    return false;
  }
  if (message.type === MSG_UPDATE_HOTKEY) {
    const { hotkeyModifier } = (message.payload ?? {}) as {
      hotkeyModifier?: 'alt' | 'control' | 'shift';
    };
    if (hotkeyModifier === 'alt' || hotkeyModifier === 'control' || hotkeyModifier === 'shift') {
      preferredModifier = hotkeyModifier;
      if (typeof tryTranslateRef === 'function') tryTranslateRef();
    }
    return false;
  }
  if (message.type === MSG_WARM_TRANSLATOR) {
    void (async () => {
      try {
        const settings = await ensurePopupSettings();
        const payload = (message.payload ?? {}) as {
          sourceLanguage?: LanguageCode | 'auto';
          targetLanguage?: LanguageCode;
        };
        const target = (payload.targetLanguage ?? settings.targetLanguage) as LanguageCode;
        if (!target) return;
        let source = payload.sourceLanguage;
        if (!source || source === 'auto') {
          const detection = await detectSourceLanguageForPage();
          source = (detection?.lang ?? inferDocumentLanguage()) as LanguageCode;
        }
        await scheduleWarmTranslatorPair(source as LanguageCode, target);
      } catch (error) {
        console.warn('warm translator request failed', error);
      }
    })();
    return false;
  }
  return false;
});

// 轻量心跳：用于 SidePanel/Popup 注入后探测内容脚本是否就绪
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === '__PING__') {
    try {
      const respond = sendResponse as unknown as (response: unknown) => void;
      respond({ ok: true });
    } catch { }
    return false;
  }
  return false;
});

// 侧边栏请求：翻译任意文本 / 语言检测
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === MSG_TRANSLATE_TEXT) {
    const { text, sourceLanguage, targetLanguage } = (message.payload ?? {}) as {
      text: string;
      sourceLanguage: LanguageCode | 'auto';
      targetLanguage: LanguageCode;
    };
    (async () => {
      try {
        const respond = sendResponse as unknown as (response: unknown) => void;
        let source: LanguageCode | null = null;
        if (sourceLanguage === 'auto') {
          source = await detectLanguageForText(text);
          if (!source) source = 'en';
        } else {
          source = sourceLanguage;
        }
        if (isSameLanguage(source, targetLanguage)) {
          respond({ ok: true, result: text, detectedSource: source });
          return;
        }
        let translator: TranslatorInstance | null;
        try {
          translator = await getOrCreateTranslator(source, targetLanguage);
        } catch (_e) {
          translator = null;
        }
        // 保留原始段落与换行：按行翻译后再拼接
        const out = await translateTextPreservingNewlines(
          translator,
          text,
          source,
          targetLanguage
        );
        respond({ ok: true, result: out, detectedSource: source });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown_error';
        const respond = sendResponse as unknown as (response: unknown) => void;
        respond({ ok: false, error: msg });
      }
    })();
    return true; // 异步响应
  }
  if (message.type === 'NATIVE_TRANSLATE_DETECT_LANGUAGE') {
    const { text } = (message.payload ?? {}) as { text: string };
    (async () => {
      try {
        const lang = await detectLanguageForText(text);
        const respond = sendResponse as unknown as (response: unknown) => void;
        respond({ ok: true, lang });
      } catch (_e) {
        const respond = sendResponse as unknown as (response: unknown) => void;
        respond({ ok: false, error: 'detect_failed' });
      }
    })();
    return true;
  }
  return false;
});

// ========== 悬停 + Alt 翻译当前段落 ==========

function isEditingContext(): boolean {
  const ae = document.activeElement as HTMLElement | null;
  if (!ae) return false;
  if (ae.isContentEditable) return true;
  const tag = ae.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea';
}

function isAllowedBlockTag(tagLower: string): boolean {
  return isBlockTag(tagLower);
}

function pickTranslatableBlockFromTarget(start: Element | null): Element | null {
  let node: Element | null = start;
  while (node && node !== document.documentElement) {
    const tagLower = node.tagName?.toLowerCase?.() || '';
    if (isAllowedBlockTag(tagLower)) {
      if (shouldTranslateElement(node) && isElementVisible(node)) {
        const text = getElementText(node);
        const isHeading = /^h[1-6]$/.test(node.tagName?.toLowerCase?.() || '');
        if (text.length >= (isHeading ? MIN_LENGTH_HEADING : MIN_LENGTH_GENERIC)) {
          // 只要是有效块级元素，直接返回，不再依赖 hasBlockDescendants 过滤
          return node;
        }
      }
    }
    node = node.parentElement;
  }
  return null;
}

async function detectLanguageForText(text: string): Promise<LanguageCode | null> {
  try {
    const detector = await getOrCreateLanguageDetector();
    const results = await detector.detect(text.slice(0, 2000));
    if (results?.[0]?.detectedLanguage) {
      return results[0].detectedLanguage;
    }
  } catch (_e) { }
  return null;
}

const processingElements = new WeakSet<Element>();

async function translateElementOnDemand(element: Element): Promise<void> {
  if (!element) return;
  if ((element as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1') return;
  if (element.querySelector(`.${TRANSLATED_CLASS}`)) return;
  if (processingElements.has(element)) return;

  const { text, nodeMap } = getMarkedWithNodes(element);
  const isHeading = /^h[1-6]$/.test(element.tagName.toLowerCase());
  if (!text || text.length < (isHeading ? MIN_LENGTH_HEADING : MIN_LENGTH_GENERIC)) return;

  processingElements.add(element);

  let skeleton: HTMLElement | null = null;
  let skeletonRemoved = false;
  const skeletonTimeout = setTimeout(() => {
    if (skeletonRemoved) return;
    skeleton = createSkeletonPlaceholder(element);
    insertTranslationAdjacent(element, skeleton);
  }, SKELETON_DELAY_MS);

  const cleanupSkeleton = () => {
    skeletonRemoved = true;
    clearTimeout(skeletonTimeout);
    if (skeleton) {
      skeleton.remove();
      skeleton = null;
    }
  };

  try {
    const targetLanguage = await getPreferredTargetLanguage();
    let sourceLanguage = await detectLanguageForText(text);
    if (!sourceLanguage) {
      const htmlLang = document.documentElement.getAttribute('lang') || '';
      sourceLanguage = htmlLang || 'en';
    }

    if (isSameLanguage(sourceLanguage, targetLanguage)) {
      cleanupSkeleton();
      return;
    }

    let translator: TranslatorInstance | null;
    let lastPct = -1;
    try {
      translator = await getOrCreateTranslator(sourceLanguage, targetLanguage, (pct) => {
        if (pct !== lastPct) {
          lastPct = pct;
          // 如果骨架屏还没显示，下载进度触发时可以考虑立即显示它，或者保持延迟
          // 这里我们保持延迟，但更新状态
          const statusText = skeleton?.querySelector('.native-translate-skeleton__status-text');
          if (statusText) {
            statusText.textContent = tCS('overlay_downloading', [String(pct)]);
          }
        }
      });
    } catch (_e) {
      translator = null;
    }

    if (text.length >= STREAMING_LENGTH_THRESHOLD) {
      cleanupSkeleton();
      await translateIntoElementPreservingNewlines(
        element,
        translator,
        text,
        sourceLanguage,
        targetLanguage,
        nodeMap
      );
    } else {
      const cacheKey = buildCacheKey(text, sourceLanguage, targetLanguage);
      let translated = translationCache.get(cacheKey);
      if (!translated) {
        try {
          translated = await translateTextPreservingNewlines(
            translator,
            text,
            sourceLanguage,
            targetLanguage
          );
          translationCache.set(cacheKey, translated);
        } catch (_e) {
          translated = '';
        }
      }

      cleanupSkeleton();
      if (translated) {
        let content: string | DocumentFragment = translated;
        if (nodeMap.size > 0) {
          content = renderMarkedText(translated, nodeMap);
        }
        const clone = createTranslationSpan(element, content, targetLanguage);
        insertTranslationAdjacent(element, clone);
        (element as HTMLElement).setAttribute(TRANSLATED_ATTR, '1');
      }
    }
  } catch (err) {
    cleanupSkeleton();
    console.error('Translation failed', err);
  } finally {
    processingElements.delete(element);
  }
}

function initializeHoverAltTranslate(): void {
  if (window.__nativeTranslateHoverAltInit) return;
  window.__nativeTranslateHoverAltInit = true;

  let hoveredCandidate: Element | null = null;
  let altPressed = false;
  let ctrlPressed = false;
  let shiftPressed = false;
  let lastTriggered: Element | null = null;

  void (async () => {
    preferredModifier = await getHoverHotkeyModifier();
  })();

  addPopupSettingsObserver(() => {
    lastTriggered = null;
    tryTranslate();
  });

  const tryTranslate = () => {
    const shouldTrigger =
      (preferredModifier === 'alt' && altPressed) ||
      (preferredModifier === 'control' && ctrlPressed) ||
      (preferredModifier === 'shift' && shiftPressed);
    if (!shouldTrigger) return;
    if (isEditingContext()) return;
    if (!hoveredCandidate) return;
    if (hoveredCandidate === lastTriggered) return;
    lastTriggered = hoveredCandidate;
    void translateElementOnDemand(hoveredCandidate);
  };
  tryTranslateRef = tryTranslate;

  document.addEventListener(
    'mousemove',
    (e) => {
      const target = e.target as Element | null;
      if (target?.parentElement) {
        // 对附近的容器进行段落化预处理
        const container = target.closest('.prose, article, .blog-content, main');
        if (container) segmentAndWrapLooseContent(container);
      }

      hoveredCandidate = pickTranslatableBlockFromTarget(target);
      if (
        (preferredModifier === 'alt' && altPressed) ||
        (preferredModifier === 'control' && ctrlPressed) ||
        (preferredModifier === 'shift' && shiftPressed)
      ) {
        tryTranslate();
      }
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    'keydown',
    (e) => {
      altPressed = e.altKey || e.key === 'Alt' || altPressed;
      ctrlPressed = e.ctrlKey || e.key === 'Control' || ctrlPressed;
      shiftPressed = e.shiftKey || e.key === 'Shift' || shiftPressed;
      tryTranslate();
    },
    { capture: true }
  );

  document.addEventListener(
    'keyup',
    (e) => {
      if (e.key === 'Alt' || !e.altKey) altPressed = false;
      if (e.key === 'Control' || !e.ctrlKey) ctrlPressed = false;
      if (e.key === 'Shift' || !e.shiftKey) shiftPressed = false;
      lastTriggered = null;
    },
    { capture: true }
  );
}

initializeHoverAltTranslate();

// ========== 在可编辑文本中“三连空格”触发翻译 ==========

function isTextLikeInputElement(
  element: Element | null,
): element is HTMLInputElement | HTMLTextAreaElement {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase();
    // 仅对文本相关类型启用，避免破坏非文本输入
    const allowed = ['text', 'search', 'url', 'email', 'tel'];
    return allowed.includes(type);
  }
  return false;
}

function endsWithDoubleSpace(text: string): boolean {
  if (!text) return false;
  // 兼容不可断行空格 U+00A0
  const normalized = text.replace(/\u00A0/g, ' ');
  return normalized.endsWith('  ');
}

function getActiveContentEditableHost(): HTMLElement | null {
  const ae = document.activeElement as HTMLElement | null;
  if (!ae) return null;
  if (ae.isContentEditable) return ae;
  const host = ae.closest('[contenteditable=""], [contenteditable="true"]') as HTMLElement | null;
  return host || null;
}

async function translateFreeTextToPreferred(
  text: string,
): Promise<{
  translated: string;
  source: LanguageCode;
  target: LanguageCode;
} | null> {
  const clean = text;
  const targetLanguage = await getPreferredInputTargetLanguage();
  let sourceLanguage = await detectLanguageForText(clean);
  if (!sourceLanguage) {
    const htmlLang = document.documentElement.getAttribute('lang') || '';
    sourceLanguage = htmlLang || 'en';
  }
  if (isSameLanguage(sourceLanguage, targetLanguage)) {
    return null;
  }
  let translator: TranslatorInstance | null = null;
  try {
    translator = await getOrCreateTranslator(sourceLanguage, targetLanguage);
  } catch (_e) {
    translator = null; // 回退到桥翻译
  }
  const translated = await translateTextPreservingNewlines(
    translator,
    clean,
    sourceLanguage,
    targetLanguage
  );
  return { translated, source: sourceLanguage, target: targetLanguage };
}

const translatingFields = new WeakSet<Element>();
let isComposingIme = false;

function dispatchInputEvent(target: HTMLElement): void {
  try {
    target.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (_e) {
    // ignore
  }
}

async function handleTripleSpaceForInput(
  el: HTMLInputElement | HTMLTextAreaElement,
): Promise<void> {
  if (translatingFields.has(el)) return;
  translatingFields.add(el);
  try {
    let hintActive = false;
    let hintRemove: () => void = () => { };
    let hintUpdate: (text: string) => void = () => { };
    const hintTimer = window.setTimeout(() => {
      const h = showInlineHintNearElement(el, tCS('overlay_preparing'));
      hintActive = true;
      hintRemove = h.remove;
      hintUpdate = h.update;
    }, 400);
    const text = el.value;
    const res = await translateFreeTextToPreferred(text);
    window.clearTimeout(hintTimer);
    if (!res) {
      if (hintActive) hintRemove();
      return;
    }
    el.value = res.translated;
    // 将光标移至末尾
    try {
      const end = el.value.length;
      el.selectionStart = end;
      el.selectionEnd = end;
    } catch (_e) { }
    dispatchInputEvent(el);
    if (hintActive) {
      hintUpdate(tCS('overlay_translation_complete'));
      window.setTimeout(() => hintRemove(), 1000);
    }
  } finally {
    translatingFields.delete(el);
  }
}

async function handleTripleSpaceForContentEditable(host: HTMLElement): Promise<void> {
  if (translatingFields.has(host)) return;
  translatingFields.add(host);
  try {
    let hintActive = false;
    let hintRemove: () => void = () => { };
    let hintUpdate: (text: string) => void = () => { };
    const hintTimer = window.setTimeout(() => {
      const h = showInlineHintNearElement(host, tCS('overlay_preparing'));
      hintActive = true;
      hintRemove = h.remove;
      hintUpdate = h.update;
    }, 400);
    const text = host.innerText || host.textContent || '';
    const res = await translateFreeTextToPreferred(text);
    window.clearTimeout(hintTimer);
    if (!res) {
      if (hintActive) hintRemove();
      return;
    }
    host.textContent = res.translated;
    // 光标定位到末尾
    try {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(host);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (_e) { }
    dispatchInputEvent(host);
    if (hintActive) {
      hintUpdate(tCS('overlay_translation_complete'));
      window.setTimeout(() => hintRemove(), 1000);
    }
  } finally {
    translatingFields.delete(host);
  }
}

function initializeTripleSpaceEditingTranslate(): void {
  if (window.__nativeTripleSpaceInit) return;
  window.__nativeTripleSpaceInit = true;

  // 跟踪 IME 组合，避免在中文/日文输入法组合期间误触发
  document.addEventListener(
    'compositionstart',
    () => {
      isComposingIme = true;
    },
    { capture: true }
  );
  document.addEventListener(
    'compositionend',
    () => {
      isComposingIme = false;
    },
    { capture: true }
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (isComposingIme) return;
      // 仅在按下空格键时检测
      const isSpace = e.key === ' ' || e.code === 'Space' || e.key === 'Spacebar';
      if (!isSpace) return;

      const ae = document.activeElement as HTMLElement | null;
      if (!ae) return;

      if (isTextLikeInputElement(ae)) {
        const el = ae;
        // 仅在光标处于折叠状态且左侧正好有两个空格时触发
        const start = el.selectionStart;
        const end = el.selectionEnd;
        if (start === null || end === null || start !== end) return;
        const pos = start || 0;
        const left = el.value.slice(0, pos);
        if (!endsWithDoubleSpace(left)) return;
        // 阻止第三个空格插入，并移除前两个空格
        e.preventDefault();
        e.stopPropagation();
        el.value = el.value.slice(0, pos - 2) + el.value.slice(pos);
        try {
          el.selectionStart = pos - 2;
          el.selectionEnd = pos - 2;
        } catch (_e2) { }
        dispatchInputEvent(el);
        void handleTripleSpaceForInput(el);
        return;
      }

      const host = getActiveContentEditableHost();
      if (host) {
        // 对 contenteditable，若光标折叠且前文末尾为两个空格，则触发
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return;
        try {
          const pre = range.cloneRange();
          pre.setStart(host, 0);
          const beforeText = pre.toString();
          if (!endsWithDoubleSpace(beforeText)) return;
          e.preventDefault();
          e.stopPropagation();
          // 替换整体内容，无需额外删除两个空格（会被整体替换）
          void handleTripleSpaceForContentEditable(host);
        } catch (_err) {
          // 忽略异常，不触发
        }
      }
    },
    { capture: true }
  );
}

initializeTripleSpaceEditingTranslate();
