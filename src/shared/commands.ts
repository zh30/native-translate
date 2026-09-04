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

export function classifyTabSendFailure(
  error: unknown,
): 'missing-receiver' | 'no-response' | 'other' {
  const message = error instanceof Error ? error.message : String(error)
  if (/Receiving end does not exist/i.test(message)) {
    return 'missing-receiver'
  }
  if (
    /message port closed before a response was received/i.test(message) ||
    /message channel closed before a response was received/i.test(message)
  ) {
    return 'no-response'
  }
  if (/Could not establish connection/i.test(message)) {
    return 'missing-receiver'
  }
  return 'other'
}

export async function deliverTabMessage<T>(
  send: () => Promise<T>,
  retryAfterInject: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await send()
  } catch (error) {
    const kind = classifyTabSendFailure(error)
    if (kind === 'no-response') return undefined
    if (kind !== 'missing-receiver') throw error
    return retryAfterInject()
  }
}

export async function openExtensionPopup(api: {
  openPopup?: () => Promise<void>
  openPopupWindow: () => Promise<void>
}): Promise<'popup' | 'window'> {
  if (typeof api.openPopup === 'function') {
    try {
      await api.openPopup()
      return 'popup'
    } catch {
      // openPopup requires a privileged user gesture that content-script clicks lose.
    }
  }
  await api.openPopupWindow()
  return 'window'
}

export function resolveLearningModeEnabled(
  payload: { enabled?: boolean; toggle?: boolean; query?: boolean } | undefined,
  currentlyEnabled: boolean,
): boolean {
  if (payload?.query) return currentlyEnabled
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
