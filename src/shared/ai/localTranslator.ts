import type { TranslateFn } from '@/shared/ai/types'
import type { LanguageCode } from '@/shared/languages'

interface TranslatorInstance {
  ready?: Promise<void>
  translate: (text: string) => Promise<string>
}

interface TranslatorStatic {
  create?: (opts: { sourceLanguage: string; targetLanguage: string }) => Promise<TranslatorInstance>
  createTranslator?: (opts: {
    sourceLanguage: string
    targetLanguage: string
  }) => Promise<TranslatorInstance>
}

const cache = new Map<string, TranslatorInstance>()

async function createTranslator(
  sourceLanguage: string,
  targetLanguage: string,
): Promise<TranslatorInstance | null> {
  const key = `${sourceLanguage}->${targetLanguage}`
  const existing = cache.get(key)
  if (existing) return existing
  const w = globalThis as typeof globalThis & {
    Translator?: TranslatorStatic
    translation?: TranslatorStatic
  }
  const api = w.Translator ?? w.translation
  if (!api) return null
  const instance = api.create
    ? await api.create({ sourceLanguage, targetLanguage })
    : api.createTranslator
      ? await api.createTranslator({ sourceLanguage, targetLanguage })
      : null
  if (!instance) return null
  if (instance.ready) {
    try {
      await instance.ready
    } catch {
      // translate() will surface the real error
    }
  }
  cache.set(key, instance)
  return instance
}

export const translateWithLocalTranslator: TranslateFn = async (
  text,
  sourceLanguage,
  targetLanguage,
) => {
  if (!text.trim()) return text
  if (sourceLanguage === targetLanguage) return text
  const translator = await createTranslator(sourceLanguage, targetLanguage as LanguageCode)
  if (!translator) return text
  return translator.translate(text)
}
