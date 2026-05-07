export type LanguageCode =
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
  | 'ru'
  | 'ar'
  | 'hi'
  | 'bn'
  | 'id'
  | 'tr'
  | 'vi'
  | 'th'
  | 'nl'
  | 'pl'
  | 'fa'
  | 'ur'
  | 'uk'
  | 'sv'
  | 'fil'

export const SUPPORTED_LANGUAGES: ReadonlyArray<{ code: LanguageCode; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'fa', label: 'فارسی' },
  { code: 'ur', label: 'اردو' },
  { code: 'uk', label: 'Українська' },
  { code: 'sv', label: 'Svenska' },
  { code: 'fil', label: 'Filipino' },
]

export const DEFAULT_TARGET_LANGUAGE: LanguageCode = 'zh-CN'
export const DEFAULT_INPUT_TARGET_LANGUAGE: LanguageCode = 'en'

function primarySubtag(lang: string | undefined): string {
  if (!lang) return ''
  return lang.replace(/_/g, '-').split('-')[0].toLowerCase()
}

function normalizeChineseVariant(lang: string): 'zh-CN' | 'zh-TW' | string {
  const normalized = lang.trim().replace(/_/g, '-').toLowerCase()
  const subtags = normalized.split('-')
  if (subtags.includes('hans')) return 'zh-CN'
  if (subtags.includes('hant')) return 'zh-TW'
  if (subtags.includes('cn') || subtags.includes('sg')) return 'zh-CN'
  if (subtags.includes('tw') || subtags.includes('hk') || subtags.includes('mo')) return 'zh-TW'
  if (normalized === 'zh') return 'zh-CN'
  return lang
}

export function refineGenericChineseLanguage(lang: string, hint?: string | null): string {
  if (lang.trim().toLowerCase() !== 'zh') return lang
  if (!hint || primarySubtag(hint) !== 'zh' || hint.trim().toLowerCase() === 'zh') return lang
  return normalizeChineseVariant(hint)
}

export function canonicalizeLanguageForTranslation(lang: string): string {
  return primarySubtag(lang) === 'zh' ? normalizeChineseVariant(lang) : lang
}

export function isSameLanguageForTranslation(source: string, target: string): boolean {
  if (primarySubtag(source) === 'zh' && primarySubtag(target) === 'zh') {
    return normalizeChineseVariant(source) === normalizeChineseVariant(target)
  }
  return primarySubtag(source) === primarySubtag(target)
}
