import { multimodalAudioPart, multimodalImagePart } from '@/shared/ai/imageTask'
import {
  applyLanguageChain,
  applyLanguageChainFields,
  nanoLanguageLabel,
  resolveLanguageChain,
} from '@/shared/ai/languageChain'
import { translateWithLocalTranslator } from '@/shared/ai/localTranslator'
import { extractFieldsToChain, summarizerTypeForFormat } from '@/shared/ai/productInvariants'
import {
  PROOFREAD_V1_SYSTEM,
  renderDefineWordPrompt,
  renderExplainPrompt,
  renderExtractClassifyPrompt,
  renderExtractFieldsPrompt,
  renderOcrPrompt,
  renderPageChatSystem,
  renderPickWordsPrompt,
  renderPolishPrompt,
  renderSuggestQuestionsPrompt,
  TRANSCRIBE_V1_SYSTEM,
} from '@/shared/ai/prompts'
import {
  EXPLAIN_V1_SCHEMA,
  EXTRACT_CLASSIFY_V1_SCHEMA,
  EXTRACT_CONTACT_V1_SCHEMA,
  EXTRACT_EVENT_V1_SCHEMA,
  EXTRACT_PRODUCT_V1_SCHEMA,
  OCR_TRANSLATE_V1_SCHEMA,
  PICK_WORDS_V1_SCHEMA,
  PROOFREAD_V1_SCHEMA,
  parseExplainResult,
  parseExtractClassification,
  parseExtractResult,
  parseOcrTranslateResult,
  parsePickWordsResult,
  parseProofreadResult,
  parseSuggestQuestionsResult,
  parseTranscribeResult,
  SUGGEST_QUESTIONS_V1_SCHEMA,
  TRANSCRIBE_V1_SCHEMA,
} from '@/shared/ai/schemas'
import {
  compactSessionWithSummarizer,
  languageModelPool,
  sessionKey,
  summarizerPool,
} from '@/shared/ai/sessionManager'
import { summarizeLongText } from '@/shared/ai/summarizePipeline'
import {
  type AiStreamFrame,
  type AiTask,
  AiTaskError,
  type LanguageModelLike,
  type SummarizerLike,
} from '@/shared/ai/types'
import type { LanguageCode } from '@/shared/languages'
import { normalizeToAsyncStringIterable } from '@/shared/streaming'

interface CreateOptions {
  expectedInputs?: Array<{ type: string; languages?: string[] }>
  expectedOutputs?: Array<{ type: string; languages?: string[] }>
  initialPrompts?: Array<{ role: string; content: string }>
  temperature?: number
  monitor?: (monitor: { addEventListener: (type: string, cb: (e: Event) => void) => void }) => void
}

interface LanguageModelStatic {
  availability?: (options?: unknown) => Promise<string>
  create?: (options?: CreateOptions) => Promise<LanguageModelLike>
}

interface SummarizerStatic {
  availability?: (options?: unknown) => Promise<string>
  create?: (options?: {
    type?: string
    format?: string
    length?: string
    outputLanguage?: string
    monitor?: CreateOptions['monitor']
  }) => Promise<SummarizerLike>
}

function getLanguageModelApi(): LanguageModelStatic | undefined {
  return (globalThis as typeof globalThis & { LanguageModel?: LanguageModelStatic }).LanguageModel
}

function getSummarizerApi(): SummarizerStatic | undefined {
  return (globalThis as typeof globalThis & { Summarizer?: SummarizerStatic }).Summarizer
}

export const AVAILABILITY_PROBE_MS = 3000

export async function readAvailabilityStatus(
  availability: ((options?: unknown) => Promise<string>) | undefined,
  options?: unknown,
  timeoutMs = AVAILABILITY_PROBE_MS,
): Promise<string> {
  if (typeof availability !== 'function') return 'missing'
  try {
    return await Promise.race([
      availability(options),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('timeout'), timeoutMs)
      }),
    ])
  } catch {
    return 'unavailable'
  }
}

export function shouldCreateDespiteAvailability(status: string): boolean {
  return (
    status === 'available' || status === 'readily' || status === 'timeout' || status === 'missing'
  )
}

function availabilityToError(value: string | undefined): AiTaskError {
  if (value === 'downloadable' || value === 'downloading' || value === 'after-download') {
    return new AiTaskError('download_required', 'On-device model must be downloaded first')
  }
  if (value === 'unavailable' || value === 'no') {
    return new AiTaskError('hardware_unsupported', 'On-device model is unavailable on this device')
  }
  return new AiTaskError('model_unavailable', 'On-device AI API is not available')
}

