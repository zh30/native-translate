import { showExtractCard } from '@/content/extractCard'
import { translateInPage } from '@/content/inPageTranslate'
import { positionOverlay, selectionRect } from '@/content/overlayKit/anchor'
import { button, el, glassCard, pillToolbar, streamingNode } from '@/content/overlayKit/components'
import { trapOverlayFocus } from '@/content/overlayKit/focus'
import { getOverlayHost } from '@/content/overlayKit/host'
import type { AiCapabilitiesSnapshot } from '@/shared/ai/capabilities'
import { getAiCapabilities } from '@/shared/ai/capabilities'
import { streamAiTask } from '@/shared/ai/client'
import {
  resolveOverlayRect,
  selectionAfterChange,
  selectionModifierPressed,
} from '@/shared/ai/productInvariants'
import type { ExplainResult } from '@/shared/ai/types'
import { DEFAULT_TARGET_LANGUAGE, type LanguageCode } from '@/shared/languages'
import { MSG_OPEN_SETTINGS } from '@/shared/messages'
import {
  AI_CAPABILITIES_KEY,
  AI_SETTINGS_KEY,
  type AiSettings,
  DEFAULT_AI_SETTINGS,
  POPUP_SETTINGS_KEY,
  VOCAB_BOOK_KEY,
} from '@/shared/settings'
import { upsertVocabEntry, type VocabEntry } from '@/shared/vocab'
import { t } from '@/utils/i18n'

const enabled = true
let settings: AiSettings = DEFAULT_AI_SETTINGS
let targetLanguage: LanguageCode = DEFAULT_TARGET_LANGUAGE
let capabilities: AiCapabilitiesSnapshot | null = null
let currentCleanup: (() => void) | null = null
let cardPinned = false
let toolbarText: string | null = null
let cardOpen = false
let hotkeyModifier: 'alt' | 'control' | 'shift' = 'alt'
let lastSelectionBox: { x: number; y: number; width: number; height: number } | null = null
const resultCache = new Map<string, unknown>()
const MAX_CACHE = 200

function cacheGet(key: string): unknown {
  return resultCache.get(key)
}
function cacheSet(key: string, value: unknown): void {
  resultCache.set(key, value)
  if (resultCache.size > MAX_CACHE) {
    const first = resultCache.keys().next().value
    if (first) resultCache.delete(first)
  }
}

