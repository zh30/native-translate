// Runtime message types used across extension contexts

export const MSG_DEV_RELOAD = 'NATIVE_TRANSLATE_DEV_RELOAD' as const;
export const MSG_TRANSLATE_PAGE = 'NATIVE_TRANSLATE_TRANSLATE_PAGE' as const;
export const MSG_TRANSLATE_TEXT = 'NATIVE_TRANSLATE_TRANSLATE_TEXT' as const;
export const MSG_UPDATE_HOTKEY = 'NATIVE_TRANSLATE_UPDATE_HOTKEY' as const;
export const MSG_EASTER_CONFETTI = 'NATIVE_TRANSLATE_EASTER_EGG_CONFETTI' as const;

export type RuntimeMessage =
  | { type: typeof MSG_DEV_RELOAD }
  | { type: typeof MSG_TRANSLATE_PAGE; payload: { targetLanguage: string } }
  | { type: typeof MSG_TRANSLATE_TEXT; payload: { text: string; sourceLanguage: string; targetLanguage: string } }
  | { type: typeof MSG_UPDATE_HOTKEY; payload: { hotkeyModifier: 'alt' | 'control' | 'shift' } }
  | { type: typeof MSG_EASTER_CONFETTI };


