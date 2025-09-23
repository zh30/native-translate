import {
  DEFAULT_INPUT_TARGET_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
} from '@/shared/languages';
import {
  STREAMING_LENGTH_THRESHOLD,
  normalizeToAsyncStringIterable,
  TranslatorInstance,
} from '@/shared/streaming';
import { POPUP_SETTINGS_KEY } from '@/shared/settings';
import {
  MSG_TRANSLATE_PAGE,
  MSG_UPDATE_HOTKEY,
  MSG_TRANSLATE_TEXT,
  MSG_WARM_TRANSLATOR,
} from '@/shared/messages';

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

type OverlayElement = HTMLElement & {
  __nativeTranslateOverlayDesc?: HTMLElement;
  __nativeTranslateOverlayTitle?: HTMLElement;
  __nativeTranslateOverlayIcon?: HTMLElement;
  __nativeTranslateOverlayProgress?: HTMLElement;
};

type InlineHintElement = HTMLElement & {
  __nativeTranslateHintText?: HTMLElement;
  __nativeTranslateHintIcon?: HTMLElement;
};

type SurfaceState = 'info' | 'progress' | 'success' | 'warning';

const DESIGN_STYLE_ID = 'native-translate-design-system';
const DESIGN_SYSTEM_STYLES = `
:root {
  --nt-font-family: 'Inter', 'SF Pro Text', -apple-system, BlinkMacSystemFont,
    'Segoe UI', sans-serif;
  --nt-overlay-bg: rgba(255, 255, 255, 0.86);
  --nt-overlay-border: rgba(148, 163, 184, 0.28);
  --nt-overlay-fg: #0f172a;
  --nt-overlay-subtle: rgba(15, 23, 42, 0.55);
  --nt-overlay-accent: #2563eb;
  --nt-overlay-accent-strong: #4f46e5;
  --nt-overlay-success: #22c55e;
  --nt-overlay-warning: #f97316;
  --nt-overlay-error: #ef4444;
  --nt-progress-value: 0;
  --nt-progress-opacity: 0;
}

@media (prefers-color-scheme: dark) {
  :root {
    --nt-overlay-bg: rgba(15, 23, 42, 0.82);
    --nt-overlay-border: rgba(148, 163, 184, 0.28);
    --nt-overlay-fg: #e2e8f0;
    --nt-overlay-subtle: rgba(226, 232, 240, 0.65);
  }
}

.native-translate-overlay {
  position: fixed;
  top: 16px;
  inset-inline-end: 16px;
  z-index: 2147483647;
  pointer-events: none;
  font-family: var(--nt-font-family);
  animation: nt-fade-in 160ms ease-out;
  max-width: min(360px, calc(100vw - 32px));
}

.native-translate-overlay[data-dir='rtl'] {
  inset-inline-end: auto;
  inset-inline-start: 16px;
}

.native-translate-overlay__surface {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid var(--nt-overlay-border);
  background: var(--nt-overlay-bg);
  color: var(--nt-overlay-fg);
  box-shadow: 0 18px 58px rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.native-translate-overlay__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.native-translate-overlay[data-dir='rtl'] .native-translate-overlay__surface {
  flex-direction: row-reverse;
  text-align: right;
}

.native-translate-overlay[data-dir='rtl'] .native-translate-overlay__copy {
  text-align: right;
}

.native-translate-overlay__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--nt-overlay-accent), var(--nt-overlay-accent-strong));
  color: #ffffff;
  font-size: 16px;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
  animation: none;
}

.native-translate-overlay__title {
  margin: 0;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.01em;
}

.native-translate-overlay__desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--nt-overlay-subtle);
  white-space: pre-wrap;
}

.native-translate-overlay__progress {
  position: absolute;
  inset-inline: 12px;
  bottom: 6px;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--nt-overlay-accent), var(--nt-overlay-accent-strong));
  transform-origin: left;
  transform: scaleX(var(--nt-progress-value));
  opacity: var(--nt-progress-opacity);
  transition: transform 160ms ease, opacity 160ms ease;
}

.native-translate-overlay[data-dir='rtl'] .native-translate-overlay__progress {
  transform-origin: right;
}

.native-translate-overlay[data-state='success'] .native-translate-overlay__icon {
  background: linear-gradient(135deg, var(--nt-overlay-success), #15803d);
}

.native-translate-overlay[data-state='warning'] .native-translate-overlay__icon {
  background: linear-gradient(135deg, var(--nt-overlay-warning), #ea580c);
}

.native-translate-overlay[data-state='progress'] .native-translate-overlay__icon {
  background: linear-gradient(135deg, var(--nt-overlay-accent-strong), var(--nt-overlay-accent));
  animation: nt-spin 1s linear infinite;
}

.native-translate-overlay--exit {
  animation: nt-fade-out 140ms ease-in forwards;
}

.native-translate-inline-hint {
  position: fixed;
  z-index: 2147483647;
  pointer-events: none;
  animation: nt-fade-opacity 140ms ease-out;
}

.native-translate-inline-hint__surface {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: var(--nt-overlay-bg);
  color: var(--nt-overlay-fg);
  font-family: var(--nt-font-family);
  font-size: 11px;
  line-height: 1.4;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.native-translate-inline-hint[data-dir='rtl'] .native-translate-inline-hint__surface {
  flex-direction: row-reverse;
  text-align: right;
}

.native-translate-inline-hint__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.16);
  color: var(--nt-overlay-accent);
  font-size: 12px;
  flex-shrink: 0;
  animation: none;
}

.native-translate-inline-hint[data-state='success'] .native-translate-inline-hint__icon {
  background: rgba(34, 197, 94, 0.18);
  color: var(--nt-overlay-success);
}

.native-translate-inline-hint[data-state='warning'] .native-translate-inline-hint__icon {
  background: rgba(249, 115, 22, 0.18);
  color: var(--nt-overlay-warning);
}

.native-translate-inline-hint[data-state='progress'] .native-translate-inline-hint__icon {
  background: rgba(79, 70, 229, 0.18);
  color: var(--nt-overlay-accent-strong);
  animation: nt-spin 1s linear infinite;
}

.native-translate-inline-hint--exit {
  animation: nt-fade-out 140ms ease-in forwards;
}

@keyframes nt-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes nt-fade-opacity {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes nt-fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes nt-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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

function directResolveTranslatorAdapter(): TranslatorStaticAdapter | null {
  const w = window as any;
  const legacy = w?.Translator as TranslatorStatic | undefined;
  if (legacy && typeof legacy.create === 'function') {
    return { create: legacy.create.bind(legacy) };
  }
  const modern = w?.translation as
    | { createTranslator?: (opts: TranslatorCreateOptions) => Promise<TranslatorInstance> }
    | undefined;
  if (modern && typeof modern.createTranslator === 'function') {
    return { create: modern.createTranslator.bind(modern) };
  }
  return null;
}

async function resolveTranslatorAdapterWithRetry(
  maxWaitMs = 1200,
): Promise<TranslatorStaticAdapter | null> {
  const cacheKey = '__nativeTranslateAdapter';
  const cached = (window as any)[cacheKey] as TranslatorStaticAdapter | undefined;
  if (cached) return cached;
  let adapter = directResolveTranslatorAdapter();
  if (adapter) {
    (window as any)[cacheKey] = adapter;
    return adapter;
  }
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 150));
    adapter = directResolveTranslatorAdapter();
    if (adapter) {
      (window as any)[cacheKey] = adapter;
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
  script.textContent = `(() => {\n  if (window.__nativeTranslateBridgeInit) return;\n  window.__nativeTranslateBridgeInit = true;\n  const pool = new Map();\n  function directAdapter() {\n    const legacy = window.Translator;\n    if (legacy && typeof legacy.create === 'function') {\n      return { create: legacy.create.bind(legacy) };\n    }\n    const modern = window.translation;\n    if (modern && typeof modern.createTranslator === 'function') {\n      return { create: modern.createTranslator.bind(modern) };\n    }\n    return null;\n  }\n  async function getTranslator(source, target) {\n    const key = source + '->' + target;\n    if (pool.has(key)) return pool.get(key);\n    const adapter = directAdapter();\n    if (!adapter) throw new Error('Translator API unavailable');\n    const t = await adapter.create({ sourceLanguage: source, targetLanguage: target });\n    if (t && t.ready) {\n      try { await t.ready; } catch (e) {}\n    }\n    pool.set(key, t);\n    return t;\n  }\n  window.addEventListener('message', async (event) => {\n    const data = event && event.data;\n    if (!data || data.type !== '${BRIDGE_REQ_TYPE}') return;\n    try {\n      if (data.action === 'translate') {\n        const t = await getTranslator(data.source, data.target);\n        const out = await t.translate(data.text);\n        window.postMessage({ type: '${BRIDGE_RES_TYPE}', id: data.id, ok: true, result: out }, '*');\n      }\n    } catch (err) {\n      const msg = (err && (err.message || String(err))) || 'bridge_error';\n      window.postMessage({ type: '${BRIDGE_RES_TYPE}', id: data.id, ok: false, error: msg }, '*');\n    }\n  }, { capture: false });\n})();`;
  (document.documentElement || document.head || document.body || document).appendChild(script);
}

function initBridgeMessageChannel(): void {
  if (bridgeInitialized) return;
  bridgeInitialized = true;
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event?.data as BridgeResponse | undefined;
    if (!data || (data as any).type !== BRIDGE_RES_TYPE) return;
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
const OVERLAY_ID = 'native-translate-overlay';
const READY_PAIRS_KEY = 'nativeTranslate:readyPairs';
const DETECTOR_READY_KEY = 'nativeTranslate:detectorReady';
let tryTranslateRef: (() => void) | null = null;

// 文本长度阈值（可微调）：
// - 标题等短文本也希望被翻译
const MIN_LENGTH_GENERIC = 4;
const MIN_LENGTH_HEADING = 2; // h1-h6 允许 2 个字符

// 简单的内存缓存，避免相同文本重复翻译
const translationCache = new Map<string, string>();

function buildCacheKey(text: string, sourceLanguage: string, targetLanguage: string): string {
  return `${sourceLanguage}|${targetLanguage}|${text}`;
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

if (!(window as any).__nativeTranslatePopupSettingsSubscribed) {
  (window as any).__nativeTranslatePopupSettingsSubscribed = true;
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

function createOverlay(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  ensureDesignSystemStyles();
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'native-translate-overlay';
  overlay.style.setProperty('--nt-progress-value', '0');
  overlay.style.setProperty('--nt-progress-opacity', '0');
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  const surface = document.createElement('div');
  surface.className = 'native-translate-overlay__surface';

  const iconEl = document.createElement('span');
  iconEl.className = 'native-translate-overlay__icon';

  const copyWrap = document.createElement('div');
  copyWrap.className = 'native-translate-overlay__copy';

  const titleEl = document.createElement('p');
  titleEl.className = 'native-translate-overlay__title';
  titleEl.textContent = tCS('popup_title');

  const descEl = document.createElement('p');
  descEl.className = 'native-translate-overlay__desc';
  descEl.textContent = tCS('overlay_preparing');

  const progressEl = document.createElement('div');
  progressEl.className = 'native-translate-overlay__progress';

  copyWrap.append(titleEl, descEl);
  surface.append(iconEl, copyWrap, progressEl);
  overlay.append(surface);

  const overlayEl = overlay as OverlayElement;
  overlayEl.__nativeTranslateOverlayDesc = descEl;
  overlayEl.__nativeTranslateOverlayTitle = titleEl;
  overlayEl.__nativeTranslateOverlayIcon = iconEl;
  overlayEl.__nativeTranslateOverlayProgress = progressEl;

  const initialState = classifyMessage(descEl.textContent ?? '');
  overlay.dataset.state = initialState;
  iconEl.textContent = stateIcon(initialState);

  // 默认根据文档方向决定对齐位置
  const dir = document.documentElement.getAttribute('dir') || 'ltr';
  overlay.dataset.dir = dir;
  (document.body || document.documentElement).appendChild(overlay);
  return overlay;
}

function updateOverlay(overlay: HTMLElement, text: string): void {
  const overlayEl = overlay as OverlayElement;
  const desc = overlayEl.__nativeTranslateOverlayDesc;
  if (desc) {
    if (desc.textContent !== text) {
      desc.textContent = text;
    }
  } else if (overlay.textContent !== text) {
    overlay.textContent = text;
  }
  const state = classifyMessage(text);
  overlay.dataset.state = state;
  const icon = overlayEl.__nativeTranslateOverlayIcon;
  if (icon) {
    icon.textContent = stateIcon(state);
  }
  const fraction = extractProgressFraction(text);
  overlay.style.setProperty(
    '--nt-progress-value',
    fraction != null ? fraction.toFixed(3) : '0'
  );
  overlay.style.setProperty(
    '--nt-progress-opacity',
    fraction != null ? '1' : '0'
  );
}

function removeOverlay(): void {
  const el = document.getElementById(OVERLAY_ID);
  if (!el) return;
  el.classList.add('native-translate-overlay--exit');
  window.setTimeout(() => {
    el.remove();
  }, 160);
}

type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };

function runIdle(task: () => void, timeout = 1200): void {
  const idle = (window as any).requestIdleCallback as
    | ((callback: (deadline: IdleDeadline) => void, opts?: { timeout: number }) => number)
    | undefined;
  if (idle) {
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
          if (rects && rects.length) return rects[rects.length - 1];
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
    container.style.left = `${Math.round(clampedX)}px`;
    container.style.top = `${Math.round(clampedY)}px`;
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
  const inserted = Array.from(document.querySelectorAll(`.${TRANSLATED_CLASS}`));
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
    tag === 'textarea'
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
  // 避免表格相关结构，防止破坏表格布局
  if (element.closest('table,thead,tbody,tfoot,tr')) return false;
  if (element.closest(`.${TRANSLATED_CLASS}`)) return false;
  if ((element as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1') return false;
  // 若内部已包含翻译或已被标记处理，跳过，避免父子重复翻译
  if (element.querySelector(`.${TRANSLATED_CLASS}, [${TRANSLATED_ATTR}="1"]`)) return false;
  return true;
}

function hasBlockDescendants(element: Element): boolean {
  return (
    element.querySelector(
      [
        'article',
        'section',
        'p',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'ul',
        'ol',
        'dl',
        'table',
        'figure'
      ].join(',')
    ) !== null
  );
}

function getElementText(element: Element): string {
  // 使用 innerText 保留可见文本（排除 display:none 等）
  // 对 pre/code 等不处理以避免破坏代码样式
  const tag = element.tagName.toLowerCase();
  if (tag === 'code' || tag === 'pre' || tag === 'kbd' || tag === 'samp') return '';
  return (element as HTMLElement).innerText.trim();
}

function collectTranslatableBlocks(root: ParentNode): Array<{ element: Element; text: string }> {
  const selector = [
    'article',
    'section',
    'p',
    'li',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'dd',
    'dt',
    'figcaption',
    'summary',
    'div',
    'a',
    'button',
    'span'
  ].join(',');

  const elements = Array.from(root.querySelectorAll(selector));
  const results: Array<{ element: Element; text: string }> = [];
  for (const el of elements) {
    if (!shouldTranslateElement(el)) continue;
    if (!isElementVisible(el)) continue;
    const text = getElementText(el);
    const isHeading = /^h[1-6]$/.test(el.tagName.toLowerCase());
    if (text.length < (isHeading ? MIN_LENGTH_HEADING : MIN_LENGTH_GENERIC)) continue; // 过滤过短文本（放宽）
    // 对容器类元素，若内部还有明显的块级子元素，则跳过，避免破坏布局
    const tagLower = el.tagName.toLowerCase();
    // 将 blockquote 也视为容器：若内部仍有块级子元素，则跳过，避免与其子元素重复
    if (
      (tagLower === 'div' ||
        tagLower === 'section' ||
        tagLower === 'article' ||
        tagLower === 'blockquote') &&
      hasBlockDescendants(el)
    ) {
      continue;
    }
    // 对 div 再多一道词数阈值，减少噪声
    if (tagLower === 'div' && text.split(/\s+/g).length < 8) continue;
    // 对 span 仅接受无子元素的简单文本节点
    if (tagLower === 'span' && (el as HTMLElement).children.length > 0) continue;
    results.push({ element: el, text });
  }
  // 去重：仅保留“叶子”块（不包含其他候选元素的容器）
  const leafOnly = results.filter(
    (item) =>
      !results.some((other) => other !== item && item.element.contains(other.element))
  );
  return leafOnly;
}

function createTranslationSpan(
  original: Element,
  translatedText: string,
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
  span.textContent = translatedText;
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
  targetLanguage: LanguageCode
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
  items: Array<{ element: Element; text: string }>,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  onProgress: (done: number, total: number) => void
): Promise<void> {
  const total = items.length;
  let done = 0;
  const BATCH_SIZE = 20; // 插入时使用文档片段批量减少重排

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const inserts: Array<{ node: Element; element: Node }> = [];

    // 顺序翻译，遵循 API 的串行特性
    for (const { element, text } of batch) {
      const cacheKey = buildCacheKey(text, sourceLanguage, targetLanguage);
      let translated = translationCache.get(cacheKey);
      if (!translated) {
        // 翻译可能抛错，保持健壮性
        try {
          // 对特别长的段落，使用流式增量插入以提升体验
          if (text.length >= STREAMING_LENGTH_THRESHOLD) {
            await translateIntoElementPreservingNewlines(
              element,
              translator,
              text,
              sourceLanguage,
              targetLanguage
            );
            // 占位节点已写入译文，这里跳过统一 insert，直接标记与进度
            done += 1;
            onProgress(done, total);
            continue;
          }
          // 普通长度：一次性按行翻译后再统一插入
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

      if (translated) {
        const clone = createTranslationSpan(element, translated, targetLanguage);
        inserts.push({
          node: clone,
          element,
        });
        // 标记原始元素已处理，避免重复翻译
        (element as HTMLElement).setAttribute(TRANSLATED_ATTR, '1');
      }

      done += 1;
      onProgress(done, total);
    }

    // 统一插入：尽量靠近文字元素（如 a/button/span 后）
    for (const ins of inserts) {
      insertTranslationAdjacent(ins.element as Element, ins.node);
    }

    // 让出事件循环，避免长任务阻塞
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function getPairKey(sourceLanguage: LanguageCode, targetLanguage: LanguageCode): string {
  return `${sourceLanguage}->${targetLanguage}`;
}

async function markPairReady(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<void> {
  const key = getPairKey(sourceLanguage, targetLanguage);
  try {
    const storageNs: 'session' | 'local' =
      (chrome.storage as any).session ? 'session' : 'local';
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
    const storageNs: 'session' | 'local' =
      (chrome.storage as any).session ? 'session' : 'local';
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

  const pool = ((window as any).__nativeTranslatePool ||= new Map<string, TranslatorInstance>());
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
    sample += sample ? `\n${item.text}` : item.text;
    if (sample.length >= maxChars) break;
  }
  return sample.slice(0, maxChars);
}

async function getOrCreateLanguageDetector(
  onProgress?: (pct: number) => void,
): Promise<LanguageDetectorInstance> {
  const api = (window as any).LanguageDetector as LanguageDetectorStatic | undefined;
  if (!api) throw new Error('Language Detector API unavailable');
  const cacheKey = '__nativeLanguageDetector';
  const cached = (window as any)[cacheKey] as LanguageDetectorInstance | undefined;
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
  (window as any)[cacheKey] = detector;
  try {
    const storageNs: 'session' | 'local' =
      (chrome.storage as any).session ? 'session' : 'local';
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
  const api = (window as any).LanguageDetector as LanguageDetectorStatic | undefined;
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
  const overlay = createOverlay();

  // 不再因内容脚本世界缺少 API 而提前返回；
  // 若无法直接获取，将回退到主世界桥进行翻译。

  const knownReady = await wasPairReady(sourceLanguage, targetLanguage);
  updateOverlay(overlay, knownReady ? tCS('overlay_using_cached') : tCS('overlay_preparing'));
  let lastPct = -1;
  let translator: TranslatorInstance | null = null;
  try {
    translator = await getOrCreateTranslator(sourceLanguage, targetLanguage, (pct) => {
      if (pct !== lastPct) {
        updateOverlay(overlay, tCS('overlay_downloading', [String(pct)]));
        lastPct = pct;
      }
    });
  } catch (_err) {
    // 内容脚本世界无法访问时，退回桥翻译
    translator = null;
  }

  const blocks = collectTranslatableBlocks(document.body);
  if (blocks.length === 0) {
    updateOverlay(overlay, tCS('overlay_nothing_to_translate'));
    setTimeout(removeOverlay, 1500);
    return;
  }

  let lastTick = 0;
  await translateBlocksSequentially(
    translator,
    blocks,
    sourceLanguage,
    targetLanguage,
    (done, total) => {
      const now = Date.now();
      if (now - lastTick > 100) {
        const pct = Math.round((done / total) * 100);
        updateOverlay(
          overlay,
          tCS('overlay_translating', [String(pct), String(done), String(total)])
        );
        lastTick = now;
      }
    }
  );

  updateOverlay(overlay, tCS('overlay_translation_complete'));
  setTimeout(removeOverlay, 1500);
}

async function translateFullPageAutoDetect(targetLanguage: LanguageCode): Promise<void> {
  const overlay = createOverlay();
  const translatorApi = (window as any).Translator as TranslatorStatic | undefined;
  const detectorApi = (window as any).LanguageDetector as LanguageDetectorStatic | undefined;
  if (!translatorApi) {
    updateOverlay(overlay, tCS('overlay_api_unavailable'));
    setTimeout(removeOverlay, 3000);
    return;
  }

  // 检测源语言（显示下载进度）
  let lastPct = -1;
  if (detectorApi) {
    updateOverlay(overlay, tCS('overlay_preparing'));
  }
  const detection = await detectSourceLanguageForPage((pct) => {
    if (pct !== lastPct) {
      updateOverlay(overlay, tCS('overlay_downloading', [String(pct)]));
      lastPct = pct;
    }
  });

  const htmlLang = document.documentElement.getAttribute('lang') || '';
  const sourceLanguage = detection?.lang || htmlLang || 'en';

  // 如果源语言与目标语言一致，直接提示无需翻译
  if (isSameLanguage(sourceLanguage, targetLanguage)) {
    updateOverlay(overlay, tCS('overlay_nothing_to_translate'));
    setTimeout(removeOverlay, 1500);
    return;
  }

  // 切换目标语言需要清理旧翻译与标记，确保可以重新翻译
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
  return (
    tagLower === 'article' ||
    tagLower === 'section' ||
    tagLower === 'p' ||
    tagLower === 'li' ||
    tagLower === 'blockquote' ||
    tagLower === 'h1' ||
    tagLower === 'h2' ||
    tagLower === 'h3' ||
    tagLower === 'h4' ||
    tagLower === 'h5' ||
    tagLower === 'h6' ||
    tagLower === 'dd' ||
    tagLower === 'dt' ||
    tagLower === 'figcaption' ||
    tagLower === 'summary' ||
    tagLower === 'div'
  );
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
          if ((tagLower === 'div' || tagLower === 'section' || tagLower === 'article')) {
            if (hasBlockDescendants(node)) {
              // 继续向内找更具体的块级元素
            } else if (!(tagLower === 'div' && text.split(/\s+/g).length < 8)) {
              return node;
            }
          } else {
            return node;
          }
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
    if (results && results[0]?.detectedLanguage) {
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
  const text = getElementText(element);
  const isHeading = /^h[1-6]$/.test(element.tagName.toLowerCase());
  if (!text || text.length < (isHeading ? MIN_LENGTH_HEADING : MIN_LENGTH_GENERIC)) return;
  processingElements.add(element);
  try {
    const targetLanguage = await getPreferredTargetLanguage();
    let sourceLanguage = await detectLanguageForText(text);
    // 回退到 html lang 或英语
    if (!sourceLanguage) {
      const htmlLang = document.documentElement.getAttribute('lang') || '';
      sourceLanguage = htmlLang || 'en';
    }
    if (isSameLanguage(sourceLanguage, targetLanguage)) {
      return;
    }
    // 若模型未准备，显示与全文翻译一致的下载提示
    let overlay: HTMLElement | null = null;
    let lastPct = -1;
    const knownReady = await wasPairReady(sourceLanguage, targetLanguage);
    if (!knownReady) {
      overlay = createOverlay();
      updateOverlay(overlay, tCS('overlay_preparing'));
    }

    let translator: TranslatorInstance | null;
    try {
      translator = await getOrCreateTranslator(
        sourceLanguage,
        targetLanguage,
        overlay
          ? (pct) => {
            if (pct !== lastPct) {
              lastPct = pct;
              updateOverlay(overlay!, tCS('overlay_downloading', [String(pct)]));
            }
          }
          : undefined
      );
    } catch (_e) {
      // 回退到桥翻译（主世界）
      translator = null;
    }
    // 无论是否回退到桥翻译，都移除下载提示层（后续不再有下载进度）
    if (overlay) {
      removeOverlay();
      overlay = null;
    }
    // 对长段落采用流式逐行写入；否则一次性按行翻译
    if (text.length >= STREAMING_LENGTH_THRESHOLD) {
      await translateIntoElementPreservingNewlines(
        element,
        translator,
        text,
        sourceLanguage,
        targetLanguage
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
      if (translated) {
        const clone = createTranslationSpan(element, translated, targetLanguage);
        insertTranslationAdjacent(element, clone);
        (element as HTMLElement).setAttribute(TRANSLATED_ATTR, '1');
      }
    }
  } finally {
    processingElements.delete(element);
  }
}

function initializeHoverAltTranslate(): void {
  if ((window as any).__nativeTranslateHoverAltInit) return;
  (window as any).__nativeTranslateHoverAltInit = true;

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
      (el as any).selectionStart = end;
      (el as any).selectionEnd = end;
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
  if ((window as any).__nativeTripleSpaceInit) return;
  (window as any).__nativeTripleSpaceInit = true;

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
        const el = ae as HTMLInputElement | HTMLTextAreaElement;
        // 仅在光标处于折叠状态且左侧正好有两个空格时触发
        const start = (el as any).selectionStart as number | null;
        const end = (el as any).selectionEnd as number | null;
        if (start === null || end === null || start !== end) return;
        const pos = start || 0;
        const left = el.value.slice(0, pos);
        if (!endsWithDoubleSpace(left)) return;
        // 阻止第三个空格插入，并移除前两个空格
        e.preventDefault();
        e.stopPropagation();
        el.value = el.value.slice(0, pos - 2) + el.value.slice(pos);
        try {
          (el as any).selectionStart = pos - 2;
          (el as any).selectionEnd = pos - 2;
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