function isEditableSelection(): boolean {
  const node = window.getSelection()?.anchorNode
  const el = node instanceof Element ? node : node?.parentElement
  if (!el) return false
  if (el.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return true
  return false
}

function selectedText(): string {
  return window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? ''
}

function contextText(): string {
  const node = window.getSelection()?.anchorNode
  const block = (node instanceof Element ? node : node?.parentElement)?.closest(
    'p, li, blockquote, td, h1, h2, h3, article, section',
  )
  return (block?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500)
}

async function translateSelection(text: string): Promise<string> {
  return translateInPage({
    text,
    sourceLanguage: 'auto',
    targetLanguage,
  })
}

export const SELECTION_OVERFLOW_ACTIONS = ['copy', 'vocab', 'settings'] as const

export function buildSelectionOverflowActions(): readonly (typeof SELECTION_OVERFLOW_ACTIONS)[number][] {
  return SELECTION_OVERFLOW_ACTIONS
}

function rememberSelectionBox(): void {
  const live = selectionRect()
  if (live) {
    lastSelectionBox = { x: live.x, y: live.y, width: live.width, height: live.height }
  }
}

function placeOverlay(node: HTMLElement): void {
  const live = selectionRect()
  const box = resolveOverlayRect({
    live: live ? { x: live.x, y: live.y, width: live.width, height: live.height } : null,
    remembered: lastSelectionBox,
  })
  void positionOverlay(node, { kind: 'rect', ...box })
}

function remember(key: string, value: unknown): unknown {
  const cached = cacheGet(key)
  if (cached) return cached
  cacheSet(key, value)
  return value
}

function closeCurrent(): void {
  currentCleanup?.()
  currentCleanup = null
  cardPinned = false
  toolbarText = null
  cardOpen = false
}

function renderCard(title: string, quote: string, body: HTMLElement, extra?: HTMLElement): void {
  closeCurrent()
  cardOpen = true
  toolbarText = quote
  const { root } = getOverlayHost()
  const card = glassCard()
  const header = el('div')
  header.style.display = 'flex'
  header.style.justifyContent = 'space-between'
  header.style.alignItems = 'center'
  const heading = el('strong')
  heading.textContent = title
  const actions = el('div')
  const pin = button('📌', 'nt-btn', () => {
    cardPinned = !cardPinned
    pin.setAttribute('aria-pressed', cardPinned ? 'true' : 'false')
    pin.title = t('ai_selection_pin')
  })
  pin.setAttribute('aria-label', t('ai_selection_pin'))
  pin.setAttribute('aria-pressed', 'false')
  const close = button('✕', 'nt-btn', closeCurrent)
  close.setAttribute('aria-label', t('ai_close'))
  actions.append(pin, close)
  header.append(heading, actions)
  const quoteEl = el('div', 'nt-quote nt-muted')
  quoteEl.textContent = `“${quote}”`
  card.append(header, quoteEl, body)
  if (extra) card.append(extra)
  root.appendChild(card)
  placeOverlay(card)
  const untrap = trapOverlayFocus(
    card,
    () => {
      if (!cardPinned) closeCurrent()
    },
    { allowOutsideClick: () => cardPinned },
  )
  currentCleanup = () => {
    untrap()
    card.remove()
  }
}

function showError(title: string, quote: string, error: unknown): void {
  const body = el('div', 'nt-stream')
  body.textContent = error instanceof Error ? error.message : t('ai_error_internal')
  renderCard(title, quote, body)
}

async function runExplain(text: string): Promise<void> {
  const key = `explain:${text}:${targetLanguage}`
  const cached = cacheGet(key) as ExplainResult | undefined
  const stream = streamingNode()
  renderCard(t('ai_selection_explain'), text, stream.root)
  if (cached) {
    stream.set(`${cached.translation}\n${cached.explanation}`, true)
    return
  }
  try {
    let acc = ''
    const result = (await streamAiTask(
      { kind: 'explain', text, contextText: contextText(), targetLanguage },
      (frame) => {
        if (frame.type === 'chunk') {
          acc += frame.delta
          stream.set(acc)
        }
      },
    )) as ExplainResult
    cacheSet(key, result)
    stream.set(`${result.translation}\n${result.explanation}`, true)
  } catch (error) {
    showError(t('ai_selection_explain'), text, error)
  }
}

async function runSummary(text: string): Promise<void> {
  const stream = streamingNode()
  renderCard(t('ai_selection_summary'), text, stream.root)
  try {
    let acc = ''
    const result = (await streamAiTask(
      { kind: 'summarize', text, format: 'key-points', length: 'short', targetLanguage },
      (frame) => {
        if (frame.type === 'chunk') {
          acc += frame.delta
          stream.set(acc)
        }
      },
    )) as { text?: string }
    stream.set(result?.text ?? acc, true)
  } catch (error) {
    showError(t('ai_selection_summary'), text, error)
  }
}

async function addToVocab(text: string): Promise<void> {
  const stored = await chrome.storage.local.get(VOCAB_BOOK_KEY)
  const current = (stored[VOCAB_BOOK_KEY] as VocabEntry[] | undefined) ?? []
  const next = upsertVocabEntry(current, {
    word: text.split(/\s+/).slice(0, 6).join(' '),
    lemma: text,
    meaning: text,
    sentence: contextText(),
    sourceUrl: location.href,
    sourceHost: location.host,
  })
  await chrome.storage.local.set({ [VOCAB_BOOK_KEY]: next.entries })
}

function showToolbar(text: string, force = false): void {
  rememberSelectionBox()
  if (!force) {
    const after = selectionAfterChange({
      cardPinned,
      selectionLen: text.length,
      minChars: settings.selection.minChars ?? 2,
      toolbarVisible: toolbarText !== null && !cardOpen,
      sameSelection: toolbarText === text,
    })
    if (after === 'keep-card' || after === 'keep-toolbar') return
  }
  closeCurrent()
  toolbarText = text
  const nanoReady = capabilities?.gate === 'ready'
  const { root } = getOverlayHost()
  const bar = pillToolbar()
  const translateBtn = button(t('ai_selection_translate'), 'nt-btn', () => {
    void (async () => {
      try {
        const translated = await translateSelection(text)
        const body = el('div', 'nt-stream')
        body.textContent = translated
        renderCard(t('ai_selection_translate'), text, body)
      } catch (error) {
        showError(t('ai_selection_translate'), text, error)
      }
    })()
  })
  bar.appendChild(translateBtn)
  if (nanoReady && settings.features.selection) {
    bar.appendChild(
      button(t('ai_selection_explain'), 'nt-btn nt-btn-ai', () => void runExplain(text)),
    )
    if (text.length >= 200) {
      bar.appendChild(button(t('ai_selection_summary'), 'nt-btn', () => void runSummary(text)))
    }
    if (settings.features.extract) {
      bar.appendChild(
        button(t('ai_selection_extract'), 'nt-btn', () => {
          void showExtractCard(text, targetLanguage)
        }),
      )
    }
  }
  const more = button('⋮', 'nt-btn')
  more.setAttribute('aria-label', t('ai_selection_settings'))
  more.setAttribute('aria-haspopup', 'menu')
  const menu = el('div')
  menu.setAttribute('role', 'menu')
  menu.style.display = 'none'
  menu.style.flexDirection = 'column'
  for (const action of buildSelectionOverflowActions()) {
    const item = button(
      action === 'copy'
        ? t('ai_selection_copy')
        : action === 'vocab'
          ? t('ai_selection_vocab')
          : t('ai_selection_settings'),
      'nt-btn',
      () => {
        if (action === 'copy') void navigator.clipboard.writeText(text)
        if (action === 'vocab') void addToVocab(text)
        if (action === 'settings') void chrome.runtime.sendMessage({ type: MSG_OPEN_SETTINGS })
        menu.style.display = 'none'
      },
    )
    item.setAttribute('role', 'menuitem')
    menu.appendChild(item)
  }
  more.addEventListener('click', (event) => {
    event.stopPropagation()
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none'
  })
  bar.append(more, menu)
  root.appendChild(bar)
  placeOverlay(bar)
  const untrap = trapOverlayFocus(bar, closeCurrent)
  currentCleanup = () => {
    untrap()
    bar.remove()
  }
}

async function hydrate(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get([AI_SETTINGS_KEY, POPUP_SETTINGS_KEY])
    settings = { ...DEFAULT_AI_SETTINGS, ...(stored[AI_SETTINGS_KEY] as AiSettings | undefined) }
    const popup = stored[POPUP_SETTINGS_KEY] as
      | {
          targetLanguage?: LanguageCode
          hotkeyModifier?: 'alt' | 'control' | 'shift'
        }
      | undefined
    targetLanguage = popup?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE
    if (popup?.hotkeyModifier) hotkeyModifier = popup.hotkeyModifier
    capabilities = await getAiCapabilities()
    if (toolbarText && !cardOpen) showToolbar(toolbarText, true)
  } catch {
    // ignore
  }
}

