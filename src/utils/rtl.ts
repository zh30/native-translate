/**
 * Determine if a BCP-47 language code should render Right-To-Left.
 */
export function isRTLLanguage(languageCode: string | undefined | null): boolean {
  if (!languageCode) return false;
  const lc = languageCode.toLowerCase();
  // Common RTL languages
  const rtlPrefixes = ['ar', 'he', 'fa', 'ur', 'ps'];
  return rtlPrefixes.some((p) => lc === p || lc.startsWith(`${p}-`));
}

/**
 * Extract best-effort UI locale from Chrome i18n.
 */
export function getUILocale(): string {
  try {
    // Prefer getUILanguage if available
    const lang = (chrome?.i18n?.getUILanguage?.() as string | undefined) || '';
    if (lang) return lang;
  } catch (_e) { }
  try {
    // Fallback special message
    const locale = chrome?.i18n?.getMessage?.('@@ui_locale');
    return locale || 'en';
  } catch (_e) {
    return 'en';
  }
}


