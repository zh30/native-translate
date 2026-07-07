import { DEFAULT_INPUT_TARGET_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from '@/shared/languages'
import {
  MSG_TRANSLATE_PAGE,
  MSG_TRANSLATE_TEXT,
  MSG_UPDATE_HOTKEY,
  MSG_WARM_TRANSLATOR,
} from '@/shared/messages'
import { FIRST_RUN_STATUS_KEY, type FirstRunStatus, POPUP_SETTINGS_KEY } from '@/shared/settings'
import {
  STREAMING_LENGTH_THRESHOLD,
  type TranslatorInstance,
  normalizeToAsyncStringIterable,
} from '@/shared/streaming'
import { isRTLLanguage } from '@/utils/rtl'

function tCS(key: string, substitutions?: Array<string | number>): string {
  try {
    const value = chrome?.i18n?.getMessage?.(
      key,
      (substitutions ?? []) as unknown as string | string[],
    )
    return value || key
  } catch (_e) {
    return key
  }
}

// 语言代码：使用通用 BCP-47 字符串，兼容检测结果与翻译器要求
type LanguageCode = string

type PopoverMethodName = 'showPopover' | 'hidePopover' | 'togglePopover'
type PopoverMethod = (this: HTMLElement, ...args: unknown[]) => unknown

interface PopoverMethodPatch {
  methodName: PopoverMethodName
  original: PopoverMethod
  patch: PopoverMethod
}

interface InputValueDescriptorPatch {
  original: PropertyDescriptor
  patch: PropertyDescriptor
}

type InlineHintElement = HTMLElement & {
  __nativeTranslateHintText?: HTMLElement
  __nativeTranslateHintIcon?: HTMLElement
}

type SurfaceState = 'info' | 'progress' | 'success' | 'warning'

const DESIGN_STYLE_ID = 'native-translate-design-system'
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
`

function ensureDesignSystemStyles(): void {
  if (document.getElementById(DESIGN_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = DESIGN_STYLE_ID
  style.textContent = DESIGN_SYSTEM_STYLES
  ;(document.head || document.documentElement).appendChild(style)
}

function classifyMessage(message: string): SurfaceState {
  const lower = message.toLowerCase()
  if (
    lower.includes('error') ||
    lower.includes('fail') ||
    message.includes('失败') ||
    message.includes('错误')
  ) {
    return 'warning'
  }
  if (
    lower.includes('complete') ||
    lower.includes('done') ||
    message.includes('完成') ||
    message.includes('已完成')
  ) {
    return 'success'
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
    return 'progress'
  }
  return 'info'
}

function stateIcon(state: SurfaceState): string {
  switch (state) {
    case 'success':
      return '✓'
    case 'warning':
      return '!'
    case 'progress':
      return '⟳'
    default:
      return '🌐'
  }
}

function extractProgressFraction(message: string): number | null {
  const match = message.match(/(\d{1,3})%/)
  if (!match) return null
  const value = Number(match[1])
  if (Number.isNaN(value)) return null
  const clamped = Math.min(100, Math.max(0, value))
  return clamped / 100
}

interface TranslatorDownloadProgressEvent extends Event {
  loaded?: number // 0..1
}

interface TranslatorMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (e: TranslatorDownloadProgressEvent) => void,
  ) => void
}

interface TranslatorCreateOptions {
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  monitor?: (m: TranslatorMonitor) => void
}

interface TranslatorStatic {
  availability: (opts?: {
    sourceLanguage?: LanguageCode
    targetLanguage?: LanguageCode
  }) => Promise<'unknown' | 'available' | 'downloadable' | 'unavailable'>
  create: (opts: TranslatorCreateOptions) => Promise<TranslatorInstance>
}

// 适配不同浏览器实现（历史/新规范）：
// - 旧提案：window.Translator.create(...)
// - 新提案：window.translation.createTranslator(...)
type TranslatorStaticAdapter = {
  create: (opts: TranslatorCreateOptions) => Promise<TranslatorInstance>
}

type WindowTranslationAPI = {
  createTranslator?: (opts: TranslatorCreateOptions) => Promise<TranslatorInstance>
}

function directResolveTranslatorAdapter(): TranslatorStaticAdapter | null {
  const legacy = window.Translator
  if (legacy && typeof legacy.create === 'function') {
    return { create: legacy.create.bind(legacy) }
  }
  const modern = window.translation
  if (modern && typeof modern.createTranslator === 'function') {
    return { create: modern.createTranslator.bind(modern) }
  }
  return null
}

async function resolveTranslatorAdapterWithRetry(
  maxWaitMs = 1200,
): Promise<TranslatorStaticAdapter | null> {
  const cached = window.__nativeTranslateAdapter
  if (cached) return cached
  let adapter = directResolveTranslatorAdapter()
  if (adapter) {
    window.__nativeTranslateAdapter = adapter
    return adapter
  }
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 150))
    adapter = directResolveTranslatorAdapter()
    if (adapter) {
      window.__nativeTranslateAdapter = adapter
      return adapter
    }
  }
  return null
}

// ========= 主世界桥（page world bridge）=========
const BRIDGE_SCRIPT_ID = 'native-translate-bridge'
const BRIDGE_REQ_TYPE = '__NT_BRIDGE_REQ'
const BRIDGE_RES_TYPE = '__NT_BRIDGE_RES'

interface BridgeRequest {
  type: typeof BRIDGE_REQ_TYPE
  id: string
  action: 'translate'
  source: LanguageCode
  target: LanguageCode
  text: string
}

interface BridgeResponse {
  type: typeof BRIDGE_RES_TYPE
  id: string
  ok: boolean
  result?: string
  error?: string
}

let bridgeInitialized = false
const pendingBridgeResponses = new Map<string, (res: BridgeResponse) => void>()

function ensurePageBridgeInjected(): void {
  if (document.getElementById(BRIDGE_SCRIPT_ID)) return
  const script = document.createElement('script')
  script.id = BRIDGE_SCRIPT_ID
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
})(); `
  ;(document.documentElement || document.head || document.body || document).appendChild(script)
}

function initBridgeMessageChannel(): void {
  if (bridgeInitialized) return
  bridgeInitialized = true
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event?.data as BridgeResponse | undefined
    if (!data || data.type !== BRIDGE_RES_TYPE) return
    const handler = pendingBridgeResponses.get(data.id)
    if (handler) {
      pendingBridgeResponses.delete(data.id)
      handler(data)
    }
  })
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

async function bridgeTranslate(
  text: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<string> {
  const pairKey = getPairKey(sourceLanguage, targetLanguage)
  if (unavailableBridgePairs.has(pairKey)) {
    throw new Error('bridge_unavailable')
  }

  ensurePageBridgeInjected()
  initBridgeMessageChannel()
  const id = randomId()
  const payload: BridgeRequest = {
    type: BRIDGE_REQ_TYPE,
    id,
    action: 'translate',
    source: sourceLanguage,
    target: targetLanguage,
    text,
  }
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingBridgeResponses.delete(id)
      unavailableBridgePairs.add(pairKey)
      reject(new Error('bridge_timeout'))
    }, 10000)
    pendingBridgeResponses.set(id, (res) => {
      clearTimeout(timeout)
      if (res.ok && typeof res.result === 'string') {
        unavailableBridgePairs.delete(pairKey)
        resolve(res.result)
      } else {
        if ((res.error ?? '').toLowerCase().includes('unavailable')) {
          unavailableBridgePairs.add(pairKey)
        }
        reject(new Error(res.error || 'bridge_error'))
      }
    })
    window.postMessage(payload, '*')
  })
}

// Language Detector API 类型声明（参考文档 https://developer.chrome.com/docs/ai/language-detection?hl=zh-cn）
type AvailabilityState = 'unknown' | 'available' | 'downloadable' | 'unavailable'

interface LanguageDetectorDownloadProgressEvent extends Event {
  loaded?: number // 0..1
}

interface LanguageDetectorMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (e: LanguageDetectorDownloadProgressEvent) => void,
  ) => void
}

interface LanguageDetectionResult {
  detectedLanguage: string // BCP-47
  confidence: number // 0..1
}

interface LanguageDetectorInstance {
  detect: (text: string) => Promise<LanguageDetectionResult[]>
}

interface LanguageDetectorStatic {
  availability: () => Promise<AvailabilityState>
  create: (opts?: {
    monitor?: (m: LanguageDetectorMonitor) => void
  }) => Promise<LanguageDetectorInstance>
}

// 避免与其他文件的全局 Window 扩展冲突，这里不增强 Window 类型，使用 any 访问

// 运行时常量
const TRANSLATED_ATTR = 'data-native-translate-done'
const TRANSLATED_CLASS = 'native-translate-translation'
const TRANSLATED_PLACEHOLDER_ATTR = 'data-native-translate-placeholder-done'
const ORIGINAL_PLACEHOLDER_ATTR = 'data-native-translate-original-placeholder'
const TRANSLATED_TEXT_CONTENT_ATTR = 'data-native-translate-text-content-done'
const ORIGINAL_TEXT_CONTENT_ATTR = 'data-native-translate-original-text-content'
const TRANSLATED_DOCUMENT_TITLE_ATTR = 'data-native-translate-document-title-done'
const ORIGINAL_DOCUMENT_TITLE_ATTR = 'data-native-translate-original-document-title'
const IMPLICIT_OPTION_VALUE_ATTR = 'data-native-translate-implicit-option-value'
const TRANSLATABLE_TEXT_ATTRIBUTES = [
  'aria-braillelabel',
  'aria-brailleroledescription',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'title',
  'data-bs-content',
  'data-bs-original-title',
  'data-bs-title',
  'data-content',
  'data-intro',
  'data-original-title',
  'data-placeholder',
  'data-tip',
  'data-tippy-content',
  'data-tooltip',
  'data-tooltip-content',
  'alt',
  'label',
  'summary',
  'value',
] as const
const READY_PAIRS_KEY = 'nativeTranslate:readyPairs'
const DETECTOR_READY_KEY = 'nativeTranslate:detectorReady'
let tryTranslateRef: (() => void) | null = null

interface FullPageTranslationObserverState {
  attachShadowPatch?: typeof Element.prototype.attachShadow
  inputValueDescriptorPatch?: InputValueDescriptorPatch
  popoverMethodPatches?: PopoverMethodPatch[]
  pendingDocumentTitle: boolean
  observer: MutationObserver
  observedShadowRoots: WeakSet<ShadowRoot>
  originalAttachShadow?: typeof Element.prototype.attachShadow
  pendingRoots: Set<Element>
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  textareaValueDescriptorPatch?: InputValueDescriptorPatch
  timer: number | null
  translating: boolean
}

let fullPageTranslationObserver: FullPageTranslationObserverState | null = null

// 文本长度阈值（可微调）：
// - 标题等短文本也希望被翻译
const MIN_LENGTH_GENERIC = 4
const MIN_LENGTH_HEADING = 2 // h1-h6 允许 2 个字符

const MAX_TRANSLATION_CACHE_ENTRIES = 500
const MAX_LANGUAGE_DETECTION_CACHE_ENTRIES = 300
const MAX_TRANSLATOR_POOL_ENTRIES = 12
const MAX_READY_PAIR_ENTRIES = 24
const translationCache = new Map<string, string>()
const languageDetectionCache = new Map<string, LanguageCode | null>()
const pendingTranslationPromises = new Map<string, Promise<string>>()
const pendingLanguageDetectionPromises = new Map<string, Promise<LanguageCode | null>>()
const translatorCreationPromises = new Map<string, Promise<TranslatorInstance>>()
const unavailableBridgePairs = new Set<string>()
const SEGMENTED_ATTR = 'data-nt-segmented'
const WRAPPED_CLASS = 'native-translate-wrapped-segment'
const ARIA_TEXT_REFERENCE_ATTRIBUTES = [
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-labelledby',
]
const DYNAMIC_TRANSLATION_ATTRIBUTE_FILTER = [
  'aria-hidden',
  ...ARIA_TEXT_REFERENCE_ATTRIBUTES,
  ...TRANSLATABLE_TEXT_ATTRIBUTES,
  'aria-live',
  'class',
  'contenteditable',
  'data-no-translate',
  'data-notranslate',
  'data-translate',
  'data-bs-toggle',
  'data-toggle',
  'display',
  'hidden',
  'id',
  'inert',
  'list',
  'name',
  'opacity',
  'open',
  'placeholder',
  'popover',
  'role',
  'style',
  'translate',
  'type',
  'usemap',
  'visibility',
]
const VISIBILITY_STYLE_PROPERTY_PATTERN =
  /\b(display|visibility|content-visibility|opacity|clip|clip-path)\s*:/i
const VISUALLY_HIDDEN_CLASS_PATTERN = /\b(sr-only|visually-hidden|screen-reader-only)\b/i
const TRANSLATION_RELEVANT_CLASS_PATTERN =
  /\b(notranslate|skiptranslate|hidden|invisible|opacity-0|sr-only|visually-hidden|screen-reader-only)\b/i
const TRANSLATABLE_INPUT_VALUE_TYPES = new Set(['button', 'reset', 'submit'])
const SVG_METADATA_SELECTOR = 'svg title, svg desc'
const SVG_TEXT_CONTENT_SELECTOR = 'svg text, svg text tspan, svg text textPath, svg text a'
const TEXT_CONTENT_SELECTOR = `${SVG_METADATA_SELECTOR}, ${SVG_TEXT_CONTENT_SELECTOR}, option`

type TranslatableTextAttributeName = (typeof TRANSLATABLE_TEXT_ATTRIBUTES)[number]
const suppressedTranslatedAttributeMutations = new WeakMap<Element, Set<string>>()
const suppressedTranslatedInputValueSetters = new WeakSet<HTMLInputElement>()
const suppressedTranslatedTextContentMutations = new WeakSet<Element>()

function suppressNextTranslatedAttributeMutation(element: Element, attributeName: string): void {
  if (!fullPageTranslationObserver) return
  const suppressedAttributes = suppressedTranslatedAttributeMutations.get(element) ?? new Set()
  suppressedAttributes.add(attributeName)
  suppressedTranslatedAttributeMutations.set(element, suppressedAttributes)
}

function shouldIgnoreSuppressedTranslatedAttributeMutation(mutation: MutationRecord): boolean {
  if (!(mutation.target instanceof Element) || !mutation.attributeName) return false
  const suppressedAttributes = suppressedTranslatedAttributeMutations.get(mutation.target)
  if (!suppressedAttributes?.has(mutation.attributeName)) return false
  suppressedAttributes.delete(mutation.attributeName)
  if (suppressedAttributes.size === 0) {
    suppressedTranslatedAttributeMutations.delete(mutation.target)
  }
  return true
}

function suppressNextTranslatedTextContentMutation(element: Element): void {
  if (!fullPageTranslationObserver) return
  suppressedTranslatedTextContentMutations.add(element)
}

function shouldIgnoreSuppressedTranslatedTextContentMutation(mutation: MutationRecord): boolean {
  const element =
    mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
  if (!element || !suppressedTranslatedTextContentMutations.has(element)) return false
  suppressedTranslatedTextContentMutations.delete(element)
  return true
}

function getOriginalTextAttributeMarker(attributeName: TranslatableTextAttributeName): string {
  return `data-native-translate-original-${attributeName}`
}

function getTranslatedTextAttributeMarker(attributeName: TranslatableTextAttributeName): string {
  return `data-native-translate-${attributeName}-done`
}

function isTranslatableTextAttributeName(
  attributeName: string | null,
): attributeName is TranslatableTextAttributeName {
  return TRANSLATABLE_TEXT_ATTRIBUTES.includes(attributeName as TranslatableTextAttributeName)
}

function getTranslatableTextAttributeSelector(
  attributeName: TranslatableTextAttributeName,
): string {
  if (attributeName === 'label') return 'option[label], optgroup[label], track[label]'
  if (attributeName === 'summary') return 'table[summary]'
  if (attributeName === 'value') {
    return 'input[value], input[type="button" i], input[type="reset" i], input[type="submit" i]'
  }
  return `[${attributeName}]`
}

function isTranslatableTextAttributeElement(
  element: Element,
  attributeName: TranslatableTextAttributeName,
): boolean {
  if (attributeName === 'data-placeholder') {
    return (
      hasEditableContentAttribute(element) ||
      hasRoleToken(getRoleTokens(element), new Set(['textbox']))
    )
  }
  if (attributeName === 'data-content' || attributeName === 'data-bs-content') {
    const legacyToggle = element.getAttribute('data-toggle')?.trim().toLowerCase()
    const bootstrapToggle = element.getAttribute('data-bs-toggle')?.trim().toLowerCase()
    return legacyToggle === 'popover' || bootstrapToggle === 'popover'
  }
  if (attributeName === 'label') {
    return (
      element instanceof HTMLOptionElement ||
      element instanceof HTMLOptGroupElement ||
      element instanceof HTMLTrackElement
    )
  }
  if (attributeName === 'summary') return element instanceof HTMLTableElement
  if (attributeName !== 'value') return true
  if (!(element instanceof HTMLInputElement)) return false
  return TRANSLATABLE_INPUT_VALUE_TYPES.has((element.type || 'text').toLowerCase())
}

function getMediaForTrackElement(track: HTMLTrackElement): HTMLMediaElement | null {
  const media = track.parentElement
  return media instanceof HTMLMediaElement ? media : null
}

function hasMediaTrackLabelElement(element: Element): boolean {
  return (
    element instanceof HTMLTrackElement ||
    element.querySelector('audio track[label], video track[label], track[label]') !== null
  )
}

function getImagesForAreaElement(area: HTMLAreaElement): HTMLImageElement[] {
  const map = area.closest('map')
  const mapName = map?.getAttribute('name')
  if (!map || !mapName) return []
  const root = map.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return []
  return Array.from(root.querySelectorAll<HTMLImageElement>('img[usemap]')).filter(
    (candidate) => normalizeUseMapName(candidate.getAttribute('usemap')) === mapName,
  )
}

function isVisibleTranslatableImageMapImage(image: HTMLImageElement): boolean {
  return !isTranslationOptOutElement(image) && isElementVisible(image)
}

function hasVisibleTranslatableImageMapImage(area: HTMLAreaElement): boolean {
  return getImagesForAreaElement(area).some(isVisibleTranslatableImageMapImage)
}

function getInputsForDatalistElement(datalist: HTMLDataListElement): HTMLInputElement[] {
  const listId = datalist.id
  if (!listId) return []
  const root = datalist.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return []
  return Array.from(root.querySelectorAll<HTMLInputElement>('input[list]')).filter(
    (candidate) => candidate.getAttribute('list') === listId,
  )
}

function isVisibleTranslatableDatalistInput(input: HTMLInputElement): boolean {
  return !isTranslationOptOutElement(input) && isElementVisible(input)
}

function hasVisibleTranslatableDatalistInput(datalist: HTMLDataListElement): boolean {
  return getInputsForDatalistElement(datalist).some(isVisibleTranslatableDatalistInput)
}

function isTranslatableTextAttributeVisible(
  element: Element,
  attributeName: TranslatableTextAttributeName,
): boolean {
  if (attributeName === 'label') {
    if (element instanceof HTMLTrackElement) {
      const media = getMediaForTrackElement(element)
      return media instanceof HTMLMediaElement && isElementVisible(media)
    }
    const select = element.closest('select')
    if (select instanceof HTMLSelectElement) return isElementVisible(select)
    const datalist = element.closest('datalist')
    if (!(datalist instanceof HTMLDataListElement)) return false
    return hasVisibleTranslatableDatalistInput(datalist)
  }
  if (element instanceof HTMLAreaElement) {
    return hasVisibleTranslatableImageMapImage(element)
  }
  return isElementVisible(element)
}

function isTranslatableTextAttributeHiddenOrOptedOut(
  element: Element,
  attributeName: TranslatableTextAttributeName,
): boolean {
  if (element instanceof HTMLAreaElement) {
    if (isTranslationOptOutElement(element)) return true
    return !hasVisibleTranslatableImageMapImage(element)
  }

  if (attributeName !== 'label') {
    return isHiddenFromTranslation(element) || isTranslationOptOutElement(element)
  }

  if (element instanceof HTMLTrackElement) {
    const media = getMediaForTrackElement(element)
    return (
      !(media instanceof HTMLMediaElement) ||
      isHiddenFromTranslation(media) ||
      isTranslationOptOutElement(media) ||
      isTranslationOptOutElement(element)
    )
  }

  const select = element.closest('select')
  if (select instanceof HTMLSelectElement) {
    return (
      isHiddenFromTranslation(element) ||
      isHiddenFromTranslation(select) ||
      isTranslationOptOutElement(element) ||
      isTranslationOptOutElement(select)
    )
  }

  const datalist = element.closest('datalist')

  return (
    isTranslationOptOutElement(element) ||
    !(datalist instanceof HTMLDataListElement) ||
    !hasVisibleTranslatableDatalistInput(datalist)
  )
}

function setTranslatableTextAttribute(
  element: Element,
  attributeName: TranslatableTextAttributeName,
  value: string,
): void {
  element.setAttribute(attributeName, value)
  if (attributeName === 'value' && element instanceof HTMLInputElement) {
    const suppressSetter = Boolean(fullPageTranslationObserver?.inputValueDescriptorPatch)
    if (suppressSetter) suppressedTranslatedInputValueSetters.add(element)
    try {
      element.value = value
    } finally {
      if (suppressSetter) suppressedTranslatedInputValueSetters.delete(element)
    }
  }
}

function getTranslatableTextAttributeValue(
  element: Element,
  attributeName: TranslatableTextAttributeName,
): string | null {
  if (attributeName === 'value' && element instanceof HTMLInputElement) {
    return element.value
  }
  return element.getAttribute(attributeName)
}

