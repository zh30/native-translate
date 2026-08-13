import type {
  ExplainResult,
  ExtractedContact,
  ExtractedEvent,
  ExtractedProduct,
  ExtractResult,
  OcrTranslateResult,
  PickWordsResult,
  ProofreadResult,
  SuggestQuestionsResult,
  TranscribeResult,
} from '@/shared/ai/types'

export const EXPLAIN_V1_SCHEMA = {
  type: 'object',
  required: ['translation', 'explanation'],
  properties: {
    translation: { type: 'string' },
    explanation: { type: 'string' },
    idioms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phrase: { type: 'string' },
          meaning: { type: 'string' },
        },
        required: ['phrase', 'meaning'],
      },
    },
    grammar: { type: 'array', items: { type: 'string' } },
  },
} as const

export const PROOFREAD_V1_SCHEMA = {
  type: 'object',
  required: ['corrected', 'issues'],
  properties: {
    corrected: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['span', 'type', 'note'],
        properties: {
          span: { type: 'string' },
          type: { enum: ['grammar', 'spelling', 'word-choice', 'punctuation', 'style'] },
          note: { type: 'string' },
        },
      },
    },
  },
} as const

export const OCR_TRANSLATE_V1_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'translation'],
        properties: {
          source: { type: 'string' },
          translation: { type: 'string' },
        },
      },
    },
  },
} as const

export const PICK_WORDS_V1_SCHEMA = {
  type: 'object',
  required: ['words'],
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        required: ['word', 'lemma', 'meaning'],
        properties: {
          word: { type: 'string' },
          lemma: { type: 'string' },
          level: { enum: ['A2', 'B1', 'B2', 'C1', 'C2'] },
          meaning: { type: 'string' },
        },
      },
    },
  },
} as const

export const SUGGEST_QUESTIONS_V1_SCHEMA = {
  type: 'object',
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string' },
    },
  },
} as const

export const TRANSCRIBE_V1_SCHEMA = {
  type: 'object',
  required: ['segments'],
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' } },
      },
    },
  },
} as const

export const EXTRACT_CLASSIFY_V1_SCHEMA = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { enum: ['event', 'contact', 'product', 'none'] },
  },
} as const

export const EXTRACT_EVENT_V1_SCHEMA = {
  type: 'object',
  required: ['type', 'title'],
  properties: {
    type: { const: 'event' },
    title: { type: 'string' },
    title_original: { type: 'string' },
    start: { type: 'string' },
    end: { type: 'string' },
    location: { type: 'string' },
    location_original: { type: 'string' },
    url: { type: 'string' },
    notes: { type: 'string' },
  },
} as const

export const EXTRACT_CONTACT_V1_SCHEMA = {
  type: 'object',
  required: ['type', 'name'],
  properties: {
    type: { const: 'contact' },
    name: { type: 'string' },
    name_original: { type: 'string' },
    org: { type: 'string' },
    phone: { type: 'string' },
    email: { type: 'string' },
    address: { type: 'string' },
    address_original: { type: 'string' },
  },
} as const

export const EXTRACT_PRODUCT_V1_SCHEMA = {
  type: 'object',
  required: ['type', 'name'],
  properties: {
    type: { const: 'product' },
    name: { type: 'string' },
    name_original: { type: 'string' },
    price: { type: 'string' },
    currency: { type: 'string' },
    specs: { type: 'string' },
    highlights: { type: 'string' },
  },
} as const

export function stripFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced?.[1]) return fenced[1].trim()
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export function parseJsonObject(text: string): unknown {
  const stripped = stripFence(text)
  try {
    return JSON.parse(stripped)
  } catch {
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1))
    }
    throw new SyntaxError('Unable to parse JSON from model output')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

export function parseExplainResult(text: string): ExplainResult {
  const raw = parseJsonObject(text)
  if (
    !isRecord(raw) ||
    typeof raw.translation !== 'string' ||
    typeof raw.explanation !== 'string'
  ) {
    throw new SyntaxError('Invalid EXPLAIN_V1 payload')
  }
  const idioms = Array.isArray(raw.idioms)
    ? raw.idioms
        .filter(isRecord)
        .map((item) => ({ phrase: asString(item.phrase), meaning: asString(item.meaning) }))
        .filter((item) => item.phrase && item.meaning)
    : undefined
  const grammar = Array.isArray(raw.grammar) ? raw.grammar.map(asString).filter(Boolean) : undefined
  return {
    translation: raw.translation,
    explanation: raw.explanation,
    ...(idioms && idioms.length > 0 ? { idioms } : {}),
    ...(grammar && grammar.length > 0 ? { grammar } : {}),
  }
}

const PROOFREAD_TYPES = new Set(['grammar', 'spelling', 'word-choice', 'punctuation', 'style'])

