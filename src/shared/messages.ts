import type { AiTask } from './ai/types'
import type { LanguageCode } from './languages'

// Runtime message types used across extension contexts
export const MSG_TRANSLATE_PAGE = 'NATIVE_TRANSLATE_TRANSLATE_PAGE' as const
export const MSG_TRANSLATE_TEXT = 'NATIVE_TRANSLATE_TRANSLATE_TEXT' as const
export const MSG_UPDATE_HOTKEY = 'NATIVE_TRANSLATE_UPDATE_HOTKEY' as const
export const MSG_EASTER_CONFETTI = 'NATIVE_TRANSLATE_EASTER_EGG_CONFETTI' as const
export const MSG_WARM_TRANSLATOR = 'NATIVE_TRANSLATE_WARM_TRANSLATOR' as const

export const MSG_AI_TASK = 'NATIVE_TRANSLATE_AI_TASK' as const
export const MSG_AI_CAPABILITIES = 'NATIVE_TRANSLATE_AI_CAPABILITIES' as const
export const MSG_GET_PAGE_CONTENT = 'NATIVE_TRANSLATE_GET_PAGE_CONTENT' as const
export const MSG_CAPTURE_REGION = 'NATIVE_TRANSLATE_CAPTURE_REGION' as const
export const MSG_SUMMARIZE_PAGE = 'NATIVE_TRANSLATE_SUMMARIZE_PAGE' as const
export const MSG_TOGGLE_LEARNING_MODE = 'NATIVE_TRANSLATE_TOGGLE_LEARNING' as const
export const MSG_START_REGION_SELECT = 'NATIVE_TRANSLATE_START_REGION_SELECT' as const
export const MSG_CLEAR_PAGE_TRANSLATION = 'NATIVE_TRANSLATE_CLEAR_PAGE_TRANSLATION' as const
export const MSG_OPEN_SETTINGS = 'NATIVE_TRANSLATE_OPEN_SETTINGS' as const
export const PORT_AI_STREAM = 'nativeTranslate.aiStream' as const

export type RuntimeMessage =
  | { type: typeof MSG_TRANSLATE_PAGE; payload: { targetLanguage: LanguageCode } }
  | {
      type: typeof MSG_TRANSLATE_TEXT
      payload: { text: string; sourceLanguage: LanguageCode | 'auto'; targetLanguage: LanguageCode }
    }
  | { type: typeof MSG_UPDATE_HOTKEY; payload: { hotkeyModifier: 'alt' | 'control' | 'shift' } }
  | { type: typeof MSG_EASTER_CONFETTI }
  | {
      type: typeof MSG_WARM_TRANSLATOR
      payload?: { sourceLanguage?: LanguageCode | 'auto'; targetLanguage?: LanguageCode }
    }
  | { type: typeof MSG_AI_TASK; payload: { requestId: string; task: AiTask } }
  | { type: typeof MSG_AI_CAPABILITIES; payload?: { force?: boolean } }
  | { type: typeof MSG_GET_PAGE_CONTENT }
  | {
      type: typeof MSG_CAPTURE_REGION
      payload: { rect: { x: number; y: number; width: number; height: number }; dpr: number }
    }
  | { type: typeof MSG_SUMMARIZE_PAGE }
  | {
      type: typeof MSG_TOGGLE_LEARNING_MODE
      payload: { enabled?: boolean; toggle?: boolean; query?: boolean }
    }
  | {
      type: typeof MSG_START_REGION_SELECT
      payload?: { srcUrl?: string; extractSelection?: boolean; selectionText?: string }
    }
  | { type: typeof MSG_CLEAR_PAGE_TRANSLATION }
  | { type: typeof MSG_OPEN_SETTINGS }