function clearTranslatedAttributeMarkersAfterExternalMutation(
  element: Element,
  attributeName: string | null,
): void {
  if (attributeName === 'type' && element instanceof HTMLInputElement) {
    restoreTranslatedTextAttributes(element)
    return
  }

  if (attributeName === 'placeholder') {
    ;(element as HTMLElement).removeAttribute(ORIGINAL_PLACEHOLDER_ATTR)
    ;(element as HTMLElement).removeAttribute(TRANSLATED_PLACEHOLDER_ATTR)
    return
  }

  if (attributeName === 'value' && isOptionTextContentElement(element)) {
    element.removeAttribute(IMPLICIT_OPTION_VALUE_ATTR)
  }

  if (!isTranslatableTextAttributeName(attributeName)) return
  ;(element as HTMLElement).removeAttribute(getOriginalTextAttributeMarker(attributeName))
  ;(element as HTMLElement).removeAttribute(getTranslatedTextAttributeMarker(attributeName))
}

function clearTranslatedTextContentMarkersAfterExternalMutation(element: Element): void {
  if (!isTranslatableTextContentElement(element)) return
  if (isOptionTextContentElement(element) && element.hasAttribute(IMPLICIT_OPTION_VALUE_ATTR)) {
    element.removeAttribute('value')
    element.removeAttribute(IMPLICIT_OPTION_VALUE_ATTR)
  }
  element.removeAttribute(ORIGINAL_TEXT_CONTENT_ATTR)
  element.removeAttribute(TRANSLATED_TEXT_CONTENT_ATTR)
}

function buildCacheKey(text: string, sourceLanguage: string, targetLanguage: string): string {
  return `${sourceLanguage}\u0000${targetLanguage}\u0000${text}`
}

function getCachedTranslation(cacheKey: string): string | undefined {
  const cached = translationCache.get(cacheKey)
  if (cached === undefined) return undefined
  translationCache.delete(cacheKey)
  translationCache.set(cacheKey, cached)
  return cached
}

function setCachedTranslation(cacheKey: string, translated: string): void {
  if (translationCache.has(cacheKey)) {
    translationCache.delete(cacheKey)
  }
  translationCache.set(cacheKey, translated)

  while (translationCache.size > MAX_TRANSLATION_CACHE_ENTRIES) {
    const oldestKey = translationCache.keys().next().value
    if (oldestKey === undefined) break
    translationCache.delete(oldestKey)
  }
}

function getTranslationCacheSize(): number {
  return translationCache.size
}

function getLanguageDetectionCacheKey(text: string): string {
  const sample = getLanguageDetectionSample(text)
  if (sample.length === text.length) return sample
  return `${text.length}|${hashTextForCacheKey(text)}|${sample}`
}

function getLanguageDetectionSample(text: string): string {
  return text.slice(0, 2000)
}

function hashTextForCacheKey(text: string): string {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0
  }
  return hash.toString(36)
}

function getCachedLanguageDetection(text: string): LanguageCode | null | undefined {
  const cacheKey = getLanguageDetectionCacheKey(text)
  if (!languageDetectionCache.has(cacheKey)) return undefined
  const cached = languageDetectionCache.get(cacheKey) ?? null
  languageDetectionCache.delete(cacheKey)
  languageDetectionCache.set(cacheKey, cached)
  return cached
}

function setCachedLanguageDetection(text: string, language: LanguageCode | null): void {
  const cacheKey = getLanguageDetectionCacheKey(text)
  if (languageDetectionCache.has(cacheKey)) {
    languageDetectionCache.delete(cacheKey)
  }
  languageDetectionCache.set(cacheKey, language)

  while (languageDetectionCache.size > MAX_LANGUAGE_DETECTION_CACHE_ENTRIES) {
    const oldestKey = languageDetectionCache.keys().next().value
    if (oldestKey === undefined) break
    languageDetectionCache.delete(oldestKey)
  }
}

interface PopupSettings {
  targetLanguage: LanguageCode
  hotkeyModifier?: 'alt' | 'control' | 'shift'
  inputTargetLanguage?: LanguageCode
}

const DEFAULT_POPUP_SETTINGS: PopupSettings = {
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  hotkeyModifier: 'alt',
  inputTargetLanguage: DEFAULT_INPUT_TARGET_LANGUAGE,
}

const SKELETON_DELAY_MS = 300

let cachedPopupSettings: PopupSettings = { ...DEFAULT_POPUP_SETTINGS }
let popupSettingsHydrated = false
let popupSettingsInitPromise: Promise<void> | null = null
const popupSettingsObservers = new Set<(settings: PopupSettings) => void>()
let preferredModifier: 'alt' | 'control' | 'shift' = DEFAULT_POPUP_SETTINGS.hotkeyModifier ?? 'alt'

function applyPopupSettings(settings: PopupSettings | undefined): void {
  const next = { ...DEFAULT_POPUP_SETTINGS, ...(settings ?? {}) }
  cachedPopupSettings = next
  preferredModifier = next.hotkeyModifier ?? 'alt'
  for (const observer of popupSettingsObservers) {
    try {
      observer(next)
    } catch (error) {
      console.warn('popup settings observer failed', error)
    }
  }
}

function addPopupSettingsObserver(observer: (settings: PopupSettings) => void): () => void {
  popupSettingsObservers.add(observer)
  return () => popupSettingsObservers.delete(observer)
}

async function ensurePopupSettings(): Promise<PopupSettings> {
  if (popupSettingsHydrated) return cachedPopupSettings
  if (!popupSettingsInitPromise) {
    popupSettingsInitPromise = chrome.storage.local
      .get(POPUP_SETTINGS_KEY)
      .then((data) => {
        const settings = data?.[POPUP_SETTINGS_KEY] as PopupSettings | undefined
        applyPopupSettings(settings)
        popupSettingsHydrated = true
      })
      .catch((error) => {
        console.warn('Failed to load popup settings', error)
        applyPopupSettings(undefined)
        popupSettingsHydrated = true
      })
      .finally(() => {
        popupSettingsInitPromise = null
      })
  }
  await popupSettingsInitPromise
  return cachedPopupSettings
}

if (!window.__nativeTranslatePopupSettingsSubscribed) {
  window.__nativeTranslatePopupSettingsSubscribed = true
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return
      const entry = changes?.[POPUP_SETTINGS_KEY]
      if (!entry) return
      applyPopupSettings(entry.newValue as PopupSettings | undefined)
      popupSettingsHydrated = true
    })
  } catch (error) {
    console.warn('Failed to subscribe to popup settings changes', error)
  }
}

void ensurePopupSettings()

async function getPreferredTargetLanguage(): Promise<LanguageCode> {
  const settings = await ensurePopupSettings()
  return settings.targetLanguage
}

async function getPreferredInputTargetLanguage(): Promise<LanguageCode> {
  const settings = await ensurePopupSettings()
  return settings.inputTargetLanguage ?? DEFAULT_INPUT_TARGET_LANGUAGE
}

async function getHoverHotkeyModifier(): Promise<'alt' | 'control' | 'shift'> {
  const settings = await ensurePopupSettings()
  const value = settings.hotkeyModifier ?? 'alt'
  return value === 'control' || value === 'shift' ? value : 'alt'
}

function runIdle(task: () => void, timeout = 1200): void {
  const idle = window.requestIdleCallback
  if (typeof idle === 'function') {
    idle(
      () => {
        try {
          task()
        } catch (error) {
          console.warn('idle task failed', error)
        }
      },
      { timeout },
    )
    return
  }
  window.setTimeout(
    () => {
      try {
        task()
      } catch (error) {
        console.warn('timeout task failed', error)
      }
    },
    Math.min(timeout, 500),
  )
}

const warmingPairs = new Set<string>()

async function updateFirstRunStatus(status: FirstRunStatus): Promise<void> {
  try {
    await chrome.storage.local.set({ [FIRST_RUN_STATUS_KEY]: status })
  } catch (_e) {
    // Status reporting must never block translation.
  }
}

declare global {
  interface Window {
    Translator?: TranslatorStatic
    translation?: WindowTranslationAPI
    LanguageDetector?: LanguageDetectorStatic
    __nativeTranslateAdapter?: TranslatorStaticAdapter
    __nativeLanguageDetector?: LanguageDetectorInstance
    __nativeTranslatePool?: Map<string, TranslatorInstance>
    __nativeTranslatePopupSettingsSubscribed?: boolean
    __nativeTranslateHoverAltInit?: boolean
    __nativeTranslateHoverAltGeneration?: number
    __nativeTripleSpaceInit?: boolean
  }
}

async function scheduleWarmTranslatorPair(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<void> {
  if (isSameLanguage(sourceLanguage, targetLanguage)) return
  const key = getPairKey(sourceLanguage, targetLanguage)
  if (warmingPairs.has(key)) return
  warmingPairs.add(key)

  const execute = async () => {
    try {
      const ready = await wasPairReady(sourceLanguage, targetLanguage)
      if (ready) {
        await updateFirstRunStatus({
          status: 'ready',
          sourceLanguage,
          targetLanguage,
          updatedAt: Date.now(),
        })
        return
      }
      await updateFirstRunStatus({
        status: 'preparing',
        sourceLanguage,
        targetLanguage,
        updatedAt: Date.now(),
      })
      await getOrCreateTranslator(sourceLanguage, targetLanguage, (progress) => {
        void updateFirstRunStatus({
          status: 'downloading',
          progress,
          sourceLanguage,
          targetLanguage,
          updatedAt: Date.now(),
        })
      })
      await updateFirstRunStatus({
        status: 'ready',
        sourceLanguage,
        targetLanguage,
        updatedAt: Date.now(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await updateFirstRunStatus({
        status: /Translator API unavailable/i.test(message) ? 'unsupported' : 'failed',
        sourceLanguage,
        targetLanguage,
        updatedAt: Date.now(),
        error: message,
      })
      console.warn('warm translator failed', error)
    } finally {
      warmingPairs.delete(key)
    }
  }

  runIdle(() => {
    void execute()
  })
}

function inferDocumentLanguage(): LanguageCode {
  const htmlLang = document.documentElement.getAttribute('lang')?.trim()
  if (htmlLang) {
    if (primarySubtag(htmlLang) === 'zh') return htmlLang as LanguageCode
    const normalized = primarySubtag(htmlLang)
    if (normalized) return normalized as LanguageCode
    return htmlLang as LanguageCode
  }
  const nav = navigator.language?.toLowerCase()
  if (nav) {
    if (primarySubtag(nav) === 'zh') return nav as LanguageCode
    const normalized = primarySubtag(nav)
    if (normalized) return normalized as LanguageCode
    return nav as LanguageCode
  }
  return DEFAULT_INPUT_TARGET_LANGUAGE
}

// 针对输入框/可编辑区域的行内提示（靠近光标或元素末尾）
type InlineHint = { update: (text: string) => void; remove: () => void }

function getCaretRectForElement(element: Element): DOMRect | null {
  // 仅对可编辑区域尝试使用光标矩形
  const isContentEditableHost = (element as HTMLElement).isContentEditable
  if (isContentEditableHost) {
    try {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const range = sel.getRangeAt(0)
        if (element.contains(range.startContainer)) {
          const rect = range.getBoundingClientRect()
          if (rect && (rect.width || rect.height)) return rect
          const rects = range.getClientRects()
          if (rects.length > 0) return rects[rects.length - 1]
        }
      }
    } catch (_e) {}
  }
  return null
}

function getInheritedTextDirection(element: Element): 'ltr' | 'rtl' {
  let current: Element | null = element
  while (current) {
    const dir = current.getAttribute('dir')?.trim().toLowerCase()
    if (dir === 'rtl' || dir === 'ltr') return dir
    if (current instanceof HTMLElement) {
      const styleDirection = window.getComputedStyle(current).direction
      if (styleDirection === 'rtl' || styleDirection === 'ltr') return styleDirection
    }
    current = getComposedParentElement(current)
  }

  const documentDir = document.documentElement.getAttribute('dir')?.trim().toLowerCase()
  return documentDir === 'rtl' ? 'rtl' : 'ltr'
}

function showInlineHintNearElement(element: Element, initialText: string): InlineHint {
  ensureDesignSystemStyles()
  const container = document.createElement('div')
  container.className = 'native-translate-inline-hint'
  container.setAttribute('role', 'status')
  container.setAttribute('aria-live', 'polite')
  container.style.position = 'fixed'
  container.style.zIndex = '2147483647'
  container.style.pointerEvents = 'none'

  const surface = document.createElement('div')
  surface.className = 'native-translate-inline-hint__surface'

  const iconEl = document.createElement('span')
  iconEl.className = 'native-translate-inline-hint__icon'

  const textEl = document.createElement('span')
  textEl.className = 'native-translate-inline-hint__text'
  textEl.textContent = initialText

  surface.append(iconEl, textEl)
  container.append(surface)

  const hintEl = container as InlineHintElement
  hintEl.__nativeTranslateHintText = textEl
  hintEl.__nativeTranslateHintIcon = iconEl

  const dir = getInheritedTextDirection(element)
  container.dataset.dir = dir

  const applyState = (message: string) => {
    const state = classifyMessage(message)
    container.dataset.state = state
    if (iconEl) {
      iconEl.textContent = stateIcon(state)
    }
  }

  applyState(initialText)

  const reposition = () => {
    const caretRect = getCaretRectForElement(element)
    const base = caretRect || element.getBoundingClientRect()
    const clampedX = Math.min(
      window.innerWidth - 8,
      Math.max(8, dir === 'rtl' ? base.left : base.right),
    )
    const clampedY = Math.min(window.innerHeight - 8, Math.max(8, base.top))
    container.style.left = `${Math.round(clampedX)}px`
    container.style.top = `${Math.round(clampedY)}px`
    const transform = dir === 'rtl' ? 'translate(6px, -110%)' : 'translate(-100%, -110%)'
    container.style.transform = transform
    container.style.transformOrigin = dir === 'rtl' ? 'top left' : 'top right'
  }
  ;(document.body || document.documentElement).appendChild(container)
  reposition()

  const onScroll = () => reposition()
  const onResize = () => reposition()
  const onSelection = () => reposition()
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onResize)
  document.addEventListener('selectionchange', onSelection)

  return {
    update(text: string) {
      const hint = container as InlineHintElement
      if (hint.__nativeTranslateHintText) {
        hint.__nativeTranslateHintText.textContent = text
      } else {
        container.textContent = text
      }
      applyState(text)
      reposition()
    },
    remove() {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('selectionchange', onSelection)
      if (!container.isConnected) return
      container.classList.add('native-translate-inline-hint--exit')
      window.setTimeout(() => {
        container.remove()
      }, 160)
    },
  }
}

function restoreTranslatedPlaceholder(element: Element): void {
  const original = element.getAttribute(ORIGINAL_PLACEHOLDER_ATTR)
  if (original !== null) {
    suppressNextTranslatedAttributeMutation(element, 'placeholder')
    element.setAttribute('placeholder', original)
  }
  ;(element as HTMLElement).removeAttribute(ORIGINAL_PLACEHOLDER_ATTR)
  ;(element as HTMLElement).removeAttribute(TRANSLATED_PLACEHOLDER_ATTR)
}

function restoreTranslatedTextAttributes(element: Element): void {
  for (const attributeName of TRANSLATABLE_TEXT_ATTRIBUTES) {
    const originalMarker = getOriginalTextAttributeMarker(attributeName)
    const original = element.getAttribute(originalMarker)
    if (original === null) continue
    suppressNextTranslatedAttributeMutation(element, attributeName)
    setTranslatableTextAttribute(element, attributeName, original)
    ;(element as HTMLElement).removeAttribute(originalMarker)
    ;(element as HTMLElement).removeAttribute(getTranslatedTextAttributeMarker(attributeName))
  }
}

function restoreTranslatedTextContent(element: Element): void {
  const original = element.getAttribute(ORIGINAL_TEXT_CONTENT_ATTR)
  if (original !== null) {
    suppressNextTranslatedTextContentMutation(element)
    element.textContent = original
  }
  if (isOptionTextContentElement(element) && element.hasAttribute(IMPLICIT_OPTION_VALUE_ATTR)) {
    element.removeAttribute('value')
    element.removeAttribute(IMPLICIT_OPTION_VALUE_ATTR)
  }
  element.removeAttribute(ORIGINAL_TEXT_CONTENT_ATTR)
  element.removeAttribute(TRANSLATED_TEXT_CONTENT_ATTR)
}

function getDocumentTitleElement(): HTMLTitleElement | null {
  return document.querySelector('head > title')
}

function getDocumentTitleText(): string {
  return document.title.trim()
}

function shouldTranslateDocumentTitle(): boolean {
  const title = getDocumentTitleElement()
  const text = getDocumentTitleText()
  return Boolean(
    title &&
      title.getAttribute(TRANSLATED_DOCUMENT_TITLE_ATTR) !== '1' &&
      text.length >= MIN_LENGTH_GENERIC,
  )
}

function restoreTranslatedDocumentTitle(): void {
  const title = getDocumentTitleElement()
  if (!title) return

  const original = title.getAttribute(ORIGINAL_DOCUMENT_TITLE_ATTR)
  if (original !== null) {
    suppressNextTranslatedTextContentMutation(title)
    document.title = original
  }
  title.removeAttribute(ORIGINAL_DOCUMENT_TITLE_ATTR)
  title.removeAttribute(TRANSLATED_DOCUMENT_TITLE_ATTR)
}

function clearTranslatedDocumentTitleMarkersAfterExternalMutation(): void {
  const title = getDocumentTitleElement()
  if (!title) return
  title.removeAttribute(ORIGINAL_DOCUMENT_TITLE_ATTR)
  title.removeAttribute(TRANSLATED_DOCUMENT_TITLE_ATTR)
}

function clearPreviousTranslationsAndMarks(): void {
  restoreTranslatedDocumentTitle()

  const clearRoot = (root: ParentNode): void => {
    const inserted = Array.from(
      root.querySelectorAll(`.${TRANSLATED_CLASS}, .native-translate-skeleton`),
    )
    for (const el of inserted) {
      el.remove()
    }
    const marked = Array.from(root.querySelectorAll(`[${TRANSLATED_ATTR}="1"]`))
    for (const el of marked) {
      ;(el as HTMLElement).removeAttribute(TRANSLATED_ATTR)
    }

    const translatedPlaceholders = Array.from(
      root.querySelectorAll(`[${ORIGINAL_PLACEHOLDER_ATTR}]`),
    )
    for (const el of translatedPlaceholders) {
      restoreTranslatedPlaceholder(el)
    }

    for (const attributeName of TRANSLATABLE_TEXT_ATTRIBUTES) {
      const translatedAttributes = Array.from(
        root.querySelectorAll(`[${getOriginalTextAttributeMarker(attributeName)}]`),
      )
      for (const el of translatedAttributes) {
        restoreTranslatedTextAttributes(el)
      }
    }

    const translatedTextContent = Array.from(
      root.querySelectorAll(`[${ORIGINAL_TEXT_CONTENT_ATTR}]`),
    )
    for (const el of translatedTextContent) {
      restoreTranslatedTextContent(el)
    }

    const segmented = Array.from(root.querySelectorAll(`[${SEGMENTED_ATTR}="1"]`))
    for (const el of segmented) {
      ;(el as HTMLElement).removeAttribute(SEGMENTED_ATTR)
    }

    const wrappers = Array.from(root.querySelectorAll(`.${WRAPPED_CLASS}`))
    for (const wrapper of wrappers) {
      while (wrapper.firstChild) {
        wrapper.parentNode?.insertBefore(wrapper.firstChild, wrapper)
      }
      wrapper.remove()
    }
  }

  const visit = (root: ParentNode): void => {
    clearRoot(root)
    for (const element of Array.from(root.querySelectorAll('*'))) {
      if (!element.shadowRoot) continue
      visit(element.shadowRoot)
    }
  }

  visit(document)
}

function isZeroRectClipValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized.startsWith('rect(') || !normalized.endsWith(')')) return false
  const rectValues = normalized
    .slice(5, -1)
    .split(/[,\s]+/g)
    .filter(Boolean)
  return rectValues.length === 4 && rectValues.every((part) => /^0(?:\.0+)?(?:px)?$/.test(part))
}

function isStyleHiddenForTranslation(style: CSSStyleDeclaration): boolean {
  return isHardHiddenStyleForTranslation(style) || isVisuallyHiddenStyleForTranslation(style)
}

function getComputedStyleForTranslation(element: Element): CSSStyleDeclaration | null {
  try {
    return window.getComputedStyle(element)
  } catch (_error) {
    return null
  }
}

function isHardHiddenStyleForTranslation(style: CSSStyleDeclaration): boolean {
  return (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse' ||
    style.getPropertyValue('content-visibility') === 'hidden'
  )
}

function isVisuallyHiddenStyleForTranslation(style: CSSStyleDeclaration): boolean {
  const clip = style.getPropertyValue('clip')
  const clipPath = style.getPropertyValue('clip-path').replace(/\s+/g, '').toLowerCase()
  return (
    style.opacity === '0' ||
    isZeroRectClipValue(clip) ||
    clipPath === 'inset(50%)' ||
    clipPath === 'inset(100%)'
  )
}

function hasSvgHiddenPresentationAttribute(element: Element): boolean {
  if (!(element instanceof SVGElement)) return false
  const display = element.getAttribute('display')?.trim().toLowerCase()
  const visibility = element.getAttribute('visibility')?.trim().toLowerCase()
  const opacity = element.getAttribute('opacity')?.trim()
  return (
    display === 'none' || visibility === 'hidden' || visibility === 'collapse' || opacity === '0'
  )
}

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return false
  if (isHiddenFromTranslation(element)) return false
  const style = window.getComputedStyle(element)
  if (isStyleHiddenForTranslation(style)) return false
  if (style.display === 'contents') return true
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  return true
}

