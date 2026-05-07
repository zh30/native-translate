export function t(key: string, substitutions?: Array<string | number>): string {
  try {
    // chrome.i18n.getMessage 第二个参数可为 string 或 string[]
    const value = chrome?.i18n?.getMessage?.(
      key,
      (substitutions ?? []) as unknown as string | string[],
    )
    return value || key
  } catch (_e) {
    return key
  }
}
