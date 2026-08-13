import { showWordCard } from '@/content/wordCard'
import { runAiTask } from '@/shared/ai/client'
import { hasCustomElementsRegistry, nextLearningProcessed } from '@/shared/ai/productInvariants'
import type { PickWordsResult } from '@/shared/ai/types'
import { DEFAULT_TARGET_LANGUAGE, type LanguageCode } from '@/shared/languages'
import {
  AI_SETTINGS_KEY,
  type AiSettings,
  DEFAULT_AI_SETTINGS,
  POPUP_SETTINGS_KEY,
} from '@/shared/settings'

const WORD_TAG = 'nt-word'
export const LEARNING_MARK_STYLE_ID = 'native-translate-learning-marks'
export const LEARNING_MARK_STYLES = `${WORD_TAG}, .nt-word {
  border-bottom: 1px dashed color-mix(in oklab, oklch(0.606 0.25 292.7) 70%, transparent);
  background: color-mix(in oklab, oklch(0.606 0.25 292.7) 14%, transparent);
  cursor: pointer;
  display: inline;
}`
let enabled = false
let observer: IntersectionObserver | null = null
let settings: AiSettings = DEFAULT_AI_SETTINGS
let targetLanguage: LanguageCode = DEFAULT_TARGET_LANGUAGE
let processed = nextLearningProcessed('restore')
const marks: HTMLElement[] = []

function defineWordElement(): boolean {
  const registry =
    typeof customElements === 'undefined' ? null : (customElements as CustomElementRegistry | null)
  if (!hasCustomElementsRegistry(registry) || !registry) return false
  if (registry.get(WORD_TAG)) return true
  class NtWord extends HTMLElement {}
  registry.define(WORD_TAG, NtWord)
  return true
}

export function ensureLearningMarkStyles(root: ParentNode = document): HTMLStyleElement {
  const existing = root instanceof Document ? root.getElementById(LEARNING_MARK_STYLE_ID) : null
  if (existing instanceof HTMLStyleElement) return existing
  const style = (root instanceof Document ? root : document).createElement('style')
  style.id = LEARNING_MARK_STYLE_ID
  style.textContent = LEARNING_MARK_STYLES
  const host = root instanceof Document ? root.documentElement : (root as Element)
  host.appendChild(style)
  return style
}

export function decorateLearningMark(mark: HTMLElement): HTMLElement {
  mark.className = 'nt-word'
  mark.style.borderBottom = '1px dashed rgba(139, 92, 246, 0.7)'
  mark.style.background = 'rgba(139, 92, 246, 0.14)'
  mark.style.cursor = 'pointer'
  mark.style.display = 'inline'
  return mark
}

function wrapWord(node: Text, word: string, meta: { lemma: string; meaning: string }): void {
  const text = node.nodeValue ?? ''
  const index = text.toLowerCase().indexOf(word.toLowerCase())
  if (index < 0) return
  const range = document.createRange()
  range.setStart(node, index)
  range.setEnd(node, index + word.length)
  const mark = document.createElement(WORD_TAG)
  decorateLearningMark(mark)
  mark.setAttribute('data-lemma', meta.lemma)
  mark.setAttribute('data-meaning', meta.meaning)
  mark.setAttribute('data-word', word)
  try {
    range.surroundContents(mark)
    marks.push(mark)
    mark.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      showWordCard({
        word,
        lemma: meta.lemma,
        meaning: meta.meaning,
        sentence: mark.closest('p, li, blockquote, td, h1, h2, h3')?.textContent ?? '',
        targetLanguage,
        anchor: mark,
      })
    })
  } catch {
    // crossing elements — skip
  }
}

function walkTextNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      const tag = parent.tagName.toLowerCase()
      if (['script', 'style', 'noscript', 'pre', 'code', 'textarea', WORD_TAG].includes(tag)) {
        return NodeFilter.FILTER_REJECT
      }
      if (!node.nodeValue || node.nodeValue.trim().length < 2) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    nodes.push(current as Text)
    current = walker.nextNode()
  }
  return nodes
}

async function processBlock(element: Element): Promise<void> {
  if (!enabled || processed.has(element)) return
  processed.add(element)
  const text = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200)
  if (text.length < 40) return
  try {
    const result = (await Promise.race([
      runAiTask({
        kind: 'pickWords',
        text,
        level: settings.learning.level,
        targetLanguage,
      }),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 8000)),
    ])) as PickWordsResult
    const nodes = walkTextNodes(element)
    for (const item of result.words ?? []) {
      for (const node of nodes) {
        if ((node.nodeValue || '').toLowerCase().includes(item.word.toLowerCase())) {
          wrapWord(node, item.word, item)
          break
        }
      }
    }
  } catch {
    // skip failed/timeout blocks
  }
}

export function restoreLearningMarks(): void {
  processed = nextLearningProcessed('restore')
  document.getElementById(LEARNING_MARK_STYLE_ID)?.remove()
  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    mark.remove()
  }
  marks.length = 0
}

export async function setLearningMode(next: boolean): Promise<void> {
  enabled = next
  if (!enabled) {
    observer?.disconnect()
    observer = null
    processed = nextLearningProcessed('disable')
    restoreLearningMarks()
    return
  }
  defineWordElement()
  try {
    ensureLearningMarkStyles()
  } catch {
    enabled = false
    return
  }
  const stored = await chrome.storage.local.get([AI_SETTINGS_KEY, POPUP_SETTINGS_KEY])
  settings = { ...DEFAULT_AI_SETTINGS, ...(stored[AI_SETTINGS_KEY] as AiSettings | undefined) }
  targetLanguage =
    (stored[POPUP_SETTINGS_KEY] as { targetLanguage?: LanguageCode } | undefined)?.targetLanguage ??
    DEFAULT_TARGET_LANGUAGE
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) void processBlock(entry.target)
      }
    },
    { rootMargin: '200px 0px' },
  )
  const blocks = document.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, article')
  for (const block of Array.from(blocks)) observer.observe(block)
}

export function initLearningMode(): void {
  defineWordElement()
}

export function isLearningModeEnabled(): boolean {
  return enabled
}
