import type { LanguageCode } from '@/shared/languages'

export type AiErrorCode =
  | 'model_unavailable'
  | 'download_required'
  | 'hardware_unsupported'
  | 'quota_exceeded'
  | 'language_unsupported'
  | 'aborted'
  | 'internal'

export type SummaryFormat = 'key-points' | 'tldr' | 'teaser' | 'headline'
export type SummaryLength = 'short' | 'medium' | 'long'
export type WritingTone = 'professional' | 'friendly' | 'concise'
export type CefrLevel = 'A2' | 'B1' | 'B2' | 'C1'
export type ExtractEntity = 'auto' | 'event' | 'contact' | 'product' | 'none'

export type GateState =
  | 'unknown'
  | 'checking'
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'ready'
  | 'error'

export type NanoLanguage = 'en' | 'ja' | 'es' | 'de' | 'fr'

export type AiTask =
  | {
      kind: 'summarize'
      text: string
      format: SummaryFormat
      length: SummaryLength
      targetLanguage: LanguageCode
    }
  | {
      kind: 'explain'
      text: string
      contextText?: string
      targetLanguage: LanguageCode
    }
  | {
      kind: 'polish'
      text: string
      tone: WritingTone
      targetLanguage: LanguageCode
    }
  | {
      kind: 'proofread'
      text: string
    }
  | {
      kind: 'ocrTranslate'
      imageDataUrl: string
      targetLanguage: LanguageCode
    }
  | {
      kind: 'chat'
      sessionId: string
      question: string
      pageDigest?: string
      targetLanguage: LanguageCode
    }
  | {
      kind: 'pickWords'
      text: string
      level: CefrLevel
      targetLanguage: LanguageCode
    }
  | {
      kind: 'defineWord'
      word: string
      sentence: string
      targetLanguage: LanguageCode
    }
  | {
      kind: 'transcribe'
      audio: ArrayBuffer
      targetLanguage: LanguageCode
    }
  | {
      kind: 'extract'
      text: string
      entity: ExtractEntity
      targetLanguage: LanguageCode
    }
  | {
      kind: 'suggestQuestions'
      digest: string
      title: string
      targetLanguage: LanguageCode
    }

export interface AiStreamUsage {
  contextUsage: number
  contextWindow: number
}

export type AiStreamFrame =
  | { type: 'chunk'; requestId: string; delta: string }
  | { type: 'done'; requestId: string; usage?: AiStreamUsage; result?: unknown }
  | { type: 'error'; requestId: string; code: AiErrorCode; message: string }

export interface AiTaskRequest {
  requestId: string
  task: AiTask
}

export interface AiTaskResponse {
  ok: boolean
  requestId: string
  result?: unknown
  code?: AiErrorCode
  message?: string
}

export class AiTaskError extends Error {
  readonly code: AiErrorCode

  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.name = 'AiTaskError'
    this.code = code
  }
}

export interface LanguageModelLike {
  prompt: (
    input: unknown,
    options?: { signal?: AbortSignal; responseConstraint?: unknown },
  ) => Promise<string>
  promptStreaming?: (
    input: unknown,
    options?: { signal?: AbortSignal; responseConstraint?: unknown },
  ) => unknown
  clone?: () => Promise<LanguageModelLike>
  destroy?: () => void
  measureInputUsage?: (input: unknown) => Promise<number>
  inputQuota?: number
  contextUsage?: number
  contextWindow?: number
  addEventListener?: (type: string, listener: EventListener) => void
  removeEventListener?: (type: string, listener: EventListener) => void
}

export interface SummarizerLike {
  summarize: (text: string, options?: { signal?: AbortSignal }) => Promise<string>
  summarizeStreaming?: (text: string, options?: { signal?: AbortSignal }) => unknown
  measureInputUsage?: (text: string) => Promise<number>
  inputQuota?: number
  destroy?: () => void
}

export type TranslateFn = (
  text: string,
  sourceLanguage: string,
  targetLanguage: LanguageCode,
) => Promise<string>

export interface ExplainResult {
  translation: string
  explanation: string
  idioms?: Array<{ phrase: string; meaning: string }>
  grammar?: string[]
}

export interface ProofreadIssue {
  span: string
  type: 'grammar' | 'spelling' | 'word-choice' | 'punctuation' | 'style'
  note: string
}

export interface ProofreadResult {
  corrected: string
  issues: ProofreadIssue[]
}

export interface OcrTranslateItem {
  source: string
  translation: string
}

export interface OcrTranslateResult {
  items: OcrTranslateItem[]
}

export interface PickWordItem {
  word: string
  lemma: string
  level?: CefrLevel | 'C2'
  meaning: string
}

export interface PickWordsResult {
  words: PickWordItem[]
}

export interface TranscribeSegment {
  text: string
}

export interface TranscribeResult {
  segments: TranscribeSegment[]
  translation?: string
}

export interface SuggestQuestionsResult {
  questions: [string, string, string] | string[]
}

export interface ExtractedEvent {
  type: 'event'
  title: string
  title_original?: string
  start?: string
  end?: string
  location?: string
  location_original?: string
  url?: string
  notes?: string
}

export interface ExtractedContact {
  type: 'contact'
  name: string
  name_original?: string
  org?: string
  phone?: string
  email?: string
  address?: string
  address_original?: string
}

export interface ExtractedProduct {
  type: 'product'
  name: string
  name_original?: string
  price?: string
  currency?: string
  specs?: string
  highlights?: string
}

export type ExtractResult = { type: 'none' } | ExtractedEvent | ExtractedContact | ExtractedProduct