function shouldExtractElementText(element: Element, allowVisuallyHiddenText = false): boolean {
  if (isHiddenFromTranslation(element) && !allowVisuallyHiddenText) return false
  if (element instanceof HTMLElement) {
    const style = window.getComputedStyle(element)
    return allowVisuallyHiddenText || !isStyleHiddenForTranslation(style)
  }
  return true
}

function isPlaceholderInputElement(element: Element): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) return false
  const type = (element.type || 'text').toLowerCase()
  return ['email', 'number', 'password', 'search', 'tel', 'text', 'url'].includes(type)
}

function shouldTranslatePlaceholderElement(
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement {
  if (!(element instanceof HTMLTextAreaElement) && !isPlaceholderInputElement(element)) {
    return false
  }
  if (element.getAttribute(TRANSLATED_PLACEHOLDER_ATTR) === '1') return false
  if (isHiddenFromTranslation(element)) return false
  if (isTranslationOptOutElement(element)) return false
  if (!isElementVisible(element)) return false
  if (element.value.trim()) return false
  const placeholder = element.getAttribute('placeholder')?.trim()
  return Boolean(placeholder && placeholder.length >= MIN_LENGTH_GENERIC)
}

function isSvgMetadataElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase()
  return (tag === 'title' || tag === 'desc') && element.closest('svg') instanceof SVGElement
}

function isSvgVisibleTextElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase()
  return (
    (tag === 'text' || tag === 'tspan' || tag === 'textpath' || tag === 'a') &&
    element.closest('svg') instanceof SVGElement
  )
}

function isOptionTextContentElement(element: Element): element is HTMLOptionElement {
  return element instanceof HTMLOptionElement
}

function isTranslatableTextContentElement(element: Element): boolean {
  return (
    isSvgMetadataElement(element) ||
    isSvgVisibleTextElement(element) ||
    isOptionTextContentElement(element)
  )
}

function shouldTranslateTextContentElement(element: Element): boolean {
  if (element.getAttribute(TRANSLATED_TEXT_CONTENT_ATTR) === '1') return false
  if (isOptionTextContentElement(element)) {
    const select = element.closest('select')
    if (select instanceof HTMLSelectElement) {
      if (isHiddenFromTranslation(element) || isHiddenFromTranslation(select)) return false
      if (isTranslationOptOutElement(element) || isTranslationOptOutElement(select)) return false
      if (!isElementVisible(select)) return false
      return (element.textContent ?? '').trim().length >= MIN_LENGTH_GENERIC
    }
    const datalist = element.closest('datalist')
    if (!(datalist instanceof HTMLDataListElement) || !element.hasAttribute('value')) return false
    if (isTranslationOptOutElement(element)) return false
    if (!hasVisibleTranslatableDatalistInput(datalist)) return false
    return (element.textContent ?? '').trim().length >= MIN_LENGTH_GENERIC
  }

  if (!isSvgMetadataElement(element) && !isSvgVisibleTextElement(element)) return false
  const tag = element.tagName.toLowerCase()
  if (tag === 'text' && element.querySelector('tspan, textPath, a')) {
    return false
  }
  if (tag === 'a' && element.closest('text') && element.querySelector('tspan, textPath')) {
    return false
  }
  const ownerSvg = element.closest('svg')
  if (!(ownerSvg instanceof SVGElement)) return false
  const isSvgMetadata = isSvgMetadataElement(element)
  if (
    isHiddenFromTranslation(element, { ignoreSelfVisibilityStyle: isSvgMetadata }) ||
    isHiddenFromTranslation(ownerSvg)
  ) {
    return false
  }
  if (isTranslationOptOutElement(element) || isTranslationOptOutElement(ownerSvg)) return false
  if (!isElementVisible(ownerSvg)) return false
  return (element.textContent ?? '').trim().length >= MIN_LENGTH_GENERIC
}

const TRANSLATION_OPT_OUT_SELECTOR = [
  '[data-no-translate]',
  '[data-notranslate]',
  '.notranslate',
  '[class~="notranslate"]',
  '.skiptranslate',
  '[class~="skiptranslate"]',
].join(',')

const INTERACTIVE_CONTROL_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'listbox',
  'menu',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'progressbar',
  'radio',
  'scrollbar',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'tablist',
  'textbox',
  'toolbar',
  'tree',
  'treeitem',
])

const LIVE_REGION_ROLES = new Set(['alert', 'log', 'marquee', 'status', 'timer'])

const NAV_LIKE_CONTAINER_SELECTOR = 'nav,header,footer,aside'
const NAV_LIKE_CONTAINER_ROLES = new Set([
  'banner',
  'complementary',
  'contentinfo',
  'navigation',
  'search',
])
const ARIA_TABLE_STRUCTURE_ROLES = new Set(['grid', 'row', 'rowgroup', 'table'])
const ARIA_TABLE_CELL_ROLES = new Set(['cell', 'columnheader', 'gridcell', 'rowheader'])
const ARIA_LIST_STRUCTURE_ROLES = new Set(['list'])
const ARIA_LIST_ITEM_ROLES = new Set(['listitem'])
const ARIA_FEED_STRUCTURE_ROLES = new Set(['feed'])
const ARIA_FEED_ITEM_ROLES = new Set(['article'])
const ARIA_CONTENT_BLOCK_ROLES = new Set([
  'article',
  'blockquote',
  'caption',
  'definition',
  'figure',
  'paragraph',
  'term',
])
const NAV_LIKE_LEAF_TAGS = new Set(['a', 'button', 'span', 'li'])

const NON_TRANSLATABLE_TAGS = new Set([
  'button',
  'canvas',
  'iframe',
  'input',
  'link',
  'meta',
  'noscript',
  'optgroup',
  'option',
  'script',
  'select',
  'style',
  'svg',
  'textarea',
])

const OPAQUE_INLINE_TAGS = new Set([
  'abbr',
  'code',
  'data',
  'kbd',
  'math',
  'pre',
  'rp',
  'rt',
  'ruby',
  'samp',
  'sub',
  'sup',
  'svg',
  'var',
])
const STANDALONE_INLINE_TEXT_TAGS = new Set([
  'a',
  'b',
  'button',
  'cite',
  'dfn',
  'del',
  'em',
  'i',
  'ins',
  'mark',
  'output',
  'q',
  's',
  'small',
  'span',
  'strong',
  'time',
  'u',
])
const PRESERVED_TRANSLATABLE_INLINE_TAGS = new Set([
  'b',
  'cite',
  'dfn',
  'del',
  'em',
  'i',
  'ins',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'time',
  'u',
])

type TranslationPreference = 'translate' | 'skip' | null

function getExplicitTranslationPreference(element: Element): TranslationPreference {
  const translate = element.getAttribute('translate')?.trim().toLowerCase()
  if (translate === 'yes' || translate === 'true') return 'translate'
  if (translate === 'no' || translate === 'false') return 'skip'

  const dataTranslate = element.getAttribute('data-translate')?.trim().toLowerCase()
  if (dataTranslate === 'yes' || dataTranslate === 'true') return 'translate'
  if (dataTranslate === 'no' || dataTranslate === 'false') return 'skip'

  return null
}

function getTraversableChildren(node: Element): Element[] {
  const children = Array.from(node.children)
  if (node.shadowRoot) {
    children.push(...Array.from(node.shadowRoot.children))
  }
  return children
}

function getComposedParentElement(element: Element): Element | null {
  if (element.parentElement) return element.parentElement
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

function hasComposedSelfOrAncestorMatching(element: Element, selector: string): boolean {
  let current: Element | null = element
  while (current) {
    if (current.matches(selector)) return true
    current = getComposedParentElement(current)
  }
  return false
}

function isInsideDetailsSummary(details: Element, element: Element): boolean {
  const summary = Array.from(details.children).find(
    (child) => child.tagName.toLowerCase() === 'summary',
  )
  return !!summary && summary.contains(element)
}

function isHiddenByClosedDetails(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    const parent = getComposedParentElement(current)
    if (parent?.tagName.toLowerCase() === 'details' && !parent.hasAttribute('open')) {
      return !isInsideDetailsSummary(parent, element)
    }
    current = parent
  }
  return false
}

function isClosedPopoverElement(element: Element): boolean {
  if (!element.hasAttribute('popover')) return false
  try {
    return !element.matches(':popover-open')
  } catch (_error) {
    return true
  }
}

function isHiddenByClosedPopover(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (isClosedPopoverElement(current)) return true
    current = getComposedParentElement(current)
  }
  return false
}

function isHiddenByVisibilityStyle(
  element: Element,
  options: { ignoreSelfVisibilityStyle?: boolean } = {},
): boolean {
  let current: Element | null = element
  let isSelf = true
  while (current) {
    if (!isSelf || !options.ignoreSelfVisibilityStyle) {
      const style = getComputedStyleForTranslation(current)
      if (style && isStyleHiddenForTranslation(style)) return true
    }
    current = getComposedParentElement(current)
    isSelf = false
  }
  return false
}

function isHiddenFromTranslation(
  element: Element,
  options: { ignoreSelfVisibilityStyle?: boolean } = {},
): boolean {
  if (isHiddenByClosedDetails(element)) return true
  if (isHiddenByClosedPopover(element)) return true
  if (isHiddenByVisibilityStyle(element, options)) return true

  let current: Element | null = element
  while (current) {
    if (current.hasAttribute('hidden') || current.hasAttribute('inert')) return true
    if (hasSvgHiddenPresentationAttribute(current)) return true
    if (VISUALLY_HIDDEN_CLASS_PATTERN.test(current.getAttribute('class') ?? '')) return true
    const ariaHidden = current.getAttribute('aria-hidden')?.trim().toLowerCase()
    if (ariaHidden === 'true') return true
    current = getComposedParentElement(current)
  }
  return false
}

function hasVisuallyHiddenClassInComposedAncestry(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (VISUALLY_HIDDEN_CLASS_PATTERN.test(current.getAttribute('class') ?? '')) return true
    current = getComposedParentElement(current)
  }
  return false
}

function hasVisuallyHiddenStyleInComposedAncestry(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    const style = getComputedStyleForTranslation(current)
    if (style && isVisuallyHiddenStyleForTranslation(style)) {
      return true
    }
    current = getComposedParentElement(current)
  }
  return false
}

function hasHardHiddenStateInComposedAncestry(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (current.hasAttribute('hidden') || current.hasAttribute('inert')) return true
    const style = getComputedStyleForTranslation(current)
    if (style && isHardHiddenStyleForTranslation(style)) {
      return true
    }
    const ariaHidden = current.getAttribute('aria-hidden')?.trim().toLowerCase()
    if (ariaHidden === 'true') return true
    current = getComposedParentElement(current)
  }
  return false
}

function isReferencedByVisibleAriaTextReferenceElement(element: Element): boolean {
  const id = element.id
  if (!id) return false
  const root = element.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return false
  const selector = ARIA_TEXT_REFERENCE_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(',')
  return Array.from(root.querySelectorAll(selector)).some((candidate) => {
    if (!isElementVisible(candidate) || isTranslationOptOutElement(candidate)) return false
    return ARIA_TEXT_REFERENCE_ATTRIBUTES.some((attribute) =>
      parseAriaIdReferences(candidate.getAttribute(attribute)).includes(id),
    )
  })
}

function shouldTranslateVisuallyHiddenAriaTextReferenceTarget(element: Element): boolean {
  return (
    !hasHardHiddenStateInComposedAncestry(element) &&
    (hasVisuallyHiddenClassInComposedAncestry(element) ||
      hasVisuallyHiddenStyleInComposedAncestry(element)) &&
    isReferencedByVisibleAriaTextReferenceElement(element)
  )
}

function isTranslatableVisuallyHiddenAriaTextReferenceTarget(element: Element): boolean {
  return (
    shouldTranslateVisuallyHiddenAriaTextReferenceTarget(element) &&
    !isTranslationOptOutElement(element)
  )
}

function hasEditableContentAttribute(element: Element): boolean {
  const contentEditable = element.getAttribute('contenteditable')?.trim().toLowerCase()
  return (
    contentEditable === '' || contentEditable === 'true' || contentEditable === 'plaintext-only'
  )
}

function isEditableSurface(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false
  let current: Element | null = element
  while (current) {
    if (current instanceof HTMLElement && current.isContentEditable) return true
    if (hasEditableContentAttribute(current)) return true
    current = getComposedParentElement(current)
  }
  return false
}

function isTranslationOptOutElement(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    const preference = getExplicitTranslationPreference(current)
    if (preference === 'translate') return false
    if (preference === 'skip') return true
    if (current.matches(TRANSLATION_OPT_OUT_SELECTOR)) return true
    current = getComposedParentElement(current)
  }
  return false
}

function hasExplicitTranslationOptInDescendant(element: Element): boolean {
  for (const child of getTraversableChildren(element)) {
    if (getExplicitTranslationPreference(child) === 'translate') return true
    if (hasExplicitTranslationOptInDescendant(child)) return true
  }
  return false
}

function isExplicitTranslationOptOutElement(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    const preference = getExplicitTranslationPreference(current)
    if (preference === 'translate') return false
    if (preference === 'skip') return true
    current = getComposedParentElement(current)
  }
  return false
}

function getRoleTokens(element: Element): string[] {
  const role = element.getAttribute('role')?.trim().toLowerCase()
  return role ? role.split(/\s+/g) : []
}

function hasRoleToken(roles: string[], roleSet: Set<string>): boolean {
  return roles.some((role) => roleSet.has(role))
}

function isNavigationLikeContainerElement(element: Element): boolean {
  if (element.matches(NAV_LIKE_CONTAINER_SELECTOR)) return true
  return hasRoleToken(getRoleTokens(element), NAV_LIKE_CONTAINER_ROLES)
}

function hasComposedSelfOrAncestorNavigationLike(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (isNavigationLikeContainerElement(current)) return true
    current = getComposedParentElement(current)
  }
  return false
}

function isHeadingElement(element: Element): boolean {
  if (/^h[1-6]$/.test(element.tagName.toLowerCase())) return true
  return getRoleTokens(element).includes('heading')
}

function getMinimumTextLengthForElement(element: Element): number {
  return isHeadingElement(element) ? MIN_LENGTH_HEADING : MIN_LENGTH_GENERIC
}

function isInteractiveControlElement(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    const roles = getRoleTokens(current)
    if (roles.some((role) => INTERACTIVE_CONTROL_ROLES.has(role))) return true
    current = getComposedParentElement(current)
  }
  return false
}

function isLiveRegionElement(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    const ariaLive = current.getAttribute('aria-live')
    if (ariaLive !== null) {
      return ariaLive.trim().toLowerCase() !== 'off'
    }

    const roles = getRoleTokens(current)
    if (roles.some((role) => LIVE_REGION_ROLES.has(role))) return true
    current = getComposedParentElement(current)
  }
  return false
}

function shouldTranslateElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase()
  const isExplicitlyTranslated = getExplicitTranslationPreference(element) === 'translate'
  if (NON_TRANSLATABLE_TAGS.has(tag) && !(isExplicitlyTranslated && tag === 'button')) {
    return false
  }
  if (isEditableSurface(element)) return false
  if (isTranslationOptOutElement(element)) return false
  if (isInteractiveControlElement(element) && !isExplicitlyTranslated) return false
  if (isLiveRegionElement(element)) return false
  // 导航/页眉/页脚/侧边栏默认跳过容器，但允许叶子级文字元素
  if (hasComposedSelfOrAncestorNavigationLike(element) && !NAV_LIKE_LEAF_TAGS.has(tag)) {
    return false
  }
  if (element.closest(`.${TRANSLATED_CLASS}`)) return false
  if ((element as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1') return false
  // 若内部已包含翻译或已被标记处理，跳过，避免父子重复翻译
  if (element.querySelector(`.${TRANSLATED_CLASS}, [${TRANSLATED_ATTR}="1"]`)) return false
  return true
}

const STRONG_BLOCK_TAG_LIST = [
  'address',
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
  'caption',
  'figcaption',
  'legend',
  'label',
  'summary',
  'td',
  'th',
  'ul',
  'ol',
  'dl',
  'table',
  'figure',
  'header',
  'footer',
  'nav',
  'aside',
  'main',
] as const
const STRONG_BLOCK_TAGS = new Set<string>(STRONG_BLOCK_TAG_LIST)
const STRONG_BLOCK_SELECTOR = STRONG_BLOCK_TAG_LIST.join(',')
const ARIA_CONTENT_BLOCK_SELECTOR = Array.from(ARIA_CONTENT_BLOCK_ROLES)
  .map((role) => `[role~="${role}"]`)
  .join(',')
const ANY_BLOCK_SELECTOR = [...STRONG_BLOCK_TAG_LIST, 'div'].join(',')
const PREPARE_TRANSLATION_CONTAINER_SELECTOR =
  'article, section, main, .prose, .article, .post-content, .entry-content, div[class*="content"]'

function isStrongBlock(tag: string): boolean {
  return STRONG_BLOCK_TAGS.has(tag.toLowerCase())
}

function isBlockTag(tag: string): boolean {
  const t = tag.toLowerCase()
  return t === 'div' || isStrongBlock(t) || t === 'hr' || t === 'pre' || t === 'form'
}

function isCustomElementTag(tag: string): boolean {
  return tag.includes('-')
}

function isSvgForeignObjectTraversalContainer(element: Element): boolean {
  if (!(element instanceof SVGElement)) return false
  const tag = element.tagName.toLowerCase()
  return (
    tag === 'foreignobject' ||
    ((tag === 'svg' || tag === 'g' || tag === 'switch' || tag === 'a') &&
      Boolean(element.querySelector('foreignObject, foreignobject')))
  )
}

function hasStrongBlockDescendants(element: Element): boolean {
  return (
    element.querySelector(STRONG_BLOCK_SELECTOR) !== null ||
    element.querySelector(ARIA_CONTENT_BLOCK_SELECTOR) !== null
  )
}

function hasAnyBlockDescendants(element: Element): boolean {
  return element.querySelector(ANY_BLOCK_SELECTOR) !== null
}

function isLayoutTextContainer(tag: string): boolean {
  return (
    tag === 'article' ||
    tag === 'aside' ||
    tag === 'div' ||
    tag === 'footer' ||
    tag === 'header' ||
    tag === 'main' ||
    tag === 'nav' ||
    tag === 'section'
  )
}

function hasStandaloneInlineTextChild(element: Element): boolean {
  return Array.from(element.children).some((child) =>
    STANDALONE_INLINE_TEXT_TAGS.has(child.tagName.toLowerCase()),
  )
}

function hasDirectReadableTextChild(element: Element): boolean {
  return Array.from(element.childNodes).some(
    (child) => child.nodeType === Node.TEXT_NODE && !!child.textContent?.trim(),
  )
}

function segmentAndWrapLooseContent(container: Element, force = false) {
  if (!container || (!force && container.hasAttribute(SEGMENTED_ATTR))) return
  if (!shouldTranslateElement(container) || !isElementVisible(container)) return
  const tag = container.tagName.toLowerCase()
  if (
    tag === 'script' ||
    tag === 'style' ||
    tag === 'textarea' ||
    tag === 'input' ||
    tag === 'pre' ||
    tag === 'code'
  )
    return

  const childNodes = Array.from(container.childNodes)
  let group: Node[] = []

  const commit = () => {
    if (group.length === 0) return
    const textContent = group
      .map((n) => n.textContent)
      .join('')
      .trim()
    const hasText = group.some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
    if (hasText && textContent.length >= MIN_LENGTH_GENERIC) {
      const wrapper = document.createElement('div')
      wrapper.className = WRAPPED_CLASS
      wrapper.style.display = 'block'
      wrapper.style.margin = '1em 0'
      container.insertBefore(wrapper, group[0])
      for (const n of group) {
        wrapper.appendChild(n)
      }
    }
    group = []
  }

  for (const child of childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childElement = child as Element
      if (childElement.shadowRoot || isBlockTag(childElement.tagName)) {
        commit()
      } else {
        group.push(child)
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      group.push(child)
    } else {
      group.push(child)
    }
  }
  commit()
  container.setAttribute(SEGMENTED_ATTR, '1')
}

function wrapLooseTextNodesAssignedToSlots(shadowRoot: ShadowRoot): void {
  for (const slot of Array.from(shadowRoot.querySelectorAll('slot'))) {
    for (const node of slot.assignedNodes({ flatten: true })) {
      if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
        wrapLooseTextNode(node.parentNode, node)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        for (const child of Array.from(element.childNodes)) {
          wrapLooseTextNode(element, child)
        }
      }
    }
  }
}