async function ensureLanguageModel(options?: CreateOptions): Promise<LanguageModelLike> {
  const api = getLanguageModelApi()
  if (!api?.create) throw new AiTaskError('model_unavailable', 'LanguageModel API is not available')
  const availabilityQuery = {
    expectedInputs: options?.expectedInputs,
    expectedOutputs: options?.expectedOutputs,
  }
  const status = await readAvailabilityStatus(api.availability, availabilityQuery)
  if (!shouldCreateDespiteAvailability(status)) throw availabilityToError(status)
  return api.create(options)
}

async function ensureSummarizer(options: {
  format: string
  length: string
  outputLanguage?: string
}): Promise<SummarizerLike> {
  const api = getSummarizerApi()
  if (!api?.create) throw new AiTaskError('model_unavailable', 'Summarizer API is not available')
  const type = summarizerTypeForFormat(options.format)
  const baseOpts = {
    type,
    format: 'markdown',
    length: options.length,
  }
  const withLang = { ...baseOpts, outputLanguage: options.outputLanguage }
  const withLangStatus = await readAvailabilityStatus(api.availability, withLang)
  if (!shouldCreateDespiteAvailability(withLangStatus)) {
    const baseStatus = await readAvailabilityStatus(api.availability, baseOpts)
    if (!shouldCreateDespiteAvailability(baseStatus)) throw availabilityToError(baseStatus)
    return api.create(baseOpts)
  }
  try {
    return await api.create(withLang)
  } catch {
    return api.create(baseOpts)
  }
}

async function collectStream(source: unknown, onChunk?: (delta: string) => void): Promise<string> {
  let acc = ''
  for await (const chunk of normalizeToAsyncStringIterable(source)) {
    acc += chunk
    onChunk?.(chunk)
  }
  return acc
}

async function promptModel(
  session: LanguageModelLike,
  input: unknown,
  options?: {
    signal?: AbortSignal
    responseConstraint?: unknown
    onChunk?: (delta: string) => void
  },
): Promise<string> {
  if (options?.onChunk && session.promptStreaming) {
    const stream = session.promptStreaming(input, {
      signal: options.signal,
      responseConstraint: options.responseConstraint,
    })
    return collectStream(stream, options.onChunk)
  }
  const result = await session.prompt(input, {
    signal: options?.signal,
    responseConstraint: options?.responseConstraint,
  })
  options?.onChunk?.(result)
  return result
}

export function readSessionUsage(
  session: LanguageModelLike | undefined,
): { contextUsage: number; contextWindow: number } | undefined {
  if (!session) return undefined
  if (typeof session.contextUsage !== 'number' || typeof session.contextWindow !== 'number') {
    return undefined
  }
  if (session.contextWindow <= 0) return undefined
  return { contextUsage: session.contextUsage, contextWindow: session.contextWindow }
}

export function shouldCompactSession(usage?: {
  contextUsage: number
  contextWindow: number
}): boolean {
  if (!usage || usage.contextWindow <= 0) return false
  return usage.contextUsage / usage.contextWindow >= 0.85
}

export async function finalizeSummarizeOutput(
  raw: string,
  targetLanguage: LanguageCode,
): Promise<{ text: string; sourceText: string }> {
  const chain = resolveLanguageChain(targetLanguage)
  const text = await applyLanguageChain(raw, targetLanguage, translateWithLocalTranslator)
  return {
    text,
    sourceText: chain.needsTranslation ? raw : text,
  }
}

function usageFromResult(
  result: unknown,
): { contextUsage: number; contextWindow: number } | undefined {
  if (!result || typeof result !== 'object' || !('usage' in result)) return undefined
  const usage = (result as { usage?: { contextUsage: number; contextWindow: number } }).usage
  if (usage && typeof usage.contextUsage === 'number' && typeof usage.contextWindow === 'number') {
    return usage
  }
  return undefined
}

