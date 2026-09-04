import { DEFAULT_TARGET_LANGUAGE, type LanguageCode } from '@/shared/languages'
import { MSG_TRANSLATE_PAGE } from '@/shared/messages'

export function resolveTranslatePageTarget(
  settings: { targetLanguage?: LanguageCode } | undefined,
  fallback: LanguageCode = DEFAULT_TARGET_LANGUAGE,
): LanguageCode {
  return settings?.targetLanguage ?? fallback
}

export function buildTranslatePageMessage(targetLanguage: LanguageCode): {
  type: typeof MSG_TRANSLATE_PAGE
  payload: { targetLanguage: LanguageCode }
} {
  return {
    type: MSG_TRANSLATE_PAGE,
    payload: { targetLanguage },
  }
}

export function resolveLearningModeEnabled(
  payload: { enabled?: boolean; toggle?: boolean } | undefined,
  currentlyEnabled: boolean,
): boolean {
  if (payload?.toggle) return !currentlyEnabled
  return Boolean(payload?.enabled)
}

export function buildExtractMenuPayload(info: { selectionText?: string }): {
  extractSelection: true
  selectionText: string
} {
  return {
    extractSelection: true,
    selectionText: info.selectionText?.trim() ?? '',
  }
}

export function resolveExtractSelectionText(payload: {
  selectionText?: string
  extractSelection?: boolean
}): string {
  const fromMenu = payload.selectionText?.trim() ?? ''
  if (fromMenu) return fromMenu
  return ''
}