function prepareDocumentForTranslation(root: ParentNode = document, force = false) {
  const prepareOpenShadowRoots = (parent: ParentNode): void => {
    const elements =
      parent instanceof Element
        ? [parent, ...Array.from(parent.querySelectorAll('*'))]
        : Array.from(parent.querySelectorAll('*'))

    for (const element of elements) {
      if (!element.shadowRoot) continue
      wrapLooseTextNodesAssignedToSlots(element.shadowRoot)
      for (const child of Array.from(element.shadowRoot.childNodes)) {
        wrapLooseTextNode(element.shadowRoot, child)
      }
      prepareDocumentForTranslation(element.shadowRoot, force)
    }
  }

  if (root instanceof Element && root.matches(PREPARE_TRANSLATION_CONTAINER_SELECTOR)) {
    segmentAndWrapLooseContent(root, force)
  }
  if (root instanceof ShadowRoot) {
    for (const child of Array.from(root.childNodes)) {
      wrapLooseTextNode(root, child)
    }
  }
  if (root instanceof Element && root.tagName.toLowerCase() === 'slot') {
    for (const child of Array.from(root.childNodes)) {
      wrapLooseTextNode(root, child)
    }
  }
  if (root instanceof Element && root.hasAttribute('slot')) {
    for (const child of Array.from(root.childNodes)) {
      wrapLooseTextNode(root, child)
    }
  }
  if (root instanceof Element && isCustomElementTag(root.tagName.toLowerCase())) {
    for (const child of Array.from(root.childNodes)) {
      wrapLooseTextNode(root, child)
    }
  }
  for (const customElement of Array.from(root.querySelectorAll('*')).filter((element) =>
    isCustomElementTag(element.tagName.toLowerCase()),
  )) {
    for (const child of Array.from(customElement.childNodes)) {
      wrapLooseTextNode(customElement, child)
    }
  }
  const containers = root.querySelectorAll(PREPARE_TRANSLATION_CONTAINER_SELECTOR)
  for (const c of containers) {
    segmentAndWrapLooseContent(c, force)
  }

  // 专门针对 Hugging Face 等站点的常见 content div
  if (root === document) {
    const blogContent = document.querySelector('.blog-content')
    if (blogContent) segmentAndWrapLooseContent(blogContent, force)
  }
  prepareOpenShadowRoots(root)
}

function getElementText(element: Element): string {
  // 使用 innerText 保留可见文本（排除 display:none 等）
  // 对 pre/code 等不处理以避免破坏代码样式
  const tag = element.tagName.toLowerCase()
  if (tag === 'code' || tag === 'pre' || tag === 'kbd' || tag === 'samp') return ''
  return ((element as HTMLElement).innerText ?? element.textContent ?? '').trim()
}

/**
 * 提取带标记的文本，以便在翻译后还原交互元素
 * 对于 <img> 等无内容元素，使用单点标记 [[NTn]]
 * 对于 <a> 等含内容元素，使用边界标记 [[NTn_S]]...[[NTn_E]]，以便翻译其内部文字
 */
function getMarkedWithNodes(element: Element): { text: string; nodeMap: Map<string, Node> } {
  const nodeMap = new Map<string, Node>()
  let counter = 0
  const allowVisuallyHiddenText = shouldTranslateVisuallyHiddenAriaTextReferenceTarget(element)

  function process(node: Node, isRoot = false): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (!shouldExtractElementText(el, allowVisuallyHiddenText)) return ''
      const tag = el.tagName.toLowerCase()

      if (tag === 'br') return '\n'

      if (!isRoot && isTranslationOptOutElement(el)) {
        const marker = `[[NT${counter++}]]`
        nodeMap.set(marker, el.cloneNode(true))
        return marker
      }

      // 在 X 上，Mention 是 <a>，Emoji 是 <img>
      if (tag === 'img') {
        const marker = `[[NT${counter++}]]`
        nodeMap.set(marker, el.cloneNode(true))
        return marker
      }

      if (OPAQUE_INLINE_TAGS.has(tag)) {
        const marker = `[[NT${counter++}]]`
        nodeMap.set(marker, el.cloneNode(true))
        return marker
      }

      if (tag === 'a') {
        const markerBase = `[[NT${counter++}]]`
        const startMarker = markerBase.replace(']]', '_S]]')
        const endMarker = markerBase.replace(']]', '_E]]')
        // 只克隆标签本身（含属性），不含子节点
        nodeMap.set(markerBase, el.cloneNode(false))

        let inner = ''
        for (const child of Array.from(node.childNodes)) {
          inner += process(child)
        }
        return `${startMarker}${inner}${endMarker}`
      }

      if (!isRoot && PRESERVED_TRANSLATABLE_INLINE_TAGS.has(tag)) {
        const markerBase = `[[NT${counter++}]]`
        const startMarker = markerBase.replace(']]', '_S]]')
        const endMarker = markerBase.replace(']]', '_E]]')
        nodeMap.set(markerBase, el.cloneNode(false))

        let inner = ''
        for (const child of Array.from(node.childNodes)) {
          inner += process(child)
        }
        return `${startMarker}${inner}${endMarker}`
      }

      // 如果是普通 span 或者其他 inline 元素，继续递归
      let result = ''
      for (const child of Array.from(node.childNodes)) {
        result += process(child)
      }
      return result
    }
    return ''
  }

  const rawText = process(element, true)
  return { text: rawText.trim(), nodeMap }
}

/**
 * 将带标记的译文渲染回 DOM 片段
 */
function renderMarkedText(translatedText: string, nodeMap: Map<string, Node>): DocumentFragment {
  const fragment = document.createDocumentFragment()

  // 匹配 [[NTn]], [[NTn_S]], [[NTn_E]]，使用 gi 忽略大小写
  // 因为某些翻译引擎（如 Google）可能会将占位符转为小写
  const parts = translatedText.split(/(\[\[NT\d+(?:_[SE])?\]\])/gi)

  // 使用栈处理嵌套
  const stack: (DocumentFragment | Element)[] = [fragment]

  for (const part of parts) {
    if (!part) continue

    const upperPart = part.toUpperCase()
    if (upperPart.endsWith('_S]]')) {
      const baseMarker = upperPart.replace('_S]]', ']]')
      const original = nodeMap.get(baseMarker)
      if (original) {
        const clone = original.cloneNode(false) as Element
        stack[stack.length - 1].appendChild(clone)
        stack.push(clone)
      } else {
        // 如果找不到对应的节点映射，作为普通文字 fallback
        stack[stack.length - 1].appendChild(document.createTextNode(part))
      }
    } else if (upperPart.endsWith('_E]]')) {
      if (stack.length > 1) {
        stack.pop()
      } else {
        stack[stack.length - 1].appendChild(document.createTextNode(part))
      }
    } else {
      const originalNode = nodeMap.get(upperPart)
      if (originalNode) {
        // 单点标记（如 <img>）
        stack[stack.length - 1].appendChild(originalNode.cloneNode(true))
      } else {
        // 普通文字
        stack[stack.length - 1].appendChild(document.createTextNode(part))
      }
    }
  }

  return fragment
}

interface TranslatableBlockItem {
  element: Element
  text: string
  nodeMap?: Map<string, Node>
}

interface TranslationContext {
  sourceLanguage: LanguageCode
  translator: TranslatorInstance | null
}

type LatestTranslationContextResolver = (text: string) => Promise<TranslationContext | null>

function collectTranslatableBlocks(root: ParentNode): TranslatableBlockItem[] {
  const results: TranslatableBlockItem[] = []
  const visuallyHiddenAriaReferenceTargetCache = new WeakMap<Element, boolean>()

  const isVisibleAriaTextReferenceTarget = (element: Element): boolean => {
    const cached = visuallyHiddenAriaReferenceTargetCache.get(element)
    if (cached !== undefined) return cached
    const result = isTranslatableVisuallyHiddenAriaTextReferenceTarget(element)
    visuallyHiddenAriaReferenceTargetCache.set(element, result)
    return result
  }

  const hasVisibleAriaTextReferenceTargetDescendant = (element: Element): boolean =>
    Array.from(element.querySelectorAll('[id]')).some((candidate) =>
      isVisibleAriaTextReferenceTarget(candidate),
    )

  function walk(node: Element) {
    const tag = node.tagName.toLowerCase()
    if (isSvgForeignObjectTraversalContainer(node)) {
      for (const child of getTraversableChildren(node)) {
        walk(child)
      }
      return
    }

    const isVisibleAriaReferenceTarget = isVisibleAriaTextReferenceTarget(node)

    if (!isVisibleAriaReferenceTarget && !shouldTranslateElement(node)) {
      if (isTranslationOptOutElement(node) && hasExplicitTranslationOptInDescendant(node)) {
        for (const child of getTraversableChildren(node)) {
          walk(child)
        }
      } else if (
        isNavigationLikeContainerElement(node) &&
        hasVisibleAriaTextReferenceTargetDescendant(node)
      ) {
        for (const child of getTraversableChildren(node)) {
          walk(child)
        }
      }
      return
    }
    if (!isElementVisible(node) && !isVisibleAriaReferenceTarget) {
      return
    }

    const dataTestId = node.getAttribute('data-testid')
    const isTweet = dataTestId === 'tweetText' || dataTestId === 'tweet-text'
    const roleTokens = getRoleTokens(node)
    const isCustomTextContainer = isCustomElementTag(tag) && hasDirectReadableTextChild(node)
    const isAriaTableCell = hasRoleToken(roleTokens, ARIA_TABLE_CELL_ROLES)
    const isAriaListItem = hasRoleToken(roleTokens, ARIA_LIST_ITEM_ROLES)
    const isAriaFeedItem = hasRoleToken(roleTokens, ARIA_FEED_ITEM_ROLES)
    const isAriaContentBlock = hasRoleToken(roleTokens, ARIA_CONTENT_BLOCK_ROLES)

    if (hasRoleToken(roleTokens, ARIA_TABLE_STRUCTURE_ROLES) && !isAriaTableCell) {
      for (const child of getTraversableChildren(node)) {
        walk(child)
      }
      return
    }

    if (hasRoleToken(roleTokens, ARIA_LIST_STRUCTURE_ROLES) && !isAriaListItem) {
      for (const child of getTraversableChildren(node)) {
        walk(child)
      }
      return
    }

    if (hasRoleToken(roleTokens, ARIA_FEED_STRUCTURE_ROLES) && !isAriaFeedItem) {
      for (const child of getTraversableChildren(node)) {
        walk(child)
      }
      return
    }

    // 如果是显式的块级标签或是 X 等站点的特定文本容器
    if (
      isTweet ||
      isStrongBlock(tag) ||
      tag === 'div' ||
      isCustomTextContainer ||
      isAriaTableCell ||
      isAriaListItem ||
      isAriaFeedItem ||
      isAriaContentBlock
    ) {
      if (
        !isTweet &&
        isLayoutTextContainer(tag) &&
        ((!hasDirectReadableTextChild(node) && hasStandaloneInlineTextChild(node)) ||
          hasAnyBlockDescendants(node))
      ) {
        for (const child of getTraversableChildren(node)) {
          walk(child)
        }
        return
      }

      // 如果没有更深的“强”块级子元素，将其视为一个连贯的翻译单元
      if (isTweet || !hasStrongBlockDescendants(node)) {
        const { text, nodeMap } = getMarkedWithNodes(node)
        if (text.length >= getMinimumTextLengthForElement(node)) {
          results.push({ element: node, text, nodeMap })
          return // 捕获后停止向下探测，保持段落完整性
        }
      }
      // 有子块，继续深度优先遍历
      for (const child of getTraversableChildren(node)) {
        walk(child)
      }
    } else if (STANDALONE_INLINE_TEXT_TAGS.has(tag)) {
      if (hasStrongBlockDescendants(node)) {
        for (const child of getTraversableChildren(node)) {
          walk(child)
        }
        return
      }
      // 这里的 inline 标签只有在不是强块子元素时才会被作为独立块捕获（鲁棒性）
      const { text, nodeMap } = getMarkedWithNodes(node)
      if (text.length >= getMinimumTextLengthForElement(node)) {
        results.push({ element: node, text, nodeMap })
      }
      // 通常不进 inline 标签内部
    } else {
      for (const child of getTraversableChildren(node)) {
        walk(child)
      }
    }
  }

  if (root instanceof Element) {
    walk(root)
  } else {
    const children =
      root instanceof Document
        ? Array.from(root.body?.children || [])
        : Array.from(root.children || [])
    for (const child of children) {
      walk(child)
    }
  }

  return results
}

function getLatestTranslatableBlockItem(element: Element): TranslatableBlockItem | null {
  return collectTranslatableBlocks(element).find((item) => item.element === element) ?? null
}

function getLatestTranslatableBlockItemIgnoringTemporaryElement(
  element: Element,
  temporaryElement: Element,
): TranslatableBlockItem | null {
  const parent = temporaryElement.parentNode
  const nextSibling = temporaryElement.nextSibling
  const wasConnected = temporaryElement.isConnected
  if (wasConnected) temporaryElement.remove()

  try {
    return getLatestTranslatableBlockItem(element)
  } finally {
    if (wasConnected && parent && element.isConnected && !temporaryElement.isConnected) {
      if (nextSibling && nextSibling.parentNode === parent) {
        parent.insertBefore(temporaryElement, nextSibling)
      } else {
        parent.appendChild(temporaryElement)
      }
    }
  }
}

function shouldContinueTranslatingBlockElement(element: Element): boolean {
  if (!element.isConnected) return false
  const isVisibleAriaTextReferenceTarget =
    isTranslatableVisuallyHiddenAriaTextReferenceTarget(element)
  if (!isVisibleAriaTextReferenceTarget && !shouldTranslateElement(element)) return false
  return isElementVisible(element) || isVisibleAriaTextReferenceTarget
}

interface TranslatablePlaceholderItem {
  element: HTMLInputElement | HTMLTextAreaElement
  text: string
}

interface TranslatableTextAttributeItem {
  attributeName: TranslatableTextAttributeName
  element: Element
  text: string
}

interface TranslatableTextContentItem {
  element: Element
  text: string
}

function queryElementsIncludingOpenShadowRoots(root: ParentNode, selector: string): Element[] {
  const results: Element[] =
    root instanceof Element
      ? [...(root.matches(selector) ? [root] : []), ...Array.from(root.querySelectorAll(selector))]
      : Array.from(root.querySelectorAll(selector))

  const candidates =
    root instanceof Element
      ? [root, ...Array.from(root.querySelectorAll('*'))]
      : Array.from(root.querySelectorAll('*'))

  for (const element of candidates) {
    if (!element.shadowRoot) continue
    results.push(...queryElementsIncludingOpenShadowRoots(element.shadowRoot, selector))
  }

  return results
}

function collectTranslatablePlaceholders(root: ParentNode): TranslatablePlaceholderItem[] {
  const elements = queryElementsIncludingOpenShadowRoots(
    root,
    'input[placeholder], textarea[placeholder]',
  )

  return elements.flatMap((element) => {
    if (!shouldTranslatePlaceholderElement(element)) return []
    const text = element.getAttribute('placeholder')?.trim()
    return text ? [{ element, text }] : []
  })
}

function collectTranslatableTextAttributes(root: ParentNode): TranslatableTextAttributeItem[] {
  const selector = TRANSLATABLE_TEXT_ATTRIBUTES.map(getTranslatableTextAttributeSelector).join(',')
  const elements = queryElementsIncludingOpenShadowRoots(root, selector)

  return elements.flatMap((element) => {
    return TRANSLATABLE_TEXT_ATTRIBUTES.flatMap((attributeName) => {
      if (!isTranslatableTextAttributeElement(element, attributeName)) return []
      if (isTranslatableTextAttributeHiddenOrOptedOut(element, attributeName)) return []
      if (!isTranslatableTextAttributeVisible(element, attributeName)) return []
      if (element.getAttribute(getTranslatedTextAttributeMarker(attributeName)) === '1') return []
      const text = getTranslatableTextAttributeValue(element, attributeName)?.trim()
      if (!text || text.length < MIN_LENGTH_GENERIC) return []
      return [{ attributeName, element, text }]
    })
  })
}

function shouldTranslateCurrentTextAttribute(
  element: Element,
  attributeName: TranslatableTextAttributeName,
): boolean {
  if (!isTranslatableTextAttributeElement(element, attributeName)) return false
  if (isTranslatableTextAttributeHiddenOrOptedOut(element, attributeName)) return false
  if (!isTranslatableTextAttributeVisible(element, attributeName)) return false
  if (element.getAttribute(getTranslatedTextAttributeMarker(attributeName)) === '1') return false
  const text = getTranslatableTextAttributeValue(element, attributeName)?.trim()
  return Boolean(text && text.length >= MIN_LENGTH_GENERIC)
}

function collectTranslatableTextContent(root: ParentNode): TranslatableTextContentItem[] {
  const elements = queryElementsIncludingOpenShadowRoots(root, TEXT_CONTENT_SELECTOR)

  return elements.flatMap((element) => {
    if (!shouldTranslateTextContentElement(element)) return []
    const text = element.textContent?.trim()
    return text ? [{ element, text }] : []
  })
}

function createSkeletonPlaceholder(original: Element): HTMLElement {
  ensureDesignSystemStyles()
  const container = document.createElement('div')
  container.className = 'native-translate-skeleton'

  const status = document.createElement('div')
  status.className = 'native-translate-skeleton__status'

  const icon = document.createElement('span')
  icon.className = 'native-translate-skeleton__status-icon'

  const text = document.createElement('span')
  text.className = 'native-translate-skeleton__status-text'
  text.textContent = tCS('overlay_preparing')

  status.append(icon, text)
  container.appendChild(status)

  // 估算行数：根据高度，大约 24px 一行
  const rect = original.getBoundingClientRect()
  const height = rect.height || 24
  const lineCount = Math.max(1, Math.min(10, Math.ceil(height / 24)))

  for (let i = 0; i < lineCount; i++) {
    const line = document.createElement('div')
    line.className = 'native-translate-skeleton__line'
    container.appendChild(line)
  }

  return container
}

function getDomLanguageTag(languageCode: LanguageCode): string {
  return languageCode.replace(/_/g, '-')
}

function createTranslationSpan(
  original: Element,
  content: string | DocumentFragment,
  targetLanguage: LanguageCode,
): Element {
  const span = document.createElement('span')
  span.classList.add(TRANSLATED_CLASS)
  span.setAttribute(TRANSLATED_ATTR, '1')
  span.setAttribute('lang', getDomLanguageTag(targetLanguage))
  // 使用块级表现，确保作为同级兄弟显示在原文下方
  if (span instanceof HTMLElement) {
    const originalTag = original.tagName.toLowerCase()
    const isInlineNavText = originalTag === 'span'
    if (!isInlineNavText) {
      span.style.display = 'block'
      span.style.marginTop = '4px'
      span.style.whiteSpace = 'pre-wrap'
    }
    const rtl = isRTLLanguage(targetLanguage)
    span.dir = rtl ? 'rtl' : 'ltr'
    if (rtl) {
      span.style.textAlign = 'right'
    }
  }

  if (content instanceof DocumentFragment) {
    span.appendChild(content)
  } else {
    span.textContent = content
  }

  return span
}

function insertTranslationAdjacent(target: Element, node: Element): void {
  const tag = target.tagName.toLowerCase()
  if (isAriaTextReferenceTarget(target)) {
    target.appendChild(node)
    return
  }
  // 对于内联/可点击小件，放在它后面作为同级以减少布局干扰
  if (tag === 'span' || tag === 'a' || tag === 'button') {
    try {
      target.insertAdjacentElement('afterend', node)
      return
    } catch (_e) {
      /* fallback below */
    }
  }
  // 默认：作为子节点插入
  ;(target as Element).appendChild(node)
}

function isAriaTextReferenceTarget(element: Element): boolean {
  const id = element.id
  if (!id) return false
  const root = element.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return false
  const selector = ARIA_TEXT_REFERENCE_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(',')
  return Array.from(root.querySelectorAll(selector)).some((candidate) =>
    ARIA_TEXT_REFERENCE_ATTRIBUTES.some((attribute) =>
      parseAriaIdReferences(candidate.getAttribute(attribute)).includes(id),
    ),
  )
}

function parseAriaIdReferences(value: string | null): string[] {
  return value?.trim().split(/\s+/g).filter(Boolean) ?? []
}

function findElementByIdInRoot(root: Document | ShadowRoot, id: string): Element | null {
  if (root instanceof Document) return root.getElementById(id)
  return Array.from(root.querySelectorAll('[id]')).find((element) => element.id === id) ?? null
}

function isAriaTextReferenceIdInUse(root: Document | ShadowRoot, id: string | null): boolean {
  if (!id) return false
  const selector = ARIA_TEXT_REFERENCE_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(',')
  return Array.from(root.querySelectorAll(selector)).some((candidate) =>
    ARIA_TEXT_REFERENCE_ATTRIBUTES.some((attribute) =>
      parseAriaIdReferences(candidate.getAttribute(attribute)).includes(id),
    ),
  )
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
      line.length >= STREAMING_LENGTH_THRESHOLD
    if (canStream) {
      let partial = ''
      let received = false
      try {
        const streamLike = (translator.translateStreaming as (text: string) => unknown)(line)
        for await (const chunk of normalizeToAsyncStringIterable(streamLike)) {
          received = true
          partial += chunk
          onPartial?.(partial)
        }
      } catch {
        // ignore and fallback
      }
      if (received && partial) return partial
      try {
        const out = await translator.translate(line)
        onPartial?.(out)
        return out
      } catch {
        // 如果本地失败，回退到桥
        const out = await bridgeTranslate(line, sourceLanguage, targetLanguage)
        onPartial?.(out)
        return out
      }
    }
    // 无流式或不满足阈值，则直接一次性
    try {
      const out = await translator.translate(line)
      onPartial?.(out)
      return out
    } catch {
      const out = await bridgeTranslate(line, sourceLanguage, targetLanguage)
      onPartial?.(out)
      return out
    }
  }
  // 没有本地翻译器，使用主世界桥（不支持流式）
  const bridged = await bridgeTranslate(line, sourceLanguage, targetLanguage)
  onPartial?.(bridged)
  return bridged
}

