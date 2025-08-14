export { };
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

interface TranslatorDownloadProgressEvent extends Event {
  loaded?: number; // 0..1
}

interface TranslatorMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (e: TranslatorDownloadProgressEvent) => void
  ) => void;
}

interface TranslatorInstance {
  translate: (text: string) => Promise<string>;
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
  ) => Promise<'unknown' | 'available' | 'downloadable' | 'unavailable'>;
  create: (opts: TranslatorCreateOptions) => Promise<TranslatorInstance>;
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
  create: (opts?: { monitor?: (m: LanguageDetectorMonitor) => void }) => Promise<LanguageDetectorInstance>;
}

// 避免与其他文件的全局 Window 扩展冲突，这里不增强 Window 类型，使用 any 访问

// 运行时常量
const TRANSLATED_ATTR = 'data-native-translate-done';
const TRANSLATED_CLASS = 'native-translate-translation';
const OVERLAY_ID = 'native-translate-overlay';
const READY_PAIRS_KEY = 'nativeTranslate:readyPairs';
const DETECTOR_READY_KEY = 'nativeTranslate:detectorReady';
const POPUP_SETTINGS_KEY = 'nativeTranslate.settings';
let preferredModifier: 'alt' | 'control' | 'shift' = 'alt';
let tryTranslateRef: (() => void) | null = null;

// 简单的内存缓存，避免相同文本重复翻译
const translationCache = new Map<string, string>();

function buildCacheKey(text: string, sourceLanguage: string, targetLanguage: string): string {
  return `${sourceLanguage}|${targetLanguage}|${text}`;
}

interface PopupSettings {
  targetLanguage: LanguageCode;
  hotkeyModifier?: 'alt' | 'control' | 'shift';
}

async function getPreferredTargetLanguage(): Promise<LanguageCode> {
  try {
    const data = await chrome.storage.local.get(POPUP_SETTINGS_KEY);
    const settings = (data?.[POPUP_SETTINGS_KEY] as PopupSettings | undefined);
    if (settings?.targetLanguage) return settings.targetLanguage;
  } catch (_e) { }
  return 'zh-CN';
}

async function getHoverHotkeyModifier(): Promise<'alt' | 'control' | 'shift'> {
  try {
    const data = await chrome.storage.local.get(POPUP_SETTINGS_KEY);
    const settings = (data?.[POPUP_SETTINGS_KEY] as PopupSettings | undefined);
    const value = settings?.hotkeyModifier || 'alt';
    if (value === 'alt' || value === 'control' || value === 'shift') return value;
  } catch (_e) { }
  return 'alt';
}

function createOverlay(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.position = 'fixed';
  overlay.style.top = '12px';
  overlay.style.zIndex = '2147483647';
  overlay.style.background = 'rgba(0,0,0,0.8)';
  overlay.style.color = 'white';
  overlay.style.padding = '8px 12px';
  overlay.style.borderRadius = '8px';
  overlay.style.fontSize = '12px';
  overlay.style.lineHeight = '1.4';
  overlay.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
  overlay.textContent = tCS('overlay_preparing');
  // 默认根据文档方向决定对齐位置
  const dir = document.documentElement.getAttribute('dir') || 'ltr';
  if (dir === 'rtl') {
    overlay.style.left = '12px';
    overlay.style.textAlign = 'left';
  } else {
    overlay.style.right = '12px';
    overlay.style.textAlign = 'right';
  }
  document.documentElement.appendChild(overlay);
  return overlay;
}

function updateOverlay(overlay: HTMLElement, text: string): void {
  overlay.textContent = text;
}

function removeOverlay(): void {
  const el = document.getElementById(OVERLAY_ID);
  if (el && el.parentNode) el.parentNode.removeChild(el);
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
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
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
  // 避免导航/页眉/页脚/侧边栏等区域
  if (element.closest('nav,header,footer,aside')) return false;
  // 避免表格相关结构，防止破坏表格布局
  if (element.closest('table,thead,tbody,tfoot,tr')) return false;
  if (element.closest(`.${TRANSLATED_CLASS}`)) return false;
  if ((element as HTMLElement).getAttribute(TRANSLATED_ATTR) === '1') return false;
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
    'div'
  ].join(',');

  const elements = Array.from(root.querySelectorAll(selector));
  const results: Array<{ element: Element; text: string }> = [];
  for (const el of elements) {
    if (!shouldTranslateElement(el)) continue;
    if (!isElementVisible(el)) continue;
    const text = getElementText(el);
    if (text.length < 20) continue; // 过滤过短文本
    // 对容器类元素，若内部还有明显的块级子元素，则跳过，避免破坏布局
    const tagLower = el.tagName.toLowerCase();
    if ((tagLower === 'div' || tagLower === 'section' || tagLower === 'article') && hasBlockDescendants(el)) {
      continue;
    }
    // 对 div 再多一道词数阈值，减少噪声
    if (tagLower === 'div' && text.split(/\s+/g).length < 8) continue;
    results.push({ element: el, text });
  }
  return results;
}

function createTranslationSpan(original: Element, translatedText: string, targetLanguage: LanguageCode): Element {
  const span = document.createElement('span');
  span.classList.add(TRANSLATED_CLASS);
  span.setAttribute(TRANSLATED_ATTR, '1');
  span.setAttribute('lang', targetLanguage);
  // 使用块级表现，确保作为同级兄弟显示在原文下方
  if (span instanceof HTMLElement) {
    span.style.display = 'block';
    span.style.marginTop = '4px';
    span.style.whiteSpace = 'pre-wrap';
    // 根据目标语言方向设置对齐
    const rtl = /^(ar|he|fa|ur|ps)(-|$)/i.test(targetLanguage);
    span.dir = rtl ? 'rtl' : 'ltr';
    span.style.textAlign = rtl ? 'right' : 'left';
  }
  span.textContent = translatedText;
  return span;
}

