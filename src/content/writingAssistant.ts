import {
  getContentEditableHost,
  isTextLikeInput,
  writeToContentEditable,
  writeToTextControl,
} from '@/content/editableWriter'
import { translateInPage } from '@/content/inPageTranslate'
import { positionOverlay } from '@/content/overlayKit/anchor'
import { button, el, glassCard, streamingNode } from '@/content/overlayKit/components'
import { trapOverlayFocus } from '@/content/overlayKit/focus'
import { getOverlayHost } from '@/content/overlayKit/host'
import { getAiCapabilities } from '@/shared/ai/capabilities'
import { runAiTask, streamAiTask } from '@/shared/ai/client'
import { writingSurface } from '@/shared/ai/productInvariants'
import type { ProofreadResult, WritingTone } from '@/shared/ai/types'
import { DEFAULT_INPUT_TARGET_LANGUAGE, type LanguageCode } from '@/shared/languages'
import {
  AI_CAPABILITIES_KEY,
  AI_SETTINGS_KEY,
  type AiSettings,
  DEFAULT_AI_SETTINGS,
  POPUP_SETTINGS_KEY,
} from '@/shared/settings'
import { t } from '@/utils/i18n'

let settings: AiSettings = DEFAULT_AI_SETTINGS
let targetLanguage: LanguageCode = DEFAULT_INPUT_TARGET_LANGUAGE
let appearTimer: number | null = null
let fab: HTMLButtonElement | null = null
let panelCleanup: (() => void) | null = null
let surface: ReturnType<typeof writingSurface> = 'full'
let lastGate = 'unknown'

function currentEditable(): HTMLElement | HTMLInputElement | HTMLTextAreaElement | null {
  if (isTextLikeInput(document.activeElement)) return document.activeElement
  return getContentEditableHost()
}

function readValue(target: HTMLElement): string {
  if (isTextLikeInput(target)) return target.value
  return target.innerText || target.textContent || ''
}

function writeValue(target: HTMLElement, value: string): void {
  if (isTextLikeInput(target)) writeToTextControl(target, value)
  else writeToContentEditable(target, value)
}

function hideFab(): void {
  fab?.remove()
  fab = null
}

function showFab(target: HTMLElement): void {
  hideFab()
  const { root } = getOverlayHost()
  const btn = button('✎', 'nt-btn nt-btn-ai')
  btn.style.position = 'fixed'
  btn.style.opacity = '0.85'
  btn.setAttribute('aria-label', t('ai_writing_title'))
  const rect = target.getBoundingClientRect()
  btn.style.left = `${Math.round(rect.right - 28)}px`
  btn.style.top = `${Math.round(rect.bottom - 28)}px`
  btn.addEventListener('mousedown', (event) => event.preventDefault())
  btn.addEventListener('click', () => openPanel(target))
  root.appendChild(btn)
  fab = btn
}