export async function executeAiTask(
  task: AiTask,
  options?: {
    requestId?: string
    signal?: AbortSignal
    onChunk?: (delta: string) => void
    onFrame?: (frame: AiStreamFrame) => void
  },
): Promise<unknown> {
  const requestId = options?.requestId ?? `ai-${Date.now()}`
  try {
    const result = await executeInner(task, options)
    options?.onFrame?.({ type: 'done', requestId, result, usage: usageFromResult(result) })
    return result
  } catch (error) {
    if (error instanceof AiTaskError) {
      options?.onFrame?.({ type: 'error', requestId, code: error.code, message: error.message })
      throw error
    }
    if ((error as Error)?.name === 'AbortError') {
      const aborted = new AiTaskError('aborted', 'Task was cancelled')
      options?.onFrame?.({ type: 'error', requestId, code: aborted.code, message: aborted.message })
      throw aborted
    }
    const internal = new AiTaskError(
      'internal',
      error instanceof Error ? error.message : 'Internal AI error',
    )
    options?.onFrame?.({ type: 'error', requestId, code: internal.code, message: internal.message })
    throw internal
  }
}

async function executeInner(
  task: AiTask,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<unknown> {
  switch (task.kind) {
    case 'summarize':
      return executeSummarize(task, options)
    case 'explain':
      return executeExplain(task, options)
    case 'polish':
      return executePolish(task, options)
    case 'proofread':
      return executeProofread(task, options)
    case 'ocrTranslate':
      return executeOcr(task, options)
    case 'chat':
      return executeChat(task, options)
    case 'pickWords':
      return executePickWords(task, options)
    case 'defineWord':
      return executeDefineWord(task, options)
    case 'transcribe':
      return executeTranscribe(task, options)
    case 'extract':
      return executeExtract(task, options)
    case 'suggestQuestions':
      return executeSuggestQuestions(task, options)
    default: {
      const _never: never = task
      throw new AiTaskError('internal', `Unknown task ${(_never as AiTask).kind}`)
    }
  }
}

async function executeSummarize(
  task: Extract<AiTask, { kind: 'summarize' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<{ text: string; sourceText: string; format: string; length: string }> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const key = sessionKey(['summarize', task.format, task.length, chain.nanoLanguage])
  let summarizer = summarizerPool.get(key)
  if (!summarizer) {
    summarizer = await ensureSummarizer({
      format: task.format,
      length: task.length,
      outputLanguage: chain.nanoLanguage,
    })
    summarizerPool.set(key, summarizer)
  }
  const raw = await summarizeLongText({
    text: task.text,
    format: task.format,
    length: task.length,
    summarizer,
    signal: options?.signal,
  })
  options?.onChunk?.(raw)
  const finalized = await finalizeSummarizeOutput(raw, task.targetLanguage)
  return { ...finalized, format: task.format, length: task.length }
}

async function executeExplain(
  task: Extract<AiTask, { kind: 'explain' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<unknown> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const prompt = renderExplainPrompt({
    outputLanguage: nanoLanguageLabel(chain.nanoLanguage),
    text: task.text,
    contextText: task.contextText,
  })
  const session = await ensureLanguageModel({
    expectedInputs: [{ type: 'text', languages: [chain.nanoLanguage] }],
    expectedOutputs: [{ type: 'text', languages: [chain.nanoLanguage] }],
    initialPrompts: [{ role: 'system', content: prompt.system }],
    temperature: 0.4,
  })
  const raw = await promptModel(session, prompt.user, {
    signal: options?.signal,
    responseConstraint: EXPLAIN_V1_SCHEMA,
    onChunk: options?.onChunk,
  })
  const parsed = parseExplainResult(raw)
  parsed.explanation = await applyLanguageChain(
    parsed.explanation,
    task.targetLanguage,
    translateWithLocalTranslator,
  )
  parsed.translation = await applyLanguageChain(
    parsed.translation,
    task.targetLanguage,
    translateWithLocalTranslator,
  )
  return parsed
}

async function executePolish(
  task: Extract<AiTask, { kind: 'polish' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<{ text: string }> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const prompt = renderPolishPrompt({
    outputLanguage: nanoLanguageLabel(chain.nanoLanguage),
    tone: task.tone,
    text: task.text,
  })
  const session = await ensureLanguageModel({
    expectedOutputs: [{ type: 'text', languages: [chain.nanoLanguage] }],
    initialPrompts: [{ role: 'system', content: prompt.system }],
  })
  const raw = await promptModel(session, prompt.user, {
    signal: options?.signal,
    onChunk: options?.onChunk,
  })
  const text = await applyLanguageChain(raw, task.targetLanguage, translateWithLocalTranslator)
  return { text }
}

async function executeProofread(
  task: Extract<AiTask, { kind: 'proofread' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<unknown> {
  const session = await ensureLanguageModel({
    initialPrompts: [{ role: 'system', content: PROOFREAD_V1_SYSTEM }],
    temperature: 0,
  })
  const raw = await promptModel(session, task.text, {
    signal: options?.signal,
    responseConstraint: PROOFREAD_V1_SCHEMA,
    onChunk: options?.onChunk,
  })
  return parseProofreadResult(raw)
}

async function executeOcr(
  task: Extract<AiTask, { kind: 'ocrTranslate' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<unknown> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const session = await ensureLanguageModel({
    expectedInputs: [{ type: 'image' }, { type: 'text' }],
    expectedOutputs: [{ type: 'text', languages: [chain.nanoLanguage] }],
    initialPrompts: [
      { role: 'system', content: renderOcrPrompt(nanoLanguageLabel(chain.nanoLanguage)) },
    ],
  })
  const raw = await promptModel(
    session,
    [multimodalImagePart(task.imageDataUrl), 'Extract and translate the text.'],
    {
      signal: options?.signal,
      responseConstraint: OCR_TRANSLATE_V1_SCHEMA,
      onChunk: options?.onChunk,
    },
  )
  const parsed = parseOcrTranslateResult(raw)
  if (chain.needsTranslation) {
    for (const item of parsed.items) {
      item.translation = await applyLanguageChain(
        item.translation,
        task.targetLanguage,
        translateWithLocalTranslator,
      )
    }
  }
  return parsed
}

async function executeChat(
  task: Extract<AiTask, { kind: 'chat' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<{
  text: string
  usage?: { contextUsage: number; contextWindow: number }
  compacted: boolean
}> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const key = sessionKey(['chat', task.sessionId, chain.nanoLanguage])
  const system = renderPageChatSystem({
    outputLanguage: nanoLanguageLabel(chain.nanoLanguage),
    title: '',
    digest: task.pageDigest ?? '',
  })
  let session = languageModelPool.get(key)
  if (!session) {
    session = await ensureLanguageModel({
      expectedOutputs: [{ type: 'text', languages: [chain.nanoLanguage] }],
      initialPrompts: [{ role: 'system', content: system }],
    })
    languageModelPool.set(key, session)
  }
  let overflow = false
  const onOverflow = () => {
    overflow = true
  }
  session.addEventListener?.('contextoverflow', onOverflow)
  const raw = await promptModel(session, task.question, {
    signal: options?.signal,
    onChunk: options?.onChunk,
  })
  session.removeEventListener?.('contextoverflow', onOverflow)
  let usage = readSessionUsage(session)
  let compacted = overflow || shouldCompactSession(usage)
  if (compacted) {
    let summarizer = summarizerPool.get(
      sessionKey(['summarize', 'tldr', 'short', chain.nanoLanguage]),
    )
    if (!summarizer) {
      try {
        summarizer = await ensureSummarizer({
          format: 'tldr',
          length: 'short',
          outputLanguage: chain.nanoLanguage,
        })
        summarizerPool.set(
          sessionKey(['summarize', 'tldr', 'short', chain.nanoLanguage]),
          summarizer,
        )
      } catch {
        summarizer = undefined
      }
    }
    const history = [task.pageDigest ?? '', task.question, raw].filter(Boolean).join('\n\n')
    const digest = summarizer
      ? await compactSessionWithSummarizer(history, summarizer, options?.signal)
      : history.slice(0, 4000)
    session.destroy?.()
    session = await ensureLanguageModel({
      expectedOutputs: [{ type: 'text', languages: [chain.nanoLanguage] }],
      initialPrompts: [
        {
          role: 'system',
          content: renderPageChatSystem({
            outputLanguage: nanoLanguageLabel(chain.nanoLanguage),
            title: '',
            digest,
          }),
        },
      ],
    })
    languageModelPool.set(key, session)
    usage = readSessionUsage(session)
    compacted = true
  }
  const text = await applyLanguageChain(raw, task.targetLanguage, translateWithLocalTranslator)
  return { text, usage, compacted }
}

async function executePickWords(
  task: Extract<AiTask, { kind: 'pickWords' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<unknown> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const prompt = renderPickWordsPrompt({
    level: task.level,
    pageLanguage: 'the page language',
    outputLanguage: nanoLanguageLabel(chain.nanoLanguage),
    text: task.text,
  })
  const session = await ensureLanguageModel({
    initialPrompts: [{ role: 'system', content: prompt.system }],
    temperature: 0.2,
  })
  const raw = await promptModel(session, prompt.user, {
    signal: options?.signal,
    responseConstraint: PICK_WORDS_V1_SCHEMA,
    onChunk: options?.onChunk,
  })
  const parsed = parsePickWordsResult(raw)
  for (const word of parsed.words) {
    word.meaning = await applyLanguageChain(
      word.meaning,
      task.targetLanguage,
      translateWithLocalTranslator,
    )
  }
  return parsed
}

async function executeDefineWord(
  task: Extract<AiTask, { kind: 'defineWord' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<unknown> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const prompt = renderDefineWordPrompt({
    outputLanguage: nanoLanguageLabel(chain.nanoLanguage),
    word: task.word,
    sentence: task.sentence,
  })
  const session = await ensureLanguageModel({
    initialPrompts: [{ role: 'system', content: prompt.system }],
  })
  const raw = await promptModel(session, prompt.user, {
    signal: options?.signal,
    onChunk: options?.onChunk,
  })
  const text = await applyLanguageChain(raw, task.targetLanguage, translateWithLocalTranslator)
  return { text }
}

async function executeTranscribe(
  task: Extract<AiTask, { kind: 'transcribe' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<unknown> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const session = await ensureLanguageModel({
    expectedInputs: [{ type: 'audio' }],
    expectedOutputs: [{ type: 'text', languages: [chain.nanoLanguage] }],
    initialPrompts: [{ role: 'system', content: TRANSCRIBE_V1_SYSTEM }],
  })
  const raw = await promptModel(session, [multimodalAudioPart(task.audio)], {
    signal: options?.signal,
    responseConstraint: TRANSCRIBE_V1_SCHEMA,
    onChunk: options?.onChunk,
  })
  const parsed = parseTranscribeResult(raw)
  const joined = parsed.segments.map((item) => item.text).join(' ')
  parsed.translation = await applyLanguageChain(
    joined,
    task.targetLanguage,
    translateWithLocalTranslator,
  )
  return parsed
}

async function executeExtract(
  task: Extract<AiTask, { kind: 'extract' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<unknown> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const session = await ensureLanguageModel({
    expectedOutputs: [{ type: 'text', languages: [chain.nanoLanguage] }],
    temperature: 0,
  })
  let entity = task.entity
  if (entity === 'auto') {
    const classify = renderExtractClassifyPrompt(task.text)
    const classified = await promptModel(session, `${classify.system}\n\n${classify.user}`, {
      signal: options?.signal,
      responseConstraint: EXTRACT_CLASSIFY_V1_SCHEMA,
    })
    entity = parseExtractClassification(classified)
  }
  if (entity === 'none') return { type: 'none' }
  const schema =
    entity === 'event'
      ? EXTRACT_EVENT_V1_SCHEMA
      : entity === 'contact'
        ? EXTRACT_CONTACT_V1_SCHEMA
        : EXTRACT_PRODUCT_V1_SCHEMA
  const prompt = renderExtractFieldsPrompt({
    entity,
    outputLanguage: nanoLanguageLabel(chain.nanoLanguage),
    text: task.text,
  })
  const raw = await promptModel(session, `${prompt.system}\n\n${prompt.user}`, {
    signal: options?.signal,
    responseConstraint: schema,
    onChunk: options?.onChunk,
  })
  const parsed = parseExtractResult(raw, entity)
  if (parsed.type === 'none') return parsed
  const fields = extractFieldsToChain(parsed.type)
  return applyLanguageChainFields(
    parsed as unknown as Record<string, unknown>,
    fields,
    task.targetLanguage,
    translateWithLocalTranslator,
  )
}

async function executeSuggestQuestions(
  task: Extract<AiTask, { kind: 'suggestQuestions' }>,
  options?: { signal?: AbortSignal; onChunk?: (delta: string) => void },
): Promise<unknown> {
  const chain = resolveLanguageChain(task.targetLanguage)
  const prompt = renderSuggestQuestionsPrompt({
    outputLanguage: nanoLanguageLabel(chain.nanoLanguage),
    title: task.title,
    digest: task.digest,
  })
  const session = await ensureLanguageModel({
    initialPrompts: [{ role: 'system', content: prompt.system }],
  })
  const raw = await promptModel(session, prompt.user, {
    signal: options?.signal,
    responseConstraint: SUGGEST_QUESTIONS_V1_SCHEMA,
    onChunk: options?.onChunk,
  })
  return parseSuggestQuestionsResult(raw)
}

export function createRequestId(): string {
  return `nt-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export type { LanguageCode }
