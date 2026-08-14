import type { CefrLevel, SummaryFormat, SummaryLength, WritingTone } from '@/shared/ai/types'
import type { LanguageCode } from '@/shared/languages'

export const POPUP_SETTINGS_KEY = 'nativeTranslate.settings' as const
export const FIRST_RUN_STATUS_KEY = 'nativeTranslate.firstRunStatus' as const
export const AI_SETTINGS_KEY = 'nativeTranslate.aiSettings' as const
export const AI_CAPABILITIES_KEY = 'nativeTranslate.aiCapabilities' as const
export const VOCAB_BOOK_KEY = 'nativeTranslate.vocabBook' as const
export const SIDE_PANEL_INTENT_KEY = 'nativeTranslate.sidePanelIntent' as const
export const WELCOME_TOUR_KEY = 'nativeTranslate.welcomeTour' as const

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

export interface AiFeatureFlags {
  summary: boolean
  selection: boolean
  writing: boolean
  screenshot: boolean
  chat: boolean
  learning: boolean
  voice: boolean
  epubDigest: boolean
  extract: boolean
}

export interface AiSettings {
  features: AiFeatureFlags
  summary: { format: SummaryFormat; length: SummaryLength; bilingual: boolean }
  writing: { defaultTone: WritingTone }
  learning: { level: CefrLevel; showPhonetic: boolean }
  selection: { trigger: 'auto' | 'modifier'; minChars: number }
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  features: {
    summary: true,
    selection: true,
    writing: true,
    screenshot: true,
    chat: true,
    learning: true,
    voice: true,
    epubDigest: true,
    extract: true,
  },
  summary: { format: 'key-points', length: 'medium', bilingual: true },
  writing: { defaultTone: 'professional' },
  learning: { level: 'B1', showPhonetic: true },
  selection: { trigger: 'auto', minChars: 2 },
}

export type SidePanelIntent =
  | { kind: 'summary'; tabId?: number; createdAt: number }
  | { kind: 'chat'; tabId?: number; createdAt: number }
  | { kind: 'vocab'; tabId?: number; createdAt: number }
  | { kind: 'voice'; tabId?: number; createdAt: number }
  | { kind: 'file'; tabId?: number; createdAt: number }
