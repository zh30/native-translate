import type { NanoLanguage, TranslateFn } from '@/shared/ai/types'
import type { LanguageCode } from '@/shared/languages'
import { canonicalizeLanguageForTranslation, primaryLanguageTag } from '@/shared/languages'

export const NANO_OUTPUT_LANGUAGES: readonly NanoLanguage[] = ['en', 'ja', 'es', 'de', 'fr']

export interface LanguageChainDecision {
  nanoLanguage: NanoLanguage
  outputLanguage: LanguageCode
  needsTranslation: boolean
  translatorSource: 'en'
  translatorTarget: LanguageCode | null
}

function isNanoLanguage(code: string): code is NanoLanguage {
  return (NANO_OUTPUT_LANGUAGES as readonly string[]).includes(code)
}

export function resolveLanguageChain(targetLanguage: LanguageCode | string): LanguageChainDecision {
  const canonical = canonicalizeLanguageForTranslation(targetLanguage)
  const primary = primaryLanguageTag(canonical)
  if (isNanoLanguage(primary)) {
    return {
      nanoLanguage: primary,
      outputLanguage: canonical as LanguageCode,
      needsTranslation: false,
      translatorSource: 'en',
      translatorTarget: null,
    }
  }
  return {
    nanoLanguage: 'en',
    outputLanguage: canonical as LanguageCode,
    needsTranslation: true,
    translatorSource: 'en',
    translatorTarget: canonical as LanguageCode,
  }
}

export function nanoLanguageLabel(code: NanoLanguage): string {
  switch (code) {
    case 'en':
      return 'English'
    case 'ja':
      return 'Japanese'
    case 'es':
      return 'Spanish'
    case 'de':
      return 'German'
    case 'fr':
      return 'French'
  }
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/g
const LATIN_RE = /[A-Za-z]/g

export function chatOutputNeedsTranslation(raw: string, targetLanguage: string): boolean {
  const chain = resolveLanguageChain(targetLanguage)
  if (!chain.needsTranslation) return false
  const target = primaryLanguageTag(chain.outputLanguage)
  const cjk = raw.match(CJK_RE)?.length ?? 0
  const latin = raw.match(LATIN_RE)?.length ?? 0
  if ((target === 'zh' || target === 'ja' || target === 'ko') && cjk >= 8 && cjk >= latin) {
    return false
  }
  return true
}

export function looksLikeCorruptAssistantText(text: string): boolean {
  return /\[object Object\]/.test(text) || /\uFFFD/.test(text)
}

export function resolveChatDisplayText(input: {
  streamed: string
  finalized?: string
  targetLanguage: LanguageCode | string
}): string {
  const streamed = input.streamed
  const finalized = input.finalized ?? ''
  if (!finalized.trim()) return streamed
  if (!streamed.trim()) return finalized
  if (looksLikeCorruptAssistantText(finalized)) return streamed
  if (!chatOutputNeedsTranslation(streamed, input.targetLanguage)) return streamed
  return finalized
}

export async function applyLanguageChain(
  text: string,
  targetLanguage: LanguageCode | string,
  translate?: TranslateFn,
): Promise<string> {
  const decision = resolveLanguageChain(targetLanguage)
  if (!decision.needsTranslation || !decision.translatorTarget) return text
  if (!translate) return text
  if (!text.trim()) return text
  return translate(text, decision.translatorSource, decision.translatorTarget)
}

export async function applyLanguageChainFields<T extends Record<string, unknown>>(
  payload: T,
  fields: Array<keyof T>,
  targetLanguage: LanguageCode | string,
  translate?: TranslateFn,
): Promise<T> {
  const decision = resolveLanguageChain(targetLanguage)
  if (!decision.needsTranslation || !translate || !decision.translatorTarget) return payload
  const next = { ...payload }
  for (const field of fields) {
    const value = next[field]
    if (typeof value === 'string' && value.trim()) {
      next[field] = (await translate(
        value,
        decision.translatorSource,
        decision.translatorTarget,
      )) as T[keyof T]
    }
  }
  return next
}