export function initSelectionAssistant(): void {
  if (!enabled) return
  void hydrate()
  document.addEventListener('selectionchange', () => {
    window.setTimeout(() => {
      if (document.hidden) return
      const text = selectedText()
      const min = settings.selection.minChars ?? 2
      const after = selectionAfterChange({
        cardPinned: cardPinned || cardOpen,
        selectionLen: text.length,
        minChars: min,
        isEditable: isEditableSelection(),
        toolbarVisible: toolbarText !== null && !cardOpen,
        sameSelection: toolbarText === text,
      })
      if (after === 'keep-card' || after === 'keep-toolbar') return
      if (after === 'close') {
        closeCurrent()
        return
      }
      if (settings.selection.trigger === 'modifier') return
      showToolbar(text)
    }, 40)
  })
  document.addEventListener('mouseup', (event) => {
    if (settings.selection.trigger !== 'modifier') return
    const ev = event as MouseEvent
    if (!selectionModifierPressed(ev, hotkeyModifier)) return
    const text = selectedText()
    if (text.length >= (settings.selection.minChars ?? 2) && !isEditableSelection())
      showToolbar(text)
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes[AI_SETTINGS_KEY]?.newValue) {
      settings = { ...DEFAULT_AI_SETTINGS, ...(changes[AI_SETTINGS_KEY].newValue as AiSettings) }
    }
    if (changes[POPUP_SETTINGS_KEY]?.newValue) {
      const popup = changes[POPUP_SETTINGS_KEY].newValue as {
        targetLanguage?: LanguageCode
        hotkeyModifier?: 'alt' | 'control' | 'shift'
      }
      targetLanguage = popup.targetLanguage ?? targetLanguage
      if (popup.hotkeyModifier) hotkeyModifier = popup.hotkeyModifier
    }
    if (changes[AI_CAPABILITIES_KEY]?.newValue) {
      capabilities = changes[AI_CAPABILITIES_KEY].newValue as AiCapabilitiesSnapshot
      if (toolbarText && !cardOpen) showToolbar(toolbarText, true)
    }
  })
}

export function extractSelectedTextForMenu(): string {
  return selectedText()
}

export { remember }