export function parseProofreadResult(text: string): ProofreadResult {
  const raw = parseJsonObject(text)
  if (!isRecord(raw) || typeof raw.corrected !== 'string' || !Array.isArray(raw.issues)) {
    throw new SyntaxError('Invalid PROOFREAD_V1 payload')
  }
  return {
    corrected: raw.corrected,
    issues: raw.issues.filter(isRecord).map((item) => ({
      span: asString(item.span),
      type: PROOFREAD_TYPES.has(asString(item.type))
        ? (asString(item.type) as ProofreadResult['issues'][number]['type'])
        : 'style',
      note: asString(item.note),
    })),
  }
}

export function parseOcrTranslateResult(text: string): OcrTranslateResult {
  const raw = parseJsonObject(text)
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    throw new SyntaxError('Invalid OCR_TRANSLATE_V1 payload')
  }
  return {
    items: raw.items.filter(isRecord).map((item) => ({
      source: asString(item.source),
      translation: asString(item.translation),
    })),
  }
}

export function parsePickWordsResult(text: string): PickWordsResult {
  const raw = parseJsonObject(text)
  if (!isRecord(raw) || !Array.isArray(raw.words)) {
    throw new SyntaxError('Invalid PICK_WORDS_V1 payload')
  }
  return {
    words: raw.words.filter(isRecord).map((item) => ({
      word: asString(item.word),
      lemma: asString(item.lemma) || asString(item.word),
      meaning: asString(item.meaning),
      ...(typeof item.level === 'string'
        ? { level: item.level as PickWordsResult['words'][number]['level'] }
        : {}),
    })),
  }
}

export function parseSuggestQuestionsResult(text: string): SuggestQuestionsResult {
  const raw = parseJsonObject(text)
  if (!isRecord(raw) || !Array.isArray(raw.questions)) {
    throw new SyntaxError('Invalid SUGGEST_QUESTIONS_V1 payload')
  }
  const questions = raw.questions.map(asString).filter(Boolean).slice(0, 3)
  while (questions.length < 3) questions.push('')
  return { questions }
}

export function parseTranscribeResult(text: string): TranscribeResult {
  const raw = parseJsonObject(text)
  if (!isRecord(raw) || !Array.isArray(raw.segments)) {
    throw new SyntaxError('Invalid TRANSCRIBE_V1 payload')
  }
  return {
    segments: raw.segments.filter(isRecord).map((item) => ({ text: asString(item.text) })),
  }
}

export function parseExtractClassification(text: string): ExtractResult['type'] {
  const raw = parseJsonObject(text)
  if (!isRecord(raw)) throw new SyntaxError('Invalid EXTRACT classify payload')
  const type = asString(raw.type)
  if (type === 'event' || type === 'contact' || type === 'product' || type === 'none') return type
  return 'none'
}

export function parseExtractResult(text: string, entity?: ExtractResult['type']): ExtractResult {
  const raw = parseJsonObject(text)
  if (!isRecord(raw)) throw new SyntaxError('Invalid EXTRACT_V1 payload')
  const type = (entity && entity !== 'none' ? entity : asString(raw.type)) as ExtractResult['type']
  if (type === 'none') return { type: 'none' }
  if (type === 'event') {
    const event: ExtractedEvent = {
      type: 'event',
      title: asString(raw.title),
      ...(raw.title_original ? { title_original: asString(raw.title_original) } : {}),
      ...(raw.start ? { start: asString(raw.start) } : {}),
      ...(raw.end ? { end: asString(raw.end) } : {}),
      ...(raw.location ? { location: asString(raw.location) } : {}),
      ...(raw.location_original ? { location_original: asString(raw.location_original) } : {}),
      ...(raw.url ? { url: asString(raw.url) } : {}),
      ...(raw.notes ? { notes: asString(raw.notes) } : {}),
    }
    return event
  }
  if (type === 'contact') {
    const contact: ExtractedContact = {
      type: 'contact',
      name: asString(raw.name),
      ...(raw.name_original ? { name_original: asString(raw.name_original) } : {}),
      ...(raw.org ? { org: asString(raw.org) } : {}),
      ...(raw.phone ? { phone: asString(raw.phone) } : {}),
      ...(raw.email ? { email: asString(raw.email) } : {}),
      ...(raw.address ? { address: asString(raw.address) } : {}),
      ...(raw.address_original ? { address_original: asString(raw.address_original) } : {}),
    }
    return contact
  }
  if (type === 'product') {
    const product: ExtractedProduct = {
      type: 'product',
      name: asString(raw.name),
      ...(raw.name_original ? { name_original: asString(raw.name_original) } : {}),
      ...(raw.price ? { price: asString(raw.price) } : {}),
      ...(raw.currency ? { currency: asString(raw.currency) } : {}),
      ...(raw.specs ? { specs: asString(raw.specs) } : {}),
      ...(raw.highlights ? { highlights: asString(raw.highlights) } : {}),
    }
    return product
  }
  return { type: 'none' }
}