async function translateIntoElementPreservingNewlines(
  original: Element,
  translator: TranslatorInstance | null,
  text: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  nodeMap?: Map<string, Node>,
  resolveLatestTranslationContext?: LatestTranslationContextResolver,
): Promise<void> {
  const placeholder = createTranslationSpan(original, '', targetLanguage)
  insertTranslationAdjacent(original, placeholder)
  ;(original as HTMLElement).setAttribute(TRANSLATED_ATTR, '1')
  placeholder.textContent = ''
  let sourceChanged = false
  const sourceObserver =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((mutations) => {
          if (sourceChanged) return
          const changedSource = mutations.some((mutation) => {
            const targetElement =
              mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
            return (
              !targetElement ||
              (targetElement !== placeholder && !placeholder.contains(targetElement))
            )
          })
          if (!changedSource) return
          sourceChanged = true
          placeholder.remove()
          ;(original as HTMLElement).removeAttribute(TRANSLATED_ATTR)
        })
  sourceObserver?.observe(original, {
    attributeFilter: DYNAMIC_TRANSLATION_ATTRIBUTE_FILTER,
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  })

  try {
    const lines = text.split(/\r?\n/)
    const resultLines: string[] = []
    for (const line of lines) {
      if (!line) {
        resultLines.push('')
        placeholder.textContent = resultLines.join('\n')
        continue
      }
      const cacheKey = buildCacheKey(line, sourceLanguage, targetLanguage)
      const cached = getCachedTranslation(cacheKey)
      if (cached) {
        resultLines.push(cached)
        placeholder.textContent = resultLines.join('\n')
        continue
      }
      const finalLine = await translateLineWithStreamingSupport(
        translator,
        line,
        sourceLanguage,
        targetLanguage,
        (partial) => {
          // 增量更新当前行
          placeholder.textContent = resultLines.concat(partial).join('\n')
        },
      )
      setCachedTranslation(cacheKey, finalLine)
      resultLines.push(finalLine)
      placeholder.textContent = resultLines.join('\n')
    }

    sourceObserver?.disconnect()
    const placeholderParent = placeholder.parentNode
    const placeholderNextSibling = placeholder.nextSibling
    placeholder.remove()
    ;(original as HTMLElement).removeAttribute(TRANSLATED_ATTR)
    const latestItem = getLatestTranslatableBlockItem(original)
    if (!latestItem) return
    if (sourceChanged || latestItem.text !== text) {
      const latestContext = resolveLatestTranslationContext
        ? await resolveLatestTranslationContext(latestItem.text)
        : { sourceLanguage, translator }
      if (!latestContext) return
      await translateIntoElementPreservingNewlines(
        original,
        latestContext.translator,
        latestItem.text,
        latestContext.sourceLanguage,
        targetLanguage,
        latestItem.nodeMap,
        resolveLatestTranslationContext,
      )
      return
    }
    if (placeholderParent) {
      placeholderParent.insertBefore(placeholder, placeholderNextSibling)
    } else {
      insertTranslationAdjacent(original, placeholder)
    }
    ;(original as HTMLElement).setAttribute(TRANSLATED_ATTR, '1')

    // 翻译完全结束后，如果存在 nodeMap，进行最终的精细渲染还原节点
    if (nodeMap && nodeMap.size > 0) {
      const finalContent = resultLines.join('\n')
      const fragment = renderMarkedText(finalContent, nodeMap)
      placeholder.textContent = ''
      placeholder.appendChild(fragment)
    }
  } catch (error) {
    sourceObserver?.disconnect()
    placeholder.remove()
    ;(original as HTMLElement).removeAttribute(TRANSLATED_ATTR)
    throw error
  }
}

async function translateTextPreservingNewlines(
  translator: TranslatorInstance | null,
  text: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<string> {
  // 按原始换行分段翻译，保证换行结构不被打乱
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    if (!line) {
      out.push('')
      continue
    }
    const lineKey = buildCacheKey(line, sourceLanguage, targetLanguage)
    let translatedLine = getCachedTranslation(lineKey)
    if (!translatedLine) {
      let pendingTranslation = pendingTranslationPromises.get(lineKey)
      if (!pendingTranslation) {
        pendingTranslation = (async () => {
          const result = translator
            ? await translator.translate(line)
            : await bridgeTranslate(line, sourceLanguage, targetLanguage)
          setCachedTranslation(lineKey, result)
          return result
        })()
        pendingTranslationPromises.set(lineKey, pendingTranslation)
      }
      try {
        translatedLine = await pendingTranslation
      } finally {
        if (pendingTranslationPromises.get(lineKey) === pendingTranslation) {
          pendingTranslationPromises.delete(lineKey)
        }
      }
    }
    out.push(translatedLine)
  }
  return out.join('\n')
}

async function translateCurrentPendingText(
  staleTranslation: string,
  initialText: string,
  currentText: string | null | undefined,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  translator: TranslatorInstance | null,
): Promise<{ text: string; translated: string } | null> {
  const text = currentText?.trim()
  if (!text || text.length < MIN_LENGTH_GENERIC) return null
  if (text === initialText) return { text, translated: staleTranslation }

  const latestContext = await resolveTranslationContextForText(text, targetLanguage, {
    sourceLanguage,
    translator,
  })
  if (!latestContext) return null

  const translated = await translateTextPreservingNewlines(
    latestContext.translator,
    text,
    latestContext.sourceLanguage,
    targetLanguage,
  )
  return translated ? { text, translated } : null
}

async function translatePlaceholdersSequentially(
  translator: TranslatorInstance | null,
  items: TranslatablePlaceholderItem[],
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  resolveItemTranslationContext?: LatestTranslationContextResolver,
): Promise<void> {
  for (const { element, text } of items) {
    try {
      if (!shouldTranslatePlaceholderElement(element)) continue
      let itemContext: TranslationContext | null = {
        sourceLanguage,
        translator,
      }
      if (resolveItemTranslationContext) {
        itemContext = await resolveItemTranslationContext(text)
      }
      if (!itemContext) continue
      if (!shouldTranslatePlaceholderElement(element)) continue
      let currentText = text
      const currentPlaceholder = element.getAttribute('placeholder')?.trim()
      if (currentPlaceholder && currentPlaceholder !== text) {
        const latestContext = await resolveTranslationContextForText(
          currentPlaceholder,
          targetLanguage,
          itemContext,
        )
        if (!latestContext) continue
        itemContext = latestContext
        currentText = currentPlaceholder
      }

      const translated = await translateTextPreservingNewlines(
        itemContext.translator,
        currentText,
        itemContext.sourceLanguage,
        targetLanguage,
      )
      if (!translated) continue
      if (!shouldTranslatePlaceholderElement(element)) continue
      const latest = await translateCurrentPendingText(
        translated,
        currentText,
        element.getAttribute('placeholder'),
        itemContext.sourceLanguage,
        targetLanguage,
        itemContext.translator,
      )
      if (!latest || !shouldTranslatePlaceholderElement(element)) continue
      if (element.getAttribute('placeholder')?.trim() !== latest.text) continue
      if (!element.hasAttribute(ORIGINAL_PLACEHOLDER_ATTR)) {
        element.setAttribute(ORIGINAL_PLACEHOLDER_ATTR, latest.text)
      }
      suppressNextTranslatedAttributeMutation(element, 'placeholder')
      element.setAttribute('placeholder', latest.translated)
      element.setAttribute(TRANSLATED_PLACEHOLDER_ATTR, '1')
    } catch (_error) {
      // Keep the original placeholder if attribute translation fails.
    }
  }
}

async function translateTextAttributesSequentially(
  translator: TranslatorInstance | null,
  items: TranslatableTextAttributeItem[],
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  resolveItemTranslationContext?: LatestTranslationContextResolver,
): Promise<void> {
  for (const { attributeName, element, text } of items) {
    try {
      if (!shouldTranslateCurrentTextAttribute(element, attributeName)) continue
      let itemContext: TranslationContext | null = {
        sourceLanguage,
        translator,
      }
      if (resolveItemTranslationContext) {
        itemContext = await resolveItemTranslationContext(text)
      }
      if (!itemContext) continue
      if (!shouldTranslateCurrentTextAttribute(element, attributeName)) continue
      let currentText = text
      const currentAttributeText = getTranslatableTextAttributeValue(element, attributeName)?.trim()
      if (currentAttributeText && currentAttributeText !== text) {
        const latestContext = await resolveTranslationContextForText(
          currentAttributeText,
          targetLanguage,
          itemContext,
        )
        if (!latestContext) continue
        itemContext = latestContext
        currentText = currentAttributeText
      }

      const translated = await translateTextPreservingNewlines(
        itemContext.translator,
        currentText,
        itemContext.sourceLanguage,
        targetLanguage,
      )
      if (!translated) continue
      if (!shouldTranslateCurrentTextAttribute(element, attributeName)) continue
      const latest = await translateCurrentPendingText(
        translated,
        currentText,
        getTranslatableTextAttributeValue(element, attributeName),
        itemContext.sourceLanguage,
        targetLanguage,
        itemContext.translator,
      )
      if (!latest) continue
      if (getTranslatableTextAttributeValue(element, attributeName)?.trim() !== latest.text) {
        continue
      }
      const originalMarker = getOriginalTextAttributeMarker(attributeName)
      if (!element.hasAttribute(originalMarker)) {
        element.setAttribute(originalMarker, latest.text)
      }
      suppressNextTranslatedAttributeMutation(element, attributeName)
      setTranslatableTextAttribute(element, attributeName, latest.translated)
      element.setAttribute(getTranslatedTextAttributeMarker(attributeName), '1')
    } catch (_error) {
      // Keep the original attribute if text attribute translation fails.
    }
  }
}

async function translateTextContentSequentially(
  translator: TranslatorInstance | null,
  items: TranslatableTextContentItem[],
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  resolveItemTranslationContext?: LatestTranslationContextResolver,
): Promise<void> {
  for (const { element, text } of items) {
    try {
      if (!shouldTranslateTextContentElement(element)) continue
      let itemContext: TranslationContext | null = {
        sourceLanguage,
        translator,
      }
      if (resolveItemTranslationContext) {
        itemContext = await resolveItemTranslationContext(text)
      }
      if (!itemContext) continue
      if (!shouldTranslateTextContentElement(element)) continue
      let currentText = text
      const currentTextContent = element.textContent?.trim()
      if (currentTextContent && currentTextContent !== text) {
        const latestContext = await resolveTranslationContextForText(
          currentTextContent,
          targetLanguage,
          itemContext,
        )
        if (!latestContext) continue
        itemContext = latestContext
        currentText = currentTextContent
      }

      const translated = await translateTextPreservingNewlines(
        itemContext.translator,
        currentText,
        itemContext.sourceLanguage,
        targetLanguage,
      )
      if (!translated) continue
      if (!shouldTranslateTextContentElement(element)) continue
      const latest = await translateCurrentPendingText(
        translated,
        currentText,
        element.textContent,
        itemContext.sourceLanguage,
        targetLanguage,
        itemContext.translator,
      )
      if (!latest) continue
      if (element.textContent?.trim() !== latest.text) continue
      if (!element.hasAttribute(ORIGINAL_TEXT_CONTENT_ATTR)) {
        element.setAttribute(ORIGINAL_TEXT_CONTENT_ATTR, latest.text)
      }
      if (isOptionTextContentElement(element) && !element.hasAttribute('value')) {
        element.setAttribute(IMPLICIT_OPTION_VALUE_ATTR, '1')
        element.setAttribute('value', latest.text)
      }
      suppressNextTranslatedTextContentMutation(element)
      element.textContent = latest.translated
      element.setAttribute(TRANSLATED_TEXT_CONTENT_ATTR, '1')
    } catch (_error) {
      // Keep the original text content if SVG metadata translation fails.
    }
  }
}

async function translateDocumentTitle(
  translator: TranslatorInstance | null,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  resolveItemTranslationContext?: LatestTranslationContextResolver,
): Promise<void> {
  try {
    if (!shouldTranslateDocumentTitle()) return
    const title = getDocumentTitleElement()
    if (!title) return

    const currentText = getDocumentTitleText()
    let itemContext: TranslationContext | null = {
      sourceLanguage,
      translator,
    }
    if (resolveItemTranslationContext) {
      itemContext = await resolveItemTranslationContext(currentText)
    }
    if (!itemContext || !shouldTranslateDocumentTitle()) return

    const translated = await translateTextPreservingNewlines(
      itemContext.translator,
      currentText,
      itemContext.sourceLanguage,
      targetLanguage,
    )
    if (!translated || !shouldTranslateDocumentTitle()) return

    const latest = await translateCurrentPendingText(
      translated,
      currentText,
      document.title,
      itemContext.sourceLanguage,
      targetLanguage,
      itemContext.translator,
    )
    if (!latest || document.title.trim() !== latest.text) return
    if (!title.hasAttribute(ORIGINAL_DOCUMENT_TITLE_ATTR)) {
      title.setAttribute(ORIGINAL_DOCUMENT_TITLE_ATTR, latest.text)
    }
    suppressNextTranslatedTextContentMutation(title)
    document.title = latest.translated
    title.setAttribute(TRANSLATED_DOCUMENT_TITLE_ATTR, '1')
  } catch (_error) {
    // Keep the original document title if title translation fails.
  }
}

async function translateBlocksSequentially(
  translator: TranslatorInstance | null,
  items: TranslatableBlockItem[],
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  _onProgress: (done: number, total: number) => void,
  resolveItemTranslationContext?: LatestTranslationContextResolver,
): Promise<void> {
  const BATCH_SIZE = 20

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)

    // 为当前批次中的所有元素插入骨架屏
    const skeletons = batch.map(({ element }) => {
      const sk = createSkeletonPlaceholder(element)
      insertTranslationAdjacent(element, sk)
      return { element, skeleton: sk }
    })

    for (let j = 0; j < batch.length; j++) {
      const { element, text, nodeMap } = batch[j]
      const skeleton = skeletons[j].skeleton

      if (!shouldContinueTranslatingBlockElement(element)) {
        skeleton.remove()
        continue
      }

      let itemContext: TranslationContext | null = {
        sourceLanguage,
        translator,
      }
      if (resolveItemTranslationContext) {
        itemContext = await resolveItemTranslationContext(text)
      }
      if (!itemContext) {
        skeleton.remove()
        continue
      }
      if (!shouldContinueTranslatingBlockElement(element)) {
        skeleton.remove()
        continue
      }
      const latestBeforeTranslation = getLatestTranslatableBlockItemIgnoringTemporaryElement(
        element,
        skeleton,
      )
      if (!latestBeforeTranslation) {
        skeleton.remove()
        continue
      }

      let currentText = text
      let currentNodeMap = nodeMap
      if (latestBeforeTranslation.text !== text) {
        const latestContext = await resolveTranslationContextForText(
          latestBeforeTranslation.text,
          targetLanguage,
          {
            sourceLanguage: itemContext.sourceLanguage,
            translator: itemContext.translator,
          },
        )
        if (!latestContext) {
          skeleton.remove()
          continue
        }
        itemContext = latestContext
        currentText = latestBeforeTranslation.text
        currentNodeMap = latestBeforeTranslation.nodeMap
      }

      const cacheKey = buildCacheKey(currentText, itemContext.sourceLanguage, targetLanguage)
      let translated = getCachedTranslation(cacheKey)
      let translatedNodeMap = currentNodeMap

      if (!translated) {
        try {
          if (currentText.length >= STREAMING_LENGTH_THRESHOLD) {
            // 流式翻译会自动替换骨架屏前面的占位，这里我们需要特殊处理
            // 为简单起见，流式翻译内部会创建自己的 placeholder，所以我们先删掉骨架屏
            skeleton.remove()
            await translateIntoElementPreservingNewlines(
              element,
              itemContext.translator,
              currentText,
              itemContext.sourceLanguage,
              targetLanguage,
              currentNodeMap,
              (latestText) =>
                resolveTranslationContextForText(latestText, targetLanguage, {
                  sourceLanguage: itemContext.sourceLanguage,
                  translator: itemContext.translator,
                }),
            )
            continue
          }

          translated = await translateTextPreservingNewlines(
            itemContext.translator,
            currentText,
            itemContext.sourceLanguage,
            targetLanguage,
          )
          setCachedTranslation(cacheKey, translated)
        } catch (_e) {
          translated = ''
        }
      }

      skeleton.remove()
      const latestItem = getLatestTranslatableBlockItem(element)
      if (!latestItem) continue
      if (latestItem.text !== currentText) {
        const latestContext = await resolveTranslationContextForText(
          latestItem.text,
          targetLanguage,
          {
            sourceLanguage: itemContext.sourceLanguage,
            translator: itemContext.translator,
          },
        )
        if (!latestContext) continue
        const latestCacheKey = buildCacheKey(
          latestItem.text,
          latestContext.sourceLanguage,
          targetLanguage,
        )
        translated = getCachedTranslation(latestCacheKey)
        if (!translated) {
          try {
            translated = await translateTextPreservingNewlines(
              latestContext.translator,
              latestItem.text,
              latestContext.sourceLanguage,
              targetLanguage,
            )
            setCachedTranslation(latestCacheKey, translated)
          } catch (_e) {
            translated = ''
          }
        }
        translatedNodeMap = latestItem.nodeMap
      }
      if (translated) {
        let content: string | DocumentFragment = translated
        if (translatedNodeMap && translatedNodeMap.size > 0) {
          content = renderMarkedText(translated, translatedNodeMap)
        }
        const clone = createTranslationSpan(element, content, targetLanguage)
        insertTranslationAdjacent(element, clone)
        ;(element as HTMLElement).setAttribute(TRANSLATED_ATTR, '1')
      }
    }

    // 让出事件循环
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

function isNativeTranslateGeneratedElement(element: Element): boolean {
  return Boolean(
    element.closest(
      `.${TRANSLATED_CLASS}, .native-translate-skeleton, .native-translate-inline-hint`,
    ),
  )
}

function isNativeTranslateGeneratedRemoval(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.classList.contains(TRANSLATED_CLASS) ||
      node.classList.contains('native-translate-skeleton') ||
      node.classList.contains('native-translate-inline-hint') ||
      node.classList.contains(WRAPPED_CLASS))
  )
}

function removeAdjacentGeneratedSiblings(root: Element): void {
  const next = root.nextElementSibling
  removeGeneratedSiblingChain(next)
}

function removeGeneratedSiblingChain(start: Element | Node | null): void {
  let next = start instanceof Element ? start : null
  while (
    next instanceof HTMLElement &&
    (next.classList.contains(TRANSLATED_CLASS) ||
      next.classList.contains('native-translate-skeleton'))
  ) {
    const current = next
    next = next.nextElementSibling
    current.remove()
  }
}

function unwrapGeneratedWrapper(wrapper: Element): void {
  while (wrapper.firstChild) {
    wrapper.parentNode?.insertBefore(wrapper.firstChild, wrapper)
  }
  wrapper.remove()
}

function clearGeneratedTranslationDescendants(root: ParentNode): void {
  const scopedElements =
    root instanceof Element
      ? [root, ...Array.from(root.querySelectorAll('*'))]
      : Array.from(root.querySelectorAll('*'))
  const shadowHosts = scopedElements.filter((element) => element.shadowRoot)

  const inserted = root.querySelectorAll(`.${TRANSLATED_CLASS}, .native-translate-skeleton`)
  for (const element of Array.from(inserted)) {
    element.remove()
  }

  const marked = root.querySelectorAll(`[${TRANSLATED_ATTR}="1"]`)
  for (const element of Array.from(marked)) {
    if ((element as HTMLElement).classList.contains(TRANSLATED_CLASS)) continue
    ;(element as HTMLElement).removeAttribute(TRANSLATED_ATTR)
  }

  for (const element of scopedElements) {
    if ((element as HTMLElement).getAttribute(SEGMENTED_ATTR) === '1') {
      ;(element as HTMLElement).removeAttribute(SEGMENTED_ATTR)
    }
    if (element.hasAttribute(ORIGINAL_PLACEHOLDER_ATTR)) {
      restoreTranslatedPlaceholder(element)
    }
    restoreTranslatedTextAttributes(element)
    restoreTranslatedTextContent(element)
  }

  const wrappers =
    root instanceof Element && root.classList.contains(WRAPPED_CLASS)
      ? [root, ...Array.from(root.querySelectorAll(`.${WRAPPED_CLASS}`))]
      : Array.from(root.querySelectorAll(`.${WRAPPED_CLASS}`))
  for (const wrapper of wrappers) {
    unwrapGeneratedWrapper(wrapper)
  }

  for (const host of shadowHosts) {
    if (host.shadowRoot) {
      clearGeneratedTranslationDescendants(host.shadowRoot)
    }
  }
}