function openPanel(target: HTMLElement): void {
  panelCleanup?.()
  const { root } = getOverlayHost()
  const card = glassCard()
  card.style.maxWidth = 'min(520px, 92vw)'
  const header = el('strong')
  header.textContent = t('ai_writing_title')
  const actions = el('div')
  const original = el('div', 'nt-muted')
  original.textContent = readValue(target)
  const stream = streamingNode()
  let tone: WritingTone = settings.writing.defaultTone
  let lastResult = ''

  const applyResult = (text: string) => {
    lastResult = text
    stream.set(text, true)
  }

  const runPolish = async (mode: 'polish' | 'translate-polish') => {
    try {
      let draft = readValue(target)
      if (mode === 'translate-polish') {
        draft = await translateInPage({
          text: draft,
          sourceLanguage: 'auto',
          targetLanguage,
        })
      }
      let acc = ''
      const result = (await streamAiTask(
        { kind: 'polish', text: draft, tone, targetLanguage },
        (frame) => {
          if (frame.type === 'chunk') {
            acc += frame.delta
            stream.set(acc)
          }
        },
      )) as { text?: string }
      applyResult(result?.text ?? acc)
    } catch (error) {
      applyResult(error instanceof Error ? error.message : t('ai_error_internal'))
    }
  }

  const runProof = async () => {
    try {
      const result = (await runAiTask({
        kind: 'proofread',
        text: readValue(target),
      })) as ProofreadResult
      applyResult(result.corrected)
    } catch (error) {
      applyResult(error instanceof Error ? error.message : t('ai_error_internal'))
    }
  }

  const runTranslateOnly = async () => {
    try {
      const translated = await translateInPage({
        text: readValue(target),
        sourceLanguage: 'auto',
        targetLanguage,
      })
      applyResult(translated)
    } catch (error) {
      applyResult(error instanceof Error ? error.message : t('ai_error_internal'))
    }
  }

  if (surface === 'translate-only') {
    actions.append(
      button(t('ai_selection_translate'), 'nt-btn nt-btn-ai', () => void runTranslateOnly()),
    )
  } else {
    actions.append(
      button(
        t('ai_writing_translate_polish'),
        'nt-btn nt-btn-ai',
        () => void runPolish('translate-polish'),
      ),
      button(t('ai_writing_polish'), 'nt-btn', () => void runPolish('polish')),
      button(t('ai_writing_tone_professional'), 'nt-btn', () => {
        tone = 'professional'
      }),
      button(t('ai_writing_tone_friendly'), 'nt-btn', () => {
        tone = 'friendly'
      }),
      button(t('ai_writing_tone_concise'), 'nt-btn', () => {
        tone = 'concise'
      }),
      button(t('ai_writing_proofread'), 'nt-btn', () => void runProof()),
    )
  }
  const footer = el('div')
  footer.append(
    button(t('ai_writing_retry'), 'nt-btn', () => {
      if (surface === 'translate-only') void runTranslateOnly()
      else void runPolish('polish')
    }),
    button(t('ai_writing_copy'), 'nt-btn', () => void navigator.clipboard.writeText(lastResult)),
    button(t('ai_writing_replace'), 'nt-btn nt-btn-ai', () => {
      if (lastResult) writeValue(target, lastResult)
    }),
  )
  card.append(header, actions, original, stream.root, footer)
  root.appendChild(card)
  void positionOverlay(card, { kind: 'element', element: target })
  const untrap = trapOverlayFocus(card, () => {
    untrap()
    card.remove()
    panelCleanup = null
  })
  panelCleanup = () => {
    untrap()
    card.remove()
    panelCleanup = null
  }
}

export function initWritingAssistant(): void {
  void (async () => {
    const stored = await chrome.storage.local.get([AI_SETTINGS_KEY, POPUP_SETTINGS_KEY])
    settings = { ...DEFAULT_AI_SETTINGS, ...(stored[AI_SETTINGS_KEY] as AiSettings | undefined) }
    targetLanguage =
      (stored[POPUP_SETTINGS_KEY] as { inputTargetLanguage?: LanguageCode } | undefined)
        ?.inputTargetLanguage ?? DEFAULT_INPUT_TARGET_LANGUAGE
    const caps = await getAiCapabilities()
    lastGate = caps.gate
    surface = writingSurface(caps.gate, settings.features.writing)
  })()
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes[AI_SETTINGS_KEY]?.newValue) {
      settings = { ...DEFAULT_AI_SETTINGS, ...(changes[AI_SETTINGS_KEY].newValue as AiSettings) }
    }
    if (changes[POPUP_SETTINGS_KEY]?.newValue) {
      targetLanguage =
        (changes[POPUP_SETTINGS_KEY].newValue as { inputTargetLanguage?: LanguageCode })
          .inputTargetLanguage ?? targetLanguage
    }
    if (changes[AI_CAPABILITIES_KEY]?.newValue) {
      lastGate = (changes[AI_CAPABILITIES_KEY].newValue as { gate?: string }).gate ?? lastGate
    }
    surface = writingSurface(lastGate, settings.features.writing)
  })

  const scheduleFab = (delay = 400) => {
    if (appearTimer) window.clearTimeout(appearTimer)
    appearTimer = window.setTimeout(() => {
      if (surface === 'hidden') {
        hideFab()
        return
      }
      const target = currentEditable()
      if (!target) {
        hideFab()
        return
      }
      if (readValue(target).trim().length < 10) {
        hideFab()
        return
      }
      showFab(target)
    }, delay)
  }

  document.addEventListener('focusin', () => scheduleFab(500))
  document.addEventListener('input', () => scheduleFab(280))
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key === '.') {
      if (surface === 'hidden') return
      const target = currentEditable()
      if (target) {
        event.preventDefault()
        openPanel(target)
      }
    }
  })
}
