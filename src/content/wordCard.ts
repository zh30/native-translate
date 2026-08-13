import { positionOverlay } from '@/content/overlayKit/anchor'
import { button, el, glassCard } from '@/content/overlayKit/components'
import { trapOverlayFocus } from '@/content/overlayKit/focus'
import { getOverlayHost } from '@/content/overlayKit/host'
import { runAiTask } from '@/shared/ai/client'
import type { LanguageCode } from '@/shared/languages'
import { VOCAB_BOOK_KEY } from '@/shared/settings'
import { upsertVocabEntry, type VocabEntry } from '@/shared/vocab'
import { t } from '@/utils/i18n'

const defineCache = new Map<string, string>()

export function showWordCard(input: {
  word: string
  lemma: string
  meaning: string
  sentence: string
  phonetic?: string
  targetLanguage: LanguageCode
  anchor: Element
}): void {
  const { root } = getOverlayHost()
  const card = glassCard()
  const title = el('strong')
  title.textContent = input.lemma || input.word
  const meaning = el('div', 'nt-stream')
  meaning.textContent = input.meaning
  const sentence = el('div', 'nt-muted')
  sentence.textContent = input.sentence
  card.append(title, meaning, sentence)
  if (input.phonetic) {
    const phonetic = el('div', 'nt-muted')
    phonetic.textContent = input.phonetic
    card.appendChild(phonetic)
  }
  const actions = el('div')
  actions.append(
    button(t('ai_learning_add'), 'nt-btn nt-btn-ai', () => {
      void (async () => {
        const stored = await chrome.storage.local.get(VOCAB_BOOK_KEY)
        const current = (stored[VOCAB_BOOK_KEY] as VocabEntry[] | undefined) ?? []
        const next = upsertVocabEntry(current, {
          word: input.word,
          lemma: input.lemma,
          meaning: input.meaning,
          sentence: input.sentence,
          phonetic: input.phonetic,
          sourceUrl: location.href,
          sourceHost: location.host,
        })
        await chrome.storage.local.set({ [VOCAB_BOOK_KEY]: next.entries })
      })()
    }),
    button(t('ai_learning_speak'), 'nt-btn', () => {
      const utter = new SpeechSynthesisUtterance(input.word)
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
    }),
  )
  card.appendChild(actions)
  root.appendChild(card)
  void positionOverlay(card, { kind: 'element', element: input.anchor })
  const untrap = trapOverlayFocus(card, () => {
    untrap()
    card.remove()
  })

  const cacheKey = `${input.word}:${input.sentence}:${input.targetLanguage}`
  const cached = defineCache.get(cacheKey)
  if (cached) {
    meaning.textContent = cached
    return
  }
  void (async () => {
    try {
      const defined = (await runAiTask({
        kind: 'defineWord',
        word: input.word,
        sentence: input.sentence,
        targetLanguage: input.targetLanguage,
      })) as { text?: string }
      if (defined.text) {
        defineCache.set(cacheKey, defined.text)
        meaning.textContent = defined.text
      }
    } catch (error) {
      meaning.textContent = error instanceof Error ? error.message : t('ai_error_internal')
    }
  })()
}