function clearDynamicRootTranslationState(root: Element): void {
  if (root.classList.contains(TRANSLATED_CLASS)) return
  removeAdjacentGeneratedSiblings(root)

  if ((root as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1') {
    ;(root as HTMLElement).removeAttribute(TRANSLATED_ATTR)
  }
  clearGeneratedTranslationDescendants(root)
}

function getDynamicTranslationProcessRoot(root: Element): ParentNode | null {
  if (!root.classList.contains(WRAPPED_CLASS)) {
    let current: Element | null = root
    while (current) {
      if (
        (current as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1' &&
        !current.classList.contains(TRANSLATED_CLASS)
      ) {
        return current
      }
      current = getComposedParentElement(current)
    }

    return root
  }

  const parent = root.parentNode
  if (parent instanceof Element) return parent.isConnected ? parent : null
  if (parent instanceof ShadowRoot) return parent.host.isConnected ? parent : null
  return parent
}

function getDynamicTranslationCleanupRoot(root: Element, processRoot: ParentNode): Element {
  return processRoot instanceof Element ? processRoot : root
}

interface DynamicTranslationProcessEntry {
  cleanupRoot: Element
  processRoot: ParentNode
}

function normalizeDynamicTranslationProcessEntries(
  roots: Element[],
): DynamicTranslationProcessEntry[] {
  const entries: DynamicTranslationProcessEntry[] = []

  for (const root of roots) {
    if (!root.isConnected || isNativeTranslateGeneratedElement(root)) continue

    const processRoot = getDynamicTranslationProcessRoot(root)
    if (!processRoot) continue
    if (entries.some((entry) => entry.processRoot === processRoot)) continue

    entries.push({
      cleanupRoot: getDynamicTranslationCleanupRoot(root, processRoot),
      processRoot,
    })
  }

  return entries
}

function stopFullPageTranslationObserver(): void {
  if (!fullPageTranslationObserver) return
  const {
    attachShadowPatch,
    inputValueDescriptorPatch,
    originalAttachShadow,
    popoverMethodPatches,
    textareaValueDescriptorPatch,
  } = fullPageTranslationObserver
  if (
    attachShadowPatch &&
    originalAttachShadow &&
    Element.prototype.attachShadow === attachShadowPatch
  ) {
    Element.prototype.attachShadow = originalAttachShadow
  }
  if (inputValueDescriptorPatch) {
    const current = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    if (current?.set === inputValueDescriptorPatch.patch.set) {
      Object.defineProperty(HTMLInputElement.prototype, 'value', inputValueDescriptorPatch.original)
    }
  }
  if (textareaValueDescriptorPatch) {
    const current = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
    if (current?.set === textareaValueDescriptorPatch.patch.set) {
      Object.defineProperty(
        HTMLTextAreaElement.prototype,
        'value',
        textareaValueDescriptorPatch.original,
      )
    }
  }
  for (const { methodName, original, patch } of popoverMethodPatches ?? []) {
    if ((HTMLElement.prototype[methodName] as PopoverMethod | undefined) === patch) {
      Object.defineProperty(HTMLElement.prototype, methodName, {
        configurable: true,
        value: original,
        writable: true,
      })
    }
  }
  fullPageTranslationObserver.observer.disconnect()
  if (fullPageTranslationObserver.timer !== null) {
    window.clearTimeout(fullPageTranslationObserver.timer)
  }
  fullPageTranslationObserver = null
}

function scheduleDynamicPageTranslation(state: FullPageTranslationObserverState): void {
  if (state.timer !== null) return
  state.timer = window.setTimeout(() => {
    state.timer = null
    void translatePendingDynamicRoots(state)
  }, 80)
}

function queueDynamicTranslationRoot(state: FullPageTranslationObserverState, root: Element): void {
  if (!root.isConnected) return
  if (isNativeTranslateGeneratedElement(root)) return
  state.pendingRoots.add(root)
  scheduleDynamicPageTranslation(state)
}

function queueDynamicDocumentTitleTranslation(state: FullPageTranslationObserverState): void {
  if (!getDocumentTitleElement()) return
  state.pendingDocumentTitle = true
  scheduleDynamicPageTranslation(state)
}

function isDocumentTitleMutation(mutation: MutationRecord): boolean {
  if (mutation.target instanceof HTMLTitleElement) return true
  if (mutation.target.parentElement instanceof HTMLTitleElement) return true
  return Array.from(mutation.addedNodes).some((node) => node instanceof HTMLTitleElement)
}

function isSameOrComposedDescendant(element: Element, ancestor: Element): boolean {
  if (element === ancestor) return true
  let current = getComposedParentElement(element)
  while (current) {
    if (current === ancestor) return true
    current = getComposedParentElement(current)
  }
  return false
}

function normalizeDynamicTranslationRoots(roots: Element[]): Element[] {
  const normalized: Element[] = []

  for (const root of roots) {
    if (normalized.some((existing) => isSameOrComposedDescendant(root, existing))) continue

    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      if (isSameOrComposedDescendant(normalized[index], root)) {
        normalized.splice(index, 1)
      }
    }

    normalized.push(root)
  }

  return normalized
}

function wrapLooseTextNode(parent: Node, node: Node): Element | null {
  if (node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent?.trim()
  if (!text || text.length < MIN_LENGTH_GENERIC) return null

  const translationContext =
    parent instanceof Element ? parent : parent instanceof ShadowRoot ? parent.host : null
  if (
    !translationContext ||
    !shouldTranslateElement(translationContext) ||
    !isElementVisible(translationContext)
  ) {
    return null
  }

  const wrapper = document.createElement('div')
  wrapper.className = WRAPPED_CLASS
  wrapper.style.display = 'block'
  wrapper.style.margin = '1em 0'
  parent.insertBefore(wrapper, node)
  wrapper.appendChild(node)
  return wrapper
}

function observeShadowRoot(state: FullPageTranslationObserverState, shadowRoot: ShadowRoot): void {
  if (state.observedShadowRoots.has(shadowRoot)) return
  state.observer.observe(shadowRoot, {
    attributeOldValue: true,
    attributeFilter: DYNAMIC_TRANSLATION_ATTRIBUTE_FILTER,
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  })
  state.observedShadowRoots.add(shadowRoot)
}

function observeOpenShadowRoots(state: FullPageTranslationObserverState, root: ParentNode): void {
  const elements =
    root instanceof Element
      ? [root, ...Array.from(root.querySelectorAll('*'))]
      : Array.from(root.querySelectorAll('*'))

  for (const element of elements) {
    if (!element.shadowRoot) continue
    observeShadowRoot(state, element.shadowRoot)
    observeOpenShadowRoots(state, element.shadowRoot)
  }
}

function patchAttachShadowForDynamicTranslation(state: FullPageTranslationObserverState): void {
  const originalAttachShadow = Element.prototype.attachShadow
  const attachShadowPatch = function (this: Element, init: ShadowRootInit): ShadowRoot {
    const shadowRoot = originalAttachShadow.call(this, init)
    if (init.mode === 'open' && state === fullPageTranslationObserver) {
      observeShadowRoot(state, shadowRoot)
      queueDynamicTranslationRoot(state, this)
    }
    return shadowRoot
  }

  state.originalAttachShadow = originalAttachShadow
  state.attachShadowPatch = attachShadowPatch
  Element.prototype.attachShadow = attachShadowPatch
}

function patchInputValueSetterForDynamicTranslation(state: FullPageTranslationObserverState): void {
  const original = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  if (!original?.get || !original.set || original.configurable === false) return

  const patch: PropertyDescriptor = {
    configurable: true,
    enumerable: original.enumerable,
    get(this: HTMLInputElement): string {
      return original.get?.call(this) ?? ''
    },
    set(this: HTMLInputElement, value: string): void {
      const previousValue = original.get?.call(this)
      original.set?.call(this, value)

      if (suppressedTranslatedInputValueSetters.has(this)) {
        suppressedTranslatedInputValueSetters.delete(this)
        return
      }
      if (state !== fullPageTranslationObserver || !this.isConnected) return

      const currentValue = original.get?.call(this)
      if (currentValue === previousValue) return

      const hasTranslatedValue =
        this.hasAttribute(getOriginalTextAttributeMarker('value')) ||
        this.getAttribute(getTranslatedTextAttributeMarker('value')) === '1'
      const hasPlaceholderVisibilityChange =
        isPlaceholderInputElement(this) &&
        Boolean(this.getAttribute('placeholder')?.trim()) &&
        Boolean(previousValue?.trim()) !== Boolean(currentValue?.trim())
      if (
        !hasTranslatedValue &&
        !hasPlaceholderVisibilityChange &&
        !isTranslatableTextAttributeElement(this, 'value')
      ) {
        return
      }

      clearTranslatedAttributeMarkersAfterExternalMutation(this, 'value')
      if (
        hasTranslatedValue &&
        (!currentValue ||
          currentValue.trim().length < MIN_LENGTH_GENERIC ||
          !isTranslatableTextAttributeElement(this, 'value'))
      ) {
        this.removeAttribute('value')
      }
      queueDynamicTranslationRoot(state, this)
    },
  }

  state.inputValueDescriptorPatch = { original, patch }
  Object.defineProperty(HTMLInputElement.prototype, 'value', patch)
}

function patchTextareaValueSetterForDynamicTranslation(
  state: FullPageTranslationObserverState,
): void {
  const original = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  if (!original?.get || !original.set || original.configurable === false) return

  const patch: PropertyDescriptor = {
    configurable: true,
    enumerable: original.enumerable,
    get(this: HTMLTextAreaElement): string {
      return original.get?.call(this) ?? ''
    },
    set(this: HTMLTextAreaElement, value: string): void {
      const previousValue = original.get?.call(this)
      original.set?.call(this, value)

      if (state !== fullPageTranslationObserver || !this.isConnected) return

      const currentValue = original.get?.call(this)
      if (currentValue === previousValue) return

      const hasPlaceholderVisibilityChange =
        Boolean(this.getAttribute('placeholder')?.trim()) &&
        Boolean(previousValue?.trim()) !== Boolean(currentValue?.trim())
      if (!hasPlaceholderVisibilityChange) return

      queueDynamicTranslationRoot(state, this)
    },
  }

  state.textareaValueDescriptorPatch = { original, patch }
  Object.defineProperty(HTMLTextAreaElement.prototype, 'value', patch)
}

function patchPopoverMethodsForDynamicTranslation(state: FullPageTranslationObserverState): void {
  const methodNames: PopoverMethodName[] = ['showPopover', 'hidePopover', 'togglePopover']
  const patches: PopoverMethodPatch[] = []

  for (const methodName of methodNames) {
    const original = HTMLElement.prototype[methodName] as PopoverMethod | undefined
    if (typeof original !== 'function') continue

    const patch = function (this: HTMLElement, ...args: unknown[]): unknown {
      const result = original.apply(this, args)
      if (state === fullPageTranslationObserver) {
        queueDynamicTranslationRoot(state, this)
      }
      return result
    }

    Object.defineProperty(HTMLElement.prototype, methodName, {
      configurable: true,
      value: patch,
      writable: true,
    })
    patches.push({ methodName, original, patch })
  }

  state.popoverMethodPatches = patches
}

function shouldProcessDynamicAttributeMutation(mutation: MutationRecord): boolean {
  if (!(mutation.target instanceof Element)) return false
  if (shouldIgnoreSuppressedTranslatedAttributeMutation(mutation)) return false
  clearTranslatedAttributeMarkersAfterExternalMutation(mutation.target, mutation.attributeName)

  if (mutation.attributeName === 'role') {
    const currentRole = mutation.target.getAttribute('role') ?? ''
    const previousRole = mutation.oldValue ?? ''
    return (
      hasTranslationRelevantRoleToken(currentRole) || hasTranslationRelevantRoleToken(previousRole)
    )
  }

  if (mutation.attributeName === 'aria-live') {
    const currentAriaLive = mutation.target.getAttribute('aria-live')
    const previousAriaLive = mutation.oldValue
    return (
      isTranslationRelevantAriaLiveValue(currentAriaLive) ||
      isTranslationRelevantAriaLiveValue(previousAriaLive)
    )
  }

  if (mutation.attributeName === 'aria-hidden') {
    const currentAriaHidden = mutation.target.getAttribute('aria-hidden')
    const previousAriaHidden = mutation.oldValue
    return (
      isTranslationRelevantAriaHiddenValue(currentAriaHidden) ||
      isTranslationRelevantAriaHiddenValue(previousAriaHidden)
    )
  }

  if (mutation.attributeName === 'id') {
    const root = mutation.target.getRootNode()
    if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return false
    return (
      isAriaTextReferenceIdInUse(root, mutation.target.getAttribute('id')) ||
      isAriaTextReferenceIdInUse(root, mutation.oldValue) ||
      (mutation.target instanceof HTMLDataListElement &&
        (isDatalistIdInUse(root, mutation.target.getAttribute('id')) ||
          isDatalistIdInUse(root, mutation.oldValue)))
    )
  }

  if (mutation.attributeName === 'name') {
    const root = mutation.target.getRootNode()
    if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return false
    return (
      mutation.target instanceof HTMLMapElement &&
      (isImageMapNameInUse(root, mutation.target.getAttribute('name')) ||
        isImageMapNameInUse(root, mutation.oldValue))
    )
  }

  if (mutation.attributeName === 'class') {
    const currentClass = mutation.target.getAttribute('class') ?? ''
    const previousClass = mutation.oldValue ?? ''
    if (
      TRANSLATION_RELEVANT_CLASS_PATTERN.test(currentClass) ||
      TRANSLATION_RELEVANT_CLASS_PATTERN.test(previousClass) ||
      isHiddenFromTranslation(mutation.target)
    ) {
      return true
    }

    const isUntranslatedReadableElement =
      (mutation.target as HTMLElement).getAttribute(TRANSLATED_ATTR) !== '1' &&
      shouldTranslateElement(mutation.target) &&
      collectTranslatableBlocks(mutation.target).length > 0
    if (isUntranslatedReadableElement) return true

    return (
      getAriaTextReferenceIdsForElement(mutation.target).length > 0 ||
      getDatalistIdsForElement(mutation.target).length > 0 ||
      getImageMapNamesForElement(mutation.target).length > 0 ||
      hasMediaTrackLabelElement(mutation.target)
    )
  }

  if (mutation.attributeName !== 'style') return true

  const currentStyle = mutation.target.getAttribute('style') ?? ''
  const previousStyle = mutation.oldValue ?? ''
  return (
    VISIBILITY_STYLE_PROPERTY_PATTERN.test(currentStyle) ||
    VISIBILITY_STYLE_PROPERTY_PATTERN.test(previousStyle)
  )
}

function hasTranslationRelevantRoleToken(value: string): boolean {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/g)
    .some(
      (role) =>
        INTERACTIVE_CONTROL_ROLES.has(role) ||
        LIVE_REGION_ROLES.has(role) ||
        NAV_LIKE_CONTAINER_ROLES.has(role) ||
        ARIA_TABLE_STRUCTURE_ROLES.has(role) ||
        ARIA_TABLE_CELL_ROLES.has(role) ||
        ARIA_LIST_STRUCTURE_ROLES.has(role) ||
        ARIA_LIST_ITEM_ROLES.has(role) ||
        ARIA_FEED_STRUCTURE_ROLES.has(role) ||
        ARIA_FEED_ITEM_ROLES.has(role) ||
        ARIA_CONTENT_BLOCK_ROLES.has(role) ||
        role === 'heading',
    )
}

function isTranslationRelevantAriaLiveValue(value: string | null): boolean {
  return value !== null && value.trim().toLowerCase() !== 'off'
}

function isTranslationRelevantAriaHiddenValue(value: string | null): boolean {
  return value?.trim().toLowerCase() === 'true'
}

function isImageMapNameInUse(root: Document | ShadowRoot, name: string | null): boolean {
  const normalizedName = normalizeUseMapName(name)
  if (!normalizedName) return false
  return Array.from(root.querySelectorAll('img[usemap]')).some(
    (image) => normalizeUseMapName(image.getAttribute('usemap')) === normalizedName,
  )
}

function isDatalistIdInUse(root: Document | ShadowRoot, id: string | null): boolean {
  const normalizedId = id?.trim()
  if (!normalizedId) return false
  return Array.from(root.querySelectorAll('input[list]')).some(
    (input) => input.getAttribute('list') === normalizedId,
  )
}

function queueAriaTextReferenceTargets(
  state: FullPageTranslationObserverState,
  mutation: MutationRecord,
): void {
  if (!(mutation.target instanceof Element) || !mutation.attributeName) return

  const root = mutation.target.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return

  const referencedIds = new Set(getAriaTextReferenceIdsForElement(mutation.target))
  if (ARIA_TEXT_REFERENCE_ATTRIBUTES.includes(mutation.attributeName)) {
    for (const id of parseAriaIdReferences(mutation.oldValue)) {
      referencedIds.add(id)
    }
  }
  queueAriaTextReferenceTargetsForIds(state, root, referencedIds)
}

function queueAriaTextReferenceTargetsForIds(
  state: FullPageTranslationObserverState,
  root: Document | ShadowRoot,
  ids: Iterable<string>,
): void {
  for (const id of ids) {
    const referencedElement = findElementByIdInRoot(root, id)
    if (referencedElement) {
      queueDynamicTranslationRoot(state, referencedElement)
    }
  }
}

function getAriaTextReferenceIdsForElement(element: Element): string[] {
  const selector = ARIA_TEXT_REFERENCE_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(',')
  const elements = queryElementsIncludingOpenShadowRoots(element, selector)
  return elements.flatMap((candidate) =>
    ARIA_TEXT_REFERENCE_ATTRIBUTES.flatMap((attribute) =>
      parseAriaIdReferences(candidate.getAttribute(attribute)),
    ),
  )
}

function queueAriaTextReferenceTargetsForInsertedElement(
  state: FullPageTranslationObserverState,
  element: Element,
): void {
  const root = element.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return
  queueAriaTextReferenceTargetsForIds(state, root, getAriaTextReferenceIdsForElement(element))
}

function queueAriaTextReferenceTargetsForRemovedElement(
  state: FullPageTranslationObserverState,
  root: Document | ShadowRoot,
  element: Element,
): void {
  queueAriaTextReferenceTargetsForIds(state, root, getAriaTextReferenceIdsForElement(element))
}

function queueDatalistAssociationTargets(
  state: FullPageTranslationObserverState,
  mutation: MutationRecord,
): void {
  if (!(mutation.target instanceof Element) || !mutation.attributeName) return

  const root = mutation.target.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return

  const datalistIds = new Set(getDatalistIdsForElement(mutation.target))
  if (mutation.target instanceof HTMLInputElement && mutation.attributeName === 'list') {
    datalistIds.add(mutation.oldValue?.trim() ?? '')
  }
  queueDatalistTargetsForIds(state, root, datalistIds)
}

function queueDatalistTargetsForIds(
  state: FullPageTranslationObserverState,
  root: Document | ShadowRoot,
  ids: Iterable<string>,
): void {
  for (const id of ids) {
    if (!id) continue
    const datalist = findElementByIdInRoot(root, id)
    if (datalist instanceof HTMLDataListElement) {
      queueDynamicTranslationRoot(state, datalist)
    }
  }
}

function getDatalistIdsForElement(element: Element): string[] {
  const inputs =
    element instanceof HTMLInputElement
      ? [element]
      : Array.from(element.querySelectorAll<HTMLInputElement>('input[list]'))
  return inputs.map((input) => input.getAttribute('list')?.trim() ?? '').filter(Boolean)
}

function queueDatalistTargetsForInsertedElement(
  state: FullPageTranslationObserverState,
  element: Element,
): void {
  const root = element.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return
  queueDatalistTargetsForIds(state, root, getDatalistIdsForElement(element))
}

function queueDatalistTargetsForRemovedElement(
  state: FullPageTranslationObserverState,
  root: Document | ShadowRoot,
  element: Element,
): void {
  queueDatalistTargetsForIds(state, root, getDatalistIdsForElement(element))
}

function findImageMapByNameInRoot(
  root: Document | ShadowRoot,
  name: string,
): HTMLMapElement | null {
  return (
    Array.from(root.querySelectorAll('map[name]')).find(
      (element): element is HTMLMapElement =>
        element instanceof HTMLMapElement && element.getAttribute('name') === name,
    ) ?? null
  )
}

function normalizeUseMapName(value: string | null): string {
  return value?.trim().replace(/^#/, '') ?? ''
}

function queueImageMapTargetsForNames(
  state: FullPageTranslationObserverState,
  root: Document | ShadowRoot,
  names: Iterable<string>,
): void {
  for (const name of names) {
    if (!name) continue
    const map = findImageMapByNameInRoot(root, name)
    if (map) queueDynamicTranslationRoot(state, map)
  }
}

function queueImageMapAssociationTargets(
  state: FullPageTranslationObserverState,
  mutation: MutationRecord,
): void {
  if (!(mutation.target instanceof Element) || !mutation.attributeName) return

  const root = mutation.target.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return

  const mapNames = new Set(getImageMapNamesForElement(mutation.target))
  if (mutation.attributeName === 'usemap') {
    mapNames.add(normalizeUseMapName(mutation.oldValue))
  }
  queueImageMapTargetsForNames(state, root, mapNames)
}

function queueImageMapTargetsForInsertedImage(
  state: FullPageTranslationObserverState,
  image: HTMLImageElement,
): void {
  const root = image.getRootNode()
  if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return
  queueImageMapTargetsForNames(state, root, [normalizeUseMapName(image.getAttribute('usemap'))])
}

function queueImageMapTargetsForInsertedElement(
  state: FullPageTranslationObserverState,
  element: Element,
): void {
  const images =
    element instanceof HTMLImageElement
      ? [element]
      : Array.from(element.querySelectorAll<HTMLImageElement>('img[usemap]'))
  for (const image of images) {
    queueImageMapTargetsForInsertedImage(state, image)
  }
}

function getImageMapNamesForElement(element: Element): string[] {
  const images =
    element instanceof HTMLImageElement
      ? [element]
      : Array.from(element.querySelectorAll<HTMLImageElement>('img[usemap]'))
  return images.map((image) => normalizeUseMapName(image.getAttribute('usemap'))).filter(Boolean)
}

function queueImageMapTargetsForRemovedElement(
  state: FullPageTranslationObserverState,
  root: Document | ShadowRoot,
  element: Element,
): void {
  queueImageMapTargetsForNames(state, root, getImageMapNamesForElement(element))
}

function handleDynamicTranslationMutations(
  state: FullPageTranslationObserverState,
  mutations: MutationRecord[],
): void {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes') {
      if (shouldProcessDynamicAttributeMutation(mutation) && mutation.target instanceof Element) {
        queueDynamicTranslationRoot(state, mutation.target)
        queueAriaTextReferenceTargets(state, mutation)
        queueDatalistAssociationTargets(state, mutation)
        queueImageMapAssociationTargets(state, mutation)
      }
      continue
    }

    if (shouldIgnoreSuppressedTranslatedTextContentMutation(mutation)) {
      continue
    }

    if (isDocumentTitleMutation(mutation)) {
      clearTranslatedDocumentTitleMarkersAfterExternalMutation()
      queueDynamicDocumentTitleTranslation(state)
      continue
    }

    if (mutation.type === 'characterData') {
      const parent = mutation.target.parentElement
      if (parent) {
        clearTranslatedTextContentMarkersAfterExternalMutation(parent)
        queueDynamicTranslationRoot(state, parent)
      }
      continue
    }

    if (mutation.target instanceof Element) {
      clearTranslatedTextContentMarkersAfterExternalMutation(mutation.target)
    }

    if (mutation.removedNodes.length > 0) {
      removeGeneratedSiblingChain(mutation.nextSibling)
      const root = mutation.target.getRootNode()
      if (root instanceof Document || root instanceof ShadowRoot) {
        for (const node of Array.from(mutation.removedNodes)) {
          if (node instanceof Element) {
            queueAriaTextReferenceTargetsForRemovedElement(state, root, node)
            queueDatalistTargetsForRemovedElement(state, root, node)
            queueImageMapTargetsForRemovedElement(state, root, node)
          }
        }
      }
      const removedSourceContent = Array.from(mutation.removedNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE || !isNativeTranslateGeneratedRemoval(node),
      )
      if (removedSourceContent && mutation.target instanceof Element) {
        queueDynamicTranslationRoot(state, mutation.target)
      }
    }

    for (const node of Array.from(mutation.addedNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        observeOpenShadowRoots(state, element)
        queueDynamicTranslationRoot(state, element)
        queueAriaTextReferenceTargetsForInsertedElement(state, element)
        queueDatalistTargetsForInsertedElement(state, element)
        queueImageMapTargetsForInsertedElement(state, element)
      } else if (node.parentElement) {
        queueDynamicTranslationRoot(state, node.parentElement)
      } else if (mutation.target instanceof ShadowRoot) {
        const wrapper = wrapLooseTextNode(mutation.target, node)
        if (wrapper) queueDynamicTranslationRoot(state, wrapper)
      }
    }
  }
}

