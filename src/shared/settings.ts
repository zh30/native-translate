import type { LanguageCode } from '@/shared/languages';

export const POPUP_SETTINGS_KEY = 'nativeTranslate.settings' as const;

export interface PopupSettings {
  targetLanguage: LanguageCode;
  hotkeyModifier?: 'alt' | 'control' | 'shift';
  inputTargetLanguage?: LanguageCode;
}


