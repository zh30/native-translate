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
