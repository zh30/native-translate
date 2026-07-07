import type { LanguageCode } from '@/shared/languages'

export const POPUP_SETTINGS_KEY = 'nativeTranslate.settings' as const
export const FIRST_RUN_STATUS_KEY = 'nativeTranslate.firstRunStatus' as const

export type FirstRunModelStatus =
  | 'new'
  | 'preparing'
  | 'downloading'
  | 'ready'
  | 'failed'
  | 'unsupported'

export interface FirstRunStatus {
  status: FirstRunModelStatus
  updatedAt: number
  progress?: number
  sourceLanguage?: string
  targetLanguage?: string
  error?: string
}

export interface PopupSettings {
  targetLanguage: LanguageCode
  hotkeyModifier?: 'alt' | 'control' | 'shift'
  inputTargetLanguage?: LanguageCode
}