async function translatePendingDynamicRoots(
  state: FullPageTranslationObserverState,
): Promise<void> {
  if (state !== fullPageTranslationObserver) return
  if (state.translating) {
    scheduleDynamicPageTranslation(state)
    return
  }

  const roots = normalizeDynamicTranslationRoots(Array.from(state.pendingRoots))
  state.pendingRoots.clear()
  const shouldTranslateTitle = state.pendingDocumentTitle && shouldTranslateDocumentTitle()
  state.pendingDocumentTitle = false
  if (roots.length === 0 && !shouldTranslateTitle) return

  state.translating = true
  try {
    const seenElements = new Set<Element>()
    const seenPlaceholderElements = new Set<Element>()
    const seenTextAttributeElements = new Map<Element, Set<TranslatableTextAttributeName>>()
    const seenTextContentElements = new Set<Element>()
    const items: TranslatableBlockItem[] = []
    const placeholderItems: TranslatablePlaceholderItem[] = []
    const textAttributeItems: TranslatableTextAttributeItem[] = []
    const textContentItems: TranslatableTextContentItem[] = []

    for (const { cleanupRoot, processRoot } of normalizeDynamicTranslationProcessEntries(roots)) {
      clearDynamicRootTranslationState(cleanupRoot)
      prepareDocumentForTranslation(processRoot, true)
      for (const item of collectTranslatableBlocks(processRoot)) {
        if (seenElements.has(item.element)) continue
        seenElements.add(item.element)
        items.push(item)
      }
      for (const item of collectTranslatablePlaceholders(processRoot)) {
        if (seenPlaceholderElements.has(item.element)) continue
        seenPlaceholderElements.add(item.element)
        placeholderItems.push(item)
      }
      for (const item of collectTranslatableTextAttributes(processRoot)) {
        const seenAttributes = seenTextAttributeElements.get(item.element) ?? new Set()
        if (seenAttributes.has(item.attributeName)) continue
        seenAttributes.add(item.attributeName)
        seenTextAttributeElements.set(item.element, seenAttributes)
        textAttributeItems.push(item)
      }
      for (const item of collectTranslatableTextContent(processRoot)) {
        if (seenTextContentElements.has(item.element)) continue
        seenTextContentElements.add(item.element)
        textContentItems.push(item)
      }
    }

    if (
      items.length > 0 ||
      placeholderItems.length > 0 ||
      textAttributeItems.length > 0 ||
      textContentItems.length > 0 ||
      shouldTranslateTitle
    ) {
      const hasTranslatorAdapter = Boolean(await resolveTranslatorAdapterWithRetry(0))
      const resolveDynamicTranslationContext = async (
        text: string,
      ): Promise<TranslationContext | null> => {
        if (hasTranslatorAdapter) {
          return resolveTranslationContextForText(text, state.targetLanguage)
        }

        const sourceLanguage = await inferSourceLanguageForText(text)
        if (isSameLanguage(sourceLanguage, state.targetLanguage)) return null
        return { sourceLanguage, translator: null }
      }

      await translateBlocksSequentially(
        null,
        items,
        state.sourceLanguage,
        state.targetLanguage,
        () => {},
        resolveDynamicTranslationContext,
      )
      await translatePlaceholdersSequentially(
        null,
        placeholderItems,
        state.sourceLanguage,
        state.targetLanguage,
        resolveDynamicTranslationContext,
      )
      await translateTextAttributesSequentially(
        null,
        textAttributeItems,
        state.sourceLanguage,
        state.targetLanguage,
        resolveDynamicTranslationContext,
      )
      await translateTextContentSequentially(
        null,
        textContentItems,
        state.sourceLanguage,
        state.targetLanguage,
        resolveDynamicTranslationContext,
      )
      if (shouldTranslateTitle) {
        await translateDocumentTitle(
          null,
          state.sourceLanguage,
          state.targetLanguage,
          resolveDynamicTranslationContext,
        )
      }
    }
  } finally {
    state.translating = false
    if (state.pendingRoots.size > 0) {
      scheduleDynamicPageTranslation(state)
    }
  }
}

function startFullPageTranslationObserver(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): FullPageTranslationObserverState | null {
  stopFullPageTranslationObserver()
  if (typeof MutationObserver === 'undefined' || !document.body) return null

  const state: FullPageTranslationObserverState = {
    observer: new MutationObserver((mutations) => {
      handleDynamicTranslationMutations(state, mutations)
    }),
    observedShadowRoots: new WeakSet<ShadowRoot>(),
    pendingDocumentTitle: false,
    pendingRoots: new Set<Element>(),
    sourceLanguage,
    targetLanguage,
    timer: null,
    translating: false,
  }

  fullPageTranslationObserver = state
  patchAttachShadowForDynamicTranslation(state)
  patchInputValueSetterForDynamicTranslation(state)
  patchTextareaValueSetterForDynamicTranslation(state)
  patchPopoverMethodsForDynamicTranslation(state)
  state.observer.observe(document.body, {
    attributeOldValue: true,
    attributeFilter: DYNAMIC_TRANSLATION_ATTRIBUTE_FILTER,
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  })
  if (document.head) {
    state.observer.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  }
  observeOpenShadowRoots(state, document.body)
  return state
}

function getPairKey(sourceLanguage: LanguageCode, targetLanguage: LanguageCode): string {
  return `${sourceLanguage} -> ${targetLanguage} `
}

async function markPairReady(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<void> {
  const key = getPairKey(sourceLanguage, targetLanguage)
  try {
    const storageNs: 'session' | 'local' = 'session' in chrome.storage ? 'session' : 'local'
    const data = await chrome.storage[storageNs].get(READY_PAIRS_KEY)
    const map = (data?.[READY_PAIRS_KEY] as Record<string, number> | undefined) ?? {}
    map[key] = Date.now()
    const sortedEntries = Object.entries(map).sort(([, first], [, second]) => first - second)
    while (sortedEntries.length > MAX_READY_PAIR_ENTRIES) {
      const [oldestKey] = sortedEntries.shift() ?? []
      if (!oldestKey) break
      delete map[oldestKey]
    }
    await chrome.storage[storageNs].set({ [READY_PAIRS_KEY]: map })
  } catch (_e) {
    // ignore
  }
}

async function wasPairReady(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<boolean> {
  const key = getPairKey(sourceLanguage, targetLanguage)
  try {
    const storageNs: 'session' | 'local' = 'session' in chrome.storage ? 'session' : 'local'
    const data = await chrome.storage[storageNs].get(READY_PAIRS_KEY)
    const map = (data?.[READY_PAIRS_KEY] as Record<string, number> | undefined) ?? {}
    return Boolean(map[key])
  } catch (_e) {
    return false
  }
}

async function getOrCreateTranslator(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  onProgress?: (pct: number) => void,
  maxWaitMs = 1000,
): Promise<TranslatorInstance> {
  const adapter = await resolveTranslatorAdapterWithRetry(maxWaitMs)
  if (!adapter) throw new Error('Translator API unavailable')

  if (!window.__nativeTranslatePool) {
    window.__nativeTranslatePool = new Map<string, TranslatorInstance>()
  }
  const pool = window.__nativeTranslatePool
  const pairKey = getPairKey(sourceLanguage, targetLanguage)
  const existing = pool.get(pairKey)
  if (existing) {
    pool.delete(pairKey)
    pool.set(pairKey, existing)
    return existing
  }

  const inFlight = translatorCreationPromises.get(pairKey)
  if (inFlight) return inFlight

  const creation = (async () => {
    let lastPct = 0
    const translator = await adapter.create({
      sourceLanguage,
      targetLanguage,
      monitor(m) {
        if (!onProgress) return
        m.addEventListener('downloadprogress', (e) => {
          const loaded = typeof e.loaded === 'number' ? e.loaded : 0
          const pct = Math.round(loaded * 100)
          if (pct !== lastPct) {
            lastPct = pct
            onProgress(pct)
          }
        })
      },
    })
    if (translator.ready) await translator.ready
    pool.set(pairKey, translator)
    while (pool.size > MAX_TRANSLATOR_POOL_ENTRIES) {
      const oldestKey = pool.keys().next().value
      if (oldestKey === undefined) break
      pool.delete(oldestKey)
    }
    await markPairReady(sourceLanguage, targetLanguage)
    return translator
  })()

  translatorCreationPromises.set(pairKey, creation)
  try {
    return await creation
  } finally {
    if (translatorCreationPromises.get(pairKey) === creation) {
      translatorCreationPromises.delete(pairKey)
    }
  }
}

function primarySubtag(lang: string | undefined): string {
  if (!lang) return ''
  return lang.replace(/_/g, '-').split('-')[0].toLowerCase()
}

function normalizeChineseLanguageVariant(lang: string): string {
  const normalized = lang.replace(/_/g, '-').toLowerCase()
  const subtags = normalized.split('-')
  if (subtags.includes('hans')) return 'zh-cn'
  if (subtags.includes('hant')) return 'zh-tw'
  if (subtags.includes('cn') || subtags.includes('sg')) return 'zh-cn'
  if (subtags.includes('tw') || subtags.includes('hk') || subtags.includes('mo')) {
    return 'zh-tw'
  }
  if (normalized === 'zh') return 'zh-cn'
  return normalized
}

function canonicalChineseLanguageVariant(lang: string): LanguageCode {
  return normalizeChineseLanguageVariant(lang) === 'zh-tw' ? 'zh-TW' : 'zh-CN'
}

function canonicalizeLanguageForTranslator(lang: LanguageCode): LanguageCode {
  return primarySubtag(lang) === 'zh' ? canonicalChineseLanguageVariant(lang) : lang
}

function isGenericChineseLanguage(lang: string): boolean {
  return lang.trim().toLowerCase() === 'zh'
}

function refineGenericChineseWithDocumentLanguage(lang: LanguageCode): LanguageCode {
  const htmlLang = document.documentElement.getAttribute('lang')?.trim()
  if (
    isGenericChineseLanguage(lang) &&
    htmlLang &&
    primarySubtag(htmlLang) === 'zh' &&
    !isGenericChineseLanguage(htmlLang)
  ) {
    return canonicalizeLanguageForTranslator(htmlLang)
  }
  return lang
}

function isSameLanguage(a: string, b: string): boolean {
  if (primarySubtag(a) === 'zh' && primarySubtag(b) === 'zh') {
    return normalizeChineseLanguageVariant(a) === normalizeChineseLanguageVariant(b)
  }
  return primarySubtag(a) === primarySubtag(b)
}

function buildDetectionSample(maxChars = 4000): string {
  const blocks = collectTranslatableBlocks(document.body)
  const placeholderTexts = collectTranslatablePlaceholders(document.body).map((item) => item.text)
  const attributeTexts = collectTranslatableTextAttributes(document.body).map((item) => item.text)
  const textContentTexts = collectTranslatableTextContent(document.body).map((item) => item.text)
  const documentTitleText = shouldTranslateDocumentTitle() ? getDocumentTitleText() : ''
  if (
    blocks.length === 0 &&
    placeholderTexts.length === 0 &&
    attributeTexts.length === 0 &&
    textContentTexts.length === 0 &&
    !documentTitleText
  ) {
    // 回退到全文可见文本（可能较长）
    return (document.body?.innerText || '').trim().slice(0, maxChars)
  }
  let sample = ''
  if (documentTitleText) {
    sample = documentTitleText.slice(0, maxChars)
  }
  for (const item of blocks) {
    if (!item.text) continue
    if (sample.length + item.text.length > maxChars) break
    sample += sample ? `\n${item.text} ` : item.text
    if (sample.length >= maxChars) break
  }
  for (const text of placeholderTexts) {
    if (!text) continue
    if (sample.length + text.length > maxChars) break
    sample += sample ? `\n${text} ` : text
    if (sample.length >= maxChars) break
  }
  for (const text of attributeTexts) {
    if (!text) continue
    if (sample.length + text.length > maxChars) break
    sample += sample ? `\n${text} ` : text
    if (sample.length >= maxChars) break
  }
  for (const text of textContentTexts) {
    if (!text) continue
    if (sample.length + text.length > maxChars) break
    sample += sample ? `\n${text} ` : text
    if (sample.length >= maxChars) break
  }
  return sample.slice(0, maxChars)
}

async function getOrCreateLanguageDetector(
  onProgress?: (pct: number) => void,
): Promise<LanguageDetectorInstance> {
  const api = window.LanguageDetector
  if (!api) throw new Error('Language Detector API unavailable')
  const cached = window.__nativeLanguageDetector
  if (cached) return cached
  let lastPct = -1
  const detector = await api.create({
    monitor(m) {
      if (!onProgress) return
      m.addEventListener('downloadprogress', (e) => {
        const loaded = typeof e.loaded === 'number' ? e.loaded : 0
        const pct = Math.round(loaded * 100)
        if (pct !== lastPct) {
          lastPct = pct
          onProgress(pct)
        }
      })
    },
  })
  window.__nativeLanguageDetector = detector
  try {
    const storageNs: 'session' | 'local' = 'session' in chrome.storage ? 'session' : 'local'
    await chrome.storage[storageNs].set({ [DETECTOR_READY_KEY]: Date.now() })
  } catch (_e) {}
  return detector
}

async function detectSourceLanguageForPage(onProgress?: (pct: number) => void): Promise<{
  lang: LanguageCode
  confidence: number
} | null> {
  const api = window.LanguageDetector
  if (!api) return null
  try {
    const state = await api.availability()
    // 如果尚未下载模型，则创建时会触发下载
    if (state === 'unavailable') return null
  } catch (_e) {}

  const sample = buildDetectionSample()
  if (!sample || sample.split(/\s+/g).length < 4) {
    // 样本过短，退回 documentElement 的 lang 提示
    const htmlLang = document.documentElement.getAttribute('lang') || ''
    if (htmlLang) return { lang: canonicalizeLanguageForTranslator(htmlLang), confidence: 0.5 }
  }

  const detector = await getOrCreateLanguageDetector(onProgress)
  const results = await detector.detect(sample)
  if (!results || results.length === 0) return null
  const best = results[0]
  return {
    lang: refineGenericChineseWithDocumentLanguage(best.detectedLanguage),
    confidence: best.confidence,
  }
}

async function translateFullPage(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  blocks = collectTranslatableBlocks(document.body),
): Promise<void> {
  const placeholders = collectTranslatablePlaceholders(document.body)
  const textAttributes = collectTranslatableTextAttributes(document.body)
  const textContentItems = collectTranslatableTextContent(document.body)
  const shouldTranslateTitle = shouldTranslateDocumentTitle()
  if (
    blocks.length === 0 &&
    placeholders.length === 0 &&
    textAttributes.length === 0 &&
    textContentItems.length === 0 &&
    !shouldTranslateTitle
  ) {
    return
  }

  let translator: TranslatorInstance | null = null
  try {
    translator = await getOrCreateTranslator(sourceLanguage, targetLanguage)
  } catch (_err) {
    translator = null
  }

  await translateBlocksSequentially(translator, blocks, sourceLanguage, targetLanguage, () => {})
  await translatePlaceholdersSequentially(translator, placeholders, sourceLanguage, targetLanguage)
  await translateTextAttributesSequentially(
    translator,
    textAttributes,
    sourceLanguage,
    targetLanguage,
  )
  await translateTextContentSequentially(
    translator,
    textContentItems,
    sourceLanguage,
    targetLanguage,
  )
  await translateDocumentTitle(translator, sourceLanguage, targetLanguage)
}

async function translateFullPageAutoDetect(targetLanguage: LanguageCode): Promise<void> {
  const normalizedTargetLanguage = canonicalizeLanguageForTranslator(targetLanguage)
  stopFullPageTranslationObserver()
  unavailableBridgePairs.clear()

  // 预处理：包裹散乱文本为块，确保能被 collectTranslatableBlocks 识别
  prepareDocumentForTranslation(document.body)
  clearPreviousTranslationsAndMarks()
  prepareDocumentForTranslation(document.body, true)

  const detection = await detectSourceLanguageForPage()

  const htmlLang = document.documentElement.getAttribute('lang') || ''
  const sourceLanguage =
    detection?.lang || (htmlLang ? canonicalizeLanguageForTranslator(htmlLang) : 'en')

  if (isSameLanguage(sourceLanguage, normalizedTargetLanguage)) {
    clearPreviousTranslationsAndMarks()
    return
  }

  const blocks = collectTranslatableBlocks(document.body)
  const placeholders = collectTranslatablePlaceholders(document.body)
  const textAttributes = collectTranslatableTextAttributes(document.body)
  const textContentItems = collectTranslatableTextContent(document.body)
  const shouldTranslateTitle = shouldTranslateDocumentTitle()
  if (
    blocks.length > 0 ||
    placeholders.length > 0 ||
    textAttributes.length > 0 ||
    textContentItems.length > 0 ||
    shouldTranslateTitle
  ) {
    const translatorAdapter = await resolveTranslatorAdapterWithRetry(0)
    if (!translatorAdapter) {
      const state = startFullPageTranslationObserver(sourceLanguage, normalizedTargetLanguage)
      if (state) queueDynamicTranslationRoot(state, document.body)
      return
    }
    await translateFullPage(sourceLanguage, normalizedTargetLanguage, blocks)
  }
  startFullPageTranslationObserver(sourceLanguage, normalizedTargetLanguage)
}

// 消息通道：接收 Popup 指令
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (!message || typeof message.type !== 'string') return false
  if (message.type === MSG_TRANSLATE_PAGE) {
    const { targetLanguage } = (message.payload ?? {}) as {
      targetLanguage: LanguageCode
    }
    void translateFullPageAutoDetect(targetLanguage)
    return false
  }
  if (message.type === MSG_UPDATE_HOTKEY) {
    const { hotkeyModifier } = (message.payload ?? {}) as {
      hotkeyModifier?: 'alt' | 'control' | 'shift'
    }
    if (hotkeyModifier === 'alt' || hotkeyModifier === 'control' || hotkeyModifier === 'shift') {
      preferredModifier = hotkeyModifier
      if (typeof tryTranslateRef === 'function') tryTranslateRef()
    }
    return false
  }
  if (message.type === MSG_WARM_TRANSLATOR) {
    void (async () => {
      try {
        const settings = await ensurePopupSettings()
        const payload = (message.payload ?? {}) as {
          sourceLanguage?: LanguageCode | 'auto'
          targetLanguage?: LanguageCode
        }
        const target = canonicalizeLanguageForTranslator(
          (payload.targetLanguage ?? settings.targetLanguage) as LanguageCode,
        )
        if (!target) return
        let source = payload.sourceLanguage
        if (!source || source === 'auto') {
          const detection = await detectSourceLanguageForPage()
          source = (detection?.lang ?? inferDocumentLanguage()) as LanguageCode
        }
        source = canonicalizeLanguageForTranslator(source as LanguageCode)
        await scheduleWarmTranslatorPair(source as LanguageCode, target)
      } catch (error) {
        console.warn('warm translator request failed', error)
      }
    })()
    return false
  }
  return false
})

// 轻量心跳：用于 SidePanel/Popup 注入后探测内容脚本是否就绪
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false
  if (message.type === '__PING__') {
    try {
      const respond = sendResponse as unknown as (response: unknown) => void
      respond({ ok: true })
    } catch {}
    return true
  }
  return false
})

