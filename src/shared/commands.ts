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