async function translateTextPreservingNewlines(
  translator: TranslatorInstance,
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
        translatedLine = await translator.translate(line);
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
  translator: TranslatorInstance,
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
    const inserts: Array<{ node: Element; element: Node; }> = [];

    // 顺序翻译，遵循 API 的串行特性
    for (const { element, text } of batch) {
      const cacheKey = buildCacheKey(text, sourceLanguage, targetLanguage);
      let translated = translationCache.get(cacheKey);
      if (!translated) {
        // 翻译可能抛错，保持健壮性
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

    // 统一插入，尽量降低重排次数
    for (const ins of inserts) {
      (ins.element as Element).appendChild(ins.node);
    }

    // 让出事件循环，避免长任务阻塞
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function getPairKey(sourceLanguage: LanguageCode, targetLanguage: LanguageCode): string {
  return `${sourceLanguage}->${targetLanguage}`;
}

async function markPairReady(sourceLanguage: LanguageCode, targetLanguage: LanguageCode): Promise<void> {
  const key = getPairKey(sourceLanguage, targetLanguage);
  try {
    const storageNs: 'session' | 'local' = (chrome.storage as any).session ? 'session' : 'local';
    const data = await chrome.storage[storageNs].get(READY_PAIRS_KEY);
    const map = (data?.[READY_PAIRS_KEY] as Record<string, number> | undefined) ?? {};
    map[key] = Date.now();
    await chrome.storage[storageNs].set({ [READY_PAIRS_KEY]: map });
  } catch (_e) {
    // ignore
  }
}

async function wasPairReady(sourceLanguage: LanguageCode, targetLanguage: LanguageCode): Promise<boolean> {
  const key = getPairKey(sourceLanguage, targetLanguage);
  try {
    const storageNs: 'session' | 'local' = (chrome.storage as any).session ? 'session' : 'local';
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
  const api = (window as any).Translator as TranslatorStatic | undefined;
  if (!api) throw new Error('Translator API unavailable');

  const pool = ((window as any).__nativeTranslatePool ||= new Map<string, TranslatorInstance>());
  const pairKey = getPairKey(sourceLanguage, targetLanguage);
  const existing = pool.get(pairKey);
  if (existing) return existing;

  let lastPct = 0;
  const translator = await api.create({
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
    sample += (sample ? '\n' : '') + item.text;
    if (sample.length >= maxChars) break;
  }
  return sample.slice(0, maxChars);
}

async function getOrCreateLanguageDetector(onProgress?: (pct: number) => void): Promise<LanguageDetectorInstance> {
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
    const storageNs: 'session' | 'local' = (chrome.storage as any).session ? 'session' : 'local';
    await chrome.storage[storageNs].set({ [DETECTOR_READY_KEY]: Date.now() });
  } catch (_e) { }
  return detector;
}

async function detectSourceLanguageForPage(onProgress?: (pct: number) => void): Promise<{ lang: LanguageCode; confidence: number } | null> {
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

  const api = window.Translator;
  if (!api) {
    updateOverlay(overlay, tCS('overlay_api_unavailable'));
    setTimeout(removeOverlay, 3000);
    return;
  }

  const knownReady = await wasPairReady(sourceLanguage, targetLanguage);
  updateOverlay(overlay, knownReady ? tCS('overlay_using_cached') : tCS('overlay_preparing'));
  let lastPct = -1;
  const translator = await getOrCreateTranslator(sourceLanguage, targetLanguage, (pct) => {
    if (pct !== lastPct) {
      updateOverlay(overlay, tCS('overlay_downloading', [String(pct)]));
      lastPct = pct;
    }
  });

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
        updateOverlay(overlay, tCS('overlay_translating', [String(pct), String(done), String(total)]));
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
  if (message.type === 'NATIVE_TRANSLATE_TRANSLATE_PAGE') {
    const { targetLanguage } = (message.payload ?? {}) as {
      targetLanguage: LanguageCode;
    };
    void translateFullPageAutoDetect(targetLanguage);
    return false;
  }
  if (message.type === 'NATIVE_TRANSLATE_UPDATE_HOTKEY') {
    const { hotkeyModifier } = (message.payload ?? {}) as {
      hotkeyModifier?: 'alt' | 'control' | 'shift';
    };
    if (hotkeyModifier === 'alt' || hotkeyModifier === 'control' || hotkeyModifier === 'shift') {
      preferredModifier = hotkeyModifier;
      if (typeof tryTranslateRef === 'function') tryTranslateRef();
    }
    return false;
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
        if (text.length >= 20) {
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
  if (!text || text.length < 20) return;
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

    let translator: TranslatorInstance;
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
      if (overlay) {
        updateOverlay(overlay, tCS('overlay_api_unavailable'));
        setTimeout(removeOverlay, 3000);
      }
      return;
    }
    if (overlay) {
      // 仅在下载期间提示；下载完成后立即移除
      removeOverlay();
      overlay = null;
    }
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
      (element as Element).appendChild(clone);
      (element as HTMLElement).setAttribute(TRANSLATED_ATTR, '1');
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

  // 动态响应 Popup 设置变更
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      const entry = changes?.[POPUP_SETTINGS_KEY];
      if (!entry) return;
      const next = (entry.newValue as PopupSettings | undefined)?.hotkeyModifier;
      if (next === 'alt' || next === 'control' || next === 'shift') {
        preferredModifier = next;
        lastTriggered = null;
        if (tryTranslateRef) tryTranslateRef();
      }
    });
  } catch (_e) { }

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