// 侧边栏请求：翻译任意文本 / 语言检测
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false
  if (message.type === MSG_TRANSLATE_TEXT) {
    const { text, sourceLanguage, targetLanguage } = (message.payload ?? {}) as {
      text: string
      sourceLanguage: LanguageCode | 'auto'
      targetLanguage: LanguageCode
    }
    const normalizedTargetLanguage = canonicalizeLanguageForTranslator(targetLanguage)
    ;(async () => {
      try {
        const respond = sendResponse as unknown as (response: unknown) => void
        let source: LanguageCode | null = null
        if (sourceLanguage === 'auto') {
          source = await detectLanguageForText(text)
          if (source) {
            source = refineGenericChineseWithDocumentLanguage(source)
          }
          if (!source) source = 'en'
        } else {
          source = sourceLanguage
        }
        source = canonicalizeLanguageForTranslator(source)
        unavailableBridgePairs.delete(getPairKey(source, normalizedTargetLanguage))
        if (isSameLanguage(source, normalizedTargetLanguage)) {
          respond({ ok: true, result: text, detectedSource: source })
          return
        }
        let translator: TranslatorInstance | null
        try {
          translator = await getOrCreateTranslator(source, normalizedTargetLanguage)
        } catch (_e) {
          translator = null
        }
        // 保留原始段落与换行：按行翻译后再拼接
        const out = await translateTextPreservingNewlines(
          translator,
          text,
          source,
          normalizedTargetLanguage,
        )
        respond({ ok: true, result: out, detectedSource: source })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown_error'
        const respond = sendResponse as unknown as (response: unknown) => void
        respond({ ok: false, error: msg })
      }
    })()
    return true // 异步响应
  }
  if (message.type === 'NATIVE_TRANSLATE_DETECT_LANGUAGE') {
    const { text } = (message.payload ?? {}) as { text: string }
    ;(async () => {
      try {
        const lang = await detectLanguageForText(text)
        const respond = sendResponse as unknown as (response: unknown) => void
        respond({ ok: true, lang })
      } catch (_e) {
        const respond = sendResponse as unknown as (response: unknown) => void
        respond({ ok: false, error: 'detect_failed' })
      }
    })()
    return true
  }
  return false
})

// ========== 悬停 + Alt 翻译当前段落 ==========

function getDeepActiveElement(): Element | null {
  let activeElement: Element | null = document.activeElement
  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement
  }
  return activeElement
}

function isEditingContext(): boolean {
  const ae = getDeepActiveElement()
  if (!(ae instanceof HTMLElement)) return false
  if (isEditableSurface(ae)) return true
  const tag = ae.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea'
}

function isAllowedBlockTag(tagLower: string): boolean {
  return isBlockTag(tagLower)
}

function pickTranslatableBlockFromTarget(start: Element | null): Element | null {
  let node: Element | null = start
  while (node && node !== document.documentElement) {
    const tagLower = node.tagName?.toLowerCase?.() || ''
    if (isAllowedBlockTag(tagLower)) {
      if (shouldTranslateElement(node) && isElementVisible(node)) {
        const text = getElementText(node)
        if (text.length >= getMinimumTextLengthForElement(node)) {
          // 只要是有效块级元素，直接返回，不再依赖 hasBlockDescendants 过滤
          return node
        }
      }
    }
    node = node.parentElement
  }
  return null
}

function getComposedEventTargetElement(event: Event): Element | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  const composedTarget = path.find((target): target is Element => target instanceof Element)
  if (composedTarget) return composedTarget
  return event.target instanceof Element ? event.target : null
}

async function detectLanguageForText(text: string): Promise<LanguageCode | null> {
  const cached = getCachedLanguageDetection(text)
  if (cached !== undefined) return cached
  const cacheKey = getLanguageDetectionCacheKey(text)
  const pending = pendingLanguageDetectionPromises.get(cacheKey)
  if (pending) return pending

  const detectionPromise = (async () => {
    let detectedLanguage: LanguageCode | null = null
    let detectionCompleted = false
    try {
      const detector = await getOrCreateLanguageDetector()
      const results = await detector.detect(getLanguageDetectionSample(text))
      detectionCompleted = true
      if (results?.[0]?.detectedLanguage) {
        detectedLanguage = results[0].detectedLanguage
      }
    } catch (_e) {}
    if (detectionCompleted) {
      setCachedLanguageDetection(text, detectedLanguage)
    }
    return detectedLanguage
  })()

  pendingLanguageDetectionPromises.set(cacheKey, detectionPromise)
  try {
    return await detectionPromise
  } finally {
    if (pendingLanguageDetectionPromises.get(cacheKey) === detectionPromise) {
      pendingLanguageDetectionPromises.delete(cacheKey)
    }
  }
}

async function inferSourceLanguageForText(text: string): Promise<LanguageCode> {
  let sourceLanguage = await detectLanguageForText(text)
  if (sourceLanguage) {
    sourceLanguage = refineGenericChineseWithDocumentLanguage(sourceLanguage)
  }
  if (sourceLanguage) return sourceLanguage

  const htmlLang = document.documentElement.getAttribute('lang') || ''
  return htmlLang ? canonicalizeLanguageForTranslator(htmlLang) : 'en'
}

async function resolveTranslationContextForText(
  text: string,
  targetLanguage: LanguageCode,
  fallbackContext?: TranslationContext,
): Promise<TranslationContext | null> {
  const sourceLanguage = await inferSourceLanguageForText(text)
  if (isSameLanguage(sourceLanguage, targetLanguage)) return null
  if (fallbackContext && isSameLanguage(sourceLanguage, fallbackContext.sourceLanguage)) {
    return fallbackContext
  }

  try {
    return {
      sourceLanguage,
      translator: await getOrCreateTranslator(sourceLanguage, targetLanguage),
    }
  } catch (_e) {
    return { sourceLanguage, translator: null }
  }
}

const processingElements = new WeakSet<Element>()
const onDemandTranslationObservers = new WeakMap<Element, MutationObserver>()

function observeOnDemandTranslationSource(element: Element): void {
  if (typeof MutationObserver === 'undefined') return
  onDemandTranslationObservers.get(element)?.disconnect()

  const observer = new MutationObserver((mutations) => {
    const changedSource = mutations.some((mutation) => {
      const targetElement =
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
      if (targetElement && isNativeTranslateGeneratedElement(targetElement)) return false
      if (mutation.type === 'childList') {
        const changedNodes = [
          ...Array.from(mutation.addedNodes),
          ...Array.from(mutation.removedNodes),
        ]
        if (
          changedNodes.length > 0 &&
          changedNodes.every((node) => isNativeTranslateGeneratedRemoval(node))
        ) {
          return false
        }
      }
      return true
    })
    if (!changedSource) return

    observer.disconnect()
    onDemandTranslationObservers.delete(element)
    clearDynamicRootTranslationState(element)
  })

  observer.observe(element, {
    attributeFilter: DYNAMIC_TRANSLATION_ATTRIBUTE_FILTER,
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  })
  onDemandTranslationObservers.set(element, observer)
}

async function translateElementOnDemand(element: Element): Promise<void> {
  if (!element) return
  if ((element as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1') return
  if (element.querySelector(`.${TRANSLATED_CLASS}`)) return
  if (processingElements.has(element)) return

  const { text, nodeMap } = getMarkedWithNodes(element)
  if (!text || text.length < getMinimumTextLengthForElement(element)) return

  processingElements.add(element)

  let skeleton: HTMLElement | null = null
  let skeletonRemoved = false
  const skeletonTimeout = setTimeout(() => {
    if (skeletonRemoved) return
    skeleton = createSkeletonPlaceholder(element)
    insertTranslationAdjacent(element, skeleton)
  }, SKELETON_DELAY_MS)

  const cleanupSkeleton = () => {
    skeletonRemoved = true
    clearTimeout(skeletonTimeout)
    if (skeleton) {
      skeleton.remove()
      skeleton = null
    }
  }

  try {
    const targetLanguage = await getPreferredTargetLanguage()
    let sourceLanguage = await inferSourceLanguageForText(text)
    let currentText = text
    let currentNodeMap = nodeMap

    const latestBeforeTranslator = getLatestTranslatableBlockItem(element)
    if (!latestBeforeTranslator) {
      cleanupSkeleton()
      return
    }
    if (latestBeforeTranslator.text !== text) {
      currentText = latestBeforeTranslator.text
      currentNodeMap = latestBeforeTranslator.nodeMap ?? new Map()
      sourceLanguage = await inferSourceLanguageForText(currentText)
    }

    if (isSameLanguage(sourceLanguage, targetLanguage)) {
      cleanupSkeleton()
      return
    }

    let translator: TranslatorInstance | null
    let lastPct = -1
    try {
      translator = await getOrCreateTranslator(sourceLanguage, targetLanguage, (pct) => {
        if (pct !== lastPct) {
          lastPct = pct
          // 如果骨架屏还没显示，下载进度触发时可以考虑立即显示它，或者保持延迟
          // 这里我们保持延迟，但更新状态
          const statusText = skeleton?.querySelector('.native-translate-skeleton__status-text')
          if (statusText) {
            statusText.textContent = tCS('overlay_downloading', [String(pct)])
          }
        }
      })
    } catch (_e) {
      translator = null
    }

    if (currentText.length >= STREAMING_LENGTH_THRESHOLD) {
      cleanupSkeleton()
      await translateIntoElementPreservingNewlines(
        element,
        translator,
        currentText,
        sourceLanguage,
        targetLanguage,
        currentNodeMap,
        async (latestText) => {
          return resolveTranslationContextForText(latestText, targetLanguage, {
            sourceLanguage,
            translator,
          })
        },
      )
      if (
        (element as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1' ||
        element.querySelector(`.${TRANSLATED_CLASS}`)
      ) {
        observeOnDemandTranslationSource(element)
      }
    } else {
      const cacheKey = buildCacheKey(currentText, sourceLanguage, targetLanguage)
      let translated = getCachedTranslation(cacheKey)
      if (!translated) {
        try {
          translated = await translateTextPreservingNewlines(
            translator,
            currentText,
            sourceLanguage,
            targetLanguage,
          )
          setCachedTranslation(cacheKey, translated)
        } catch (_e) {
          translated = ''
        }
      }

      cleanupSkeleton()
      clearDynamicRootTranslationState(element)
      const latestItem = getLatestTranslatableBlockItem(element)
      if (!latestItem) return
      let translatedNodeMap = currentNodeMap
      if (latestItem.text !== currentText) {
        const latestContext = await resolveTranslationContextForText(
          latestItem.text,
          targetLanguage,
          {
            sourceLanguage,
            translator,
          },
        )
        if (!latestContext) return
        const latestCacheKey = buildCacheKey(
          latestItem.text,
          latestContext.sourceLanguage,
          targetLanguage,
        )
        translated = getCachedTranslation(latestCacheKey)
        if (!translated) {
          try {
            translated = await translateTextPreservingNewlines(
              latestContext.translator,
              latestItem.text,
              latestContext.sourceLanguage,
              targetLanguage,
            )
            setCachedTranslation(latestCacheKey, translated)
          } catch (_e) {
            translated = ''
          }
        }
        translatedNodeMap = latestItem.nodeMap ?? new Map()
      }
      if (translated) {
        let content: string | DocumentFragment = translated
        if (translatedNodeMap.size > 0) {
          content = renderMarkedText(translated, translatedNodeMap)
        }
        clearDynamicRootTranslationState(element)
        const clone = createTranslationSpan(element, content, targetLanguage)
        insertTranslationAdjacent(element, clone)
        ;(element as HTMLElement).setAttribute(TRANSLATED_ATTR, '1')
        observeOnDemandTranslationSource(element)
      }
    }
  } catch (err) {
    cleanupSkeleton()
    console.error('Translation failed', err)
  } finally {
    processingElements.delete(element)
  }
}

function initializeHoverAltTranslate(): void {
  if (window.__nativeTranslateHoverAltInit) return
  window.__nativeTranslateHoverAltInit = true
  const hoverGeneration = (window.__nativeTranslateHoverAltGeneration ?? 0) + 1
  window.__nativeTranslateHoverAltGeneration = hoverGeneration
  const isCurrentHoverGeneration = () =>
    window.__nativeTranslateHoverAltGeneration === hoverGeneration

  let hoveredCandidate: Element | null = null
  let altPressed = false
  let ctrlPressed = false
  let shiftPressed = false
  let lastTriggered: Element | null = null

  void (async () => {
    preferredModifier = await getHoverHotkeyModifier()
  })()

  addPopupSettingsObserver(() => {
    if (!isCurrentHoverGeneration()) return
    lastTriggered = null
    tryTranslate()
  })

  const tryTranslate = () => {
    if (!isCurrentHoverGeneration()) return
    const shouldTrigger =
      (preferredModifier === 'alt' && altPressed) ||
      (preferredModifier === 'control' && ctrlPressed) ||
      (preferredModifier === 'shift' && shiftPressed)
    if (!shouldTrigger) return
    if (isEditingContext()) return
    if (!hoveredCandidate) return
    if (
      hoveredCandidate === lastTriggered &&
      (processingElements.has(hoveredCandidate) ||
        (hoveredCandidate as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1' ||
        Boolean(hoveredCandidate.querySelector(`.${TRANSLATED_CLASS}`)))
    ) {
      return
    }
    lastTriggered = hoveredCandidate
    void translateElementOnDemand(hoveredCandidate)
  }
  tryTranslateRef = tryTranslate

  document.addEventListener(
    'mousemove',
    (e) => {
      if (!isCurrentHoverGeneration()) return
      const target = getComposedEventTargetElement(e)
      if (target?.parentElement) {
        // 对附近的容器进行段落化预处理
        const container = target.closest('.prose, article, .blog-content, main')
        if (container) segmentAndWrapLooseContent(container)
      }

      hoveredCandidate = pickTranslatableBlockFromTarget(target)
      if (
        (preferredModifier === 'alt' && altPressed) ||
        (preferredModifier === 'control' && ctrlPressed) ||
        (preferredModifier === 'shift' && shiftPressed)
      ) {
        tryTranslate()
      }
    },
    { capture: true, passive: true },
  )

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isCurrentHoverGeneration()) return
      altPressed = e.altKey || e.key === 'Alt' || altPressed
      ctrlPressed = e.ctrlKey || e.key === 'Control' || ctrlPressed
      shiftPressed = e.shiftKey || e.key === 'Shift' || shiftPressed
      tryTranslate()
    },
    { capture: true },
  )

  document.addEventListener(
    'keyup',
    (e) => {
      if (!isCurrentHoverGeneration()) return
      if (e.key === 'Alt' || !e.altKey) altPressed = false
      if (e.key === 'Control' || !e.ctrlKey) ctrlPressed = false
      if (e.key === 'Shift' || !e.shiftKey) shiftPressed = false
      lastTriggered = null
    },
    { capture: true },
  )
}

initializeHoverAltTranslate()

export const __testables = {
  buildCacheKey,
  collectTranslatableBlocks,
  getOrCreateTranslator,
  getCachedTranslation,
  getTranslationCacheSize,
  inferDocumentLanguage,
  MAX_TRANSLATION_CACHE_ENTRIES,
  normalizeDynamicTranslationRoots,
  setCachedTranslation,
  showInlineHintNearElement,
  stopFullPageTranslationObserver,
  translateFullPageAutoDetect,
  translateFreeTextToPreferred,
  translateIntoElementPreservingNewlines,
  translateTextPreservingNewlines,
}

// ========== 在可编辑文本中“三连空格”触发翻译 ==========

function isTextLikeInputElement(
  element: Element | null,
): element is HTMLInputElement | HTMLTextAreaElement {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase()
    // 仅对文本相关类型启用，避免破坏非文本输入
    const allowed = ['text', 'search', 'url', 'email', 'tel']
    return allowed.includes(type)
  }
  return false
}

function endsWithDoubleSpace(text: string): boolean {
  if (!text) return false
  // 兼容不可断行空格 U+00A0
  const normalized = text.replace(/\u00A0/g, ' ')
  return normalized.endsWith('  ')
}

function stripTrailingTriggerSpaces(text: string): string {
  return text.replace(/[ \u00A0]{2}$/, '')
}

function getActiveContentEditableHost(): HTMLElement | null {
  const ae = document.activeElement as HTMLElement | null
  if (!ae) return null
  if (ae.isContentEditable) return ae
  let current: Element | null = ae
  while (current) {
    if (hasEditableContentAttribute(current)) return current as HTMLElement
    current = getComposedParentElement(current)
  }
  return null
}

async function translateFreeTextToPreferred(text: string): Promise<{
  translated: string
  source: LanguageCode
  target: LanguageCode
} | null> {
  const clean = text
  const targetLanguage = await getPreferredInputTargetLanguage()
  let sourceLanguage = await detectLanguageForText(clean)
  if (sourceLanguage) {
    sourceLanguage = refineGenericChineseWithDocumentLanguage(sourceLanguage)
  }
  if (!sourceLanguage) {
    const htmlLang = document.documentElement.getAttribute('lang') || ''
    sourceLanguage = htmlLang ? canonicalizeLanguageForTranslator(htmlLang) : 'en'
  }
  if (isSameLanguage(sourceLanguage, targetLanguage)) {
    return null
  }
  unavailableBridgePairs.delete(getPairKey(sourceLanguage, targetLanguage))
  let translator: TranslatorInstance | null = null
  try {
    translator = await getOrCreateTranslator(sourceLanguage, targetLanguage)
  } catch (_e) {
    translator = null // 回退到桥翻译
  }
  const translated = await translateTextPreservingNewlines(
    translator,
    clean,
    sourceLanguage,
    targetLanguage,
  )
  return { translated, source: sourceLanguage, target: targetLanguage }
}

const translatingFields = new WeakSet<Element>()
let isComposingIme = false

function dispatchInputEvent(target: HTMLElement): void {
  try {
    target.dispatchEvent(new Event('input', { bubbles: true }))
  } catch (_e) {
    // ignore
  }
}

async function handleTripleSpaceForInput(
  el: HTMLInputElement | HTMLTextAreaElement,
): Promise<void> {
  if (translatingFields.has(el)) return
  translatingFields.add(el)
  try {
    let hintActive = false
    let hintRemove: () => void = () => {}
    let hintUpdate: (text: string) => void = () => {}
    const hintTimer = window.setTimeout(() => {
      const h = showInlineHintNearElement(el, tCS('overlay_preparing'))
      hintActive = true
      hintRemove = h.remove
      hintUpdate = h.update
    }, 400)
    const text = el.value
    const res = await translateFreeTextToPreferred(text)
    window.clearTimeout(hintTimer)
    if (!res) {
      if (hintActive) hintRemove()
      return
    }
    el.value = res.translated
    // 将光标移至末尾
    try {
      const end = el.value.length
      el.selectionStart = end
      el.selectionEnd = end
    } catch (_e) {}
    dispatchInputEvent(el)
    if (hintActive) {
      hintUpdate(tCS('overlay_translation_complete'))
      window.setTimeout(() => hintRemove(), 1000)
    }
  } finally {
    translatingFields.delete(el)
  }
}

async function handleTripleSpaceForContentEditable(host: HTMLElement): Promise<void> {
  if (translatingFields.has(host)) return
  translatingFields.add(host)
  try {
    let hintActive = false
    let hintRemove: () => void = () => {}
    let hintUpdate: (text: string) => void = () => {}
    const hintTimer = window.setTimeout(() => {
      const h = showInlineHintNearElement(host, tCS('overlay_preparing'))
      hintActive = true
      hintRemove = h.remove
      hintUpdate = h.update
    }, 400)
    const text = stripTrailingTriggerSpaces(host.innerText || host.textContent || '')
    const res = await translateFreeTextToPreferred(text)
    window.clearTimeout(hintTimer)
    if (!res) {
      if (hintActive) hintRemove()
      return
    }
    host.textContent = res.translated
    // 光标定位到末尾
    try {
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        range.selectNodeContents(host)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    } catch (_e) {}
    dispatchInputEvent(host)
    if (hintActive) {
      hintUpdate(tCS('overlay_translation_complete'))
      window.setTimeout(() => hintRemove(), 1000)
    }
  } finally {
    translatingFields.delete(host)
  }
}

function initializeTripleSpaceEditingTranslate(): void {
  if (window.__nativeTripleSpaceInit) return
  window.__nativeTripleSpaceInit = true

  // 跟踪 IME 组合，避免在中文/日文输入法组合期间误触发
  document.addEventListener(
    'compositionstart',
    () => {
      isComposingIme = true
    },
    { capture: true },
  )
  document.addEventListener(
    'compositionend',
    () => {
      isComposingIme = false
    },
    { capture: true },
  )

  document.addEventListener(
    'keydown',
    (e) => {
      if (isComposingIme) return
      // 仅在按下空格键时检测
      const isSpace = e.key === ' ' || e.code === 'Space' || e.key === 'Spacebar'
      if (!isSpace) return

      const ae = document.activeElement as HTMLElement | null
      if (!ae) return

      if (isTextLikeInputElement(ae)) {
        const el = ae
        // 仅在光标处于折叠状态且左侧正好有两个空格时触发
        const start = el.selectionStart
        const end = el.selectionEnd
        if (start === null || end === null || start !== end) return
        const pos = start || 0
        const left = el.value.slice(0, pos)
        if (!endsWithDoubleSpace(left)) return
        // 阻止第三个空格插入，并移除前两个空格
        e.preventDefault()
        e.stopPropagation()
        el.value = el.value.slice(0, pos - 2) + el.value.slice(pos)
        try {
          el.selectionStart = pos - 2
          el.selectionEnd = pos - 2
        } catch (_e2) {}
        dispatchInputEvent(el)
        void handleTripleSpaceForInput(el)
        return
      }

      const host = getActiveContentEditableHost()
      if (host) {
        // 对 contenteditable，若光标折叠且前文末尾为两个空格，则触发
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return
        const range = sel.getRangeAt(0)
        if (!range.collapsed) return
        try {
          const pre = range.cloneRange()
          pre.setStart(host, 0)
          const beforeText = pre.toString()
          if (!endsWithDoubleSpace(beforeText)) return
          e.preventDefault()
          e.stopPropagation()
          // 替换整体内容，无需额外删除两个空格（会被整体替换）
          void handleTripleSpaceForContentEditable(host)
        } catch (_err) {
          // 忽略异常，不触发
        }
      }
    },
    { capture: true },
  )
}

initializeTripleSpaceEditingTranslate()
