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


// 基础类型声明（与 Popup 对齐的最小声明）
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
  | 'ru';

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

// 避免与其他文件的全局 Window 扩展冲突，这里不增强 Window 类型，使用 any 访问

// 运行时常量
const TRANSLATED_ATTR = 'data-native-translate-done';
const TRANSLATED_CLASS = 'native-translate-translation';
const OVERLAY_ID = 'native-translate-overlay';
const READY_PAIRS_KEY = 'nativeTranslate:readyPairs';

// 简单的内存缓存，避免相同文本重复翻译
const translationCache = new Map<string, string>();

function buildCacheKey(text: string, sourceLanguage: string, targetLanguage: string): string {
  return `${sourceLanguage}|${targetLanguage}|${text}`;
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
    // 根据目标语言方向设置对齐
    const rtl = /^(ar|he|fa|ur|ps)(-|$)/i.test(targetLanguage);
    span.dir = rtl ? 'rtl' : 'ltr';
    span.style.textAlign = rtl ? 'right' : 'left';
  }
  span.textContent = translatedText;
  return span;
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
    const fragment = document.createDocumentFragment();

    // 顺序翻译，遵循 API 的串行特性
    for (const { element, text } of batch) {
      const cacheKey = buildCacheKey(text, sourceLanguage, targetLanguage);
      let translated = translationCache.get(cacheKey);
      if (!translated) {
        // 翻译可能抛错，保持健壮性
        try {
          translated = await translator.translate(text);
          translationCache.set(cacheKey, translated);
        } catch (_e) {
          translated = '';
        }
      }

      if (translated) {
        const clone = createTranslationSpan(element, translated, targetLanguage);
        // 决定插入策略：
        // - 对 li/dt/dd：插入到元素内部末尾（避免在 ul/ol/dl 下出现非法兄弟）
        // - 其他：作为同级兄弟插入在元素后面
        const tagUpper = element.tagName.toUpperCase();
        if (tagUpper === 'LI' || tagUpper === 'DT' || tagUpper === 'DD') {
          (clone as any).__appendTo__ = element;
        } else {
          (clone as any).__insertAfter__ = element;
        }
        fragment.appendChild(clone);
        // 标记原始元素已处理，避免重复翻译
        (element as HTMLElement).setAttribute(TRANSLATED_ATTR, '1');
      }

      done += 1;
      onProgress(done, total);
    }

    // 统一插入，尽量降低重排次数
    for (const node of Array.from(fragment.childNodes)) {
      const appendTo = (node as any).__appendTo__ as Element | undefined;
      const after = (node as any).__insertAfter__ as Element | undefined;
      if (appendTo && appendTo.parentNode) {
        appendTo.appendChild(node as Element);
        continue;
      }
      if (after && after.parentNode) {
        after.insertAdjacentElement('afterend', node as Element);
      }
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

// 消息通道：接收 Popup 指令并启动全文翻译
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === 'NATIVE_TRANSLATE_TRANSLATE_PAGE') {
    const { sourceLanguage, targetLanguage } = (message.payload ?? {}) as {
      sourceLanguage: LanguageCode;
      targetLanguage: LanguageCode;
    };
    void translateFullPage(sourceLanguage, targetLanguage);
    return false;
  }
  return false;
});