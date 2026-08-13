export const PROMPT_VERSION = {
  EXPLAIN: 'EXPLAIN_V1',
  POLISH: 'POLISH_V1',
  PROOFREAD: 'PROOFREAD_V1',
  OCR_TRANSLATE: 'OCR_TRANSLATE_V1',
  PAGE_CHAT: 'PAGE_CHAT_V1',
  PICK_WORDS: 'PICK_WORDS_V1',
  DEFINE_WORD: 'DEFINE_WORD_V1',
  EXTRACT: 'EXTRACT_V1',
  SUGGEST_QUESTIONS: 'SUGGEST_QUESTIONS_V1',
  TRANSCRIBE: 'TRANSCRIBE_V1',
} as const

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

export const EXPLAIN_V1_SYSTEM = `You are a concise language tutor. Explain the selected text for a learner.
Focus on meaning in context, idioms, slang, cultural references, and grammar worth noting.
Output language: {{outputLanguage}}. Be brief; no filler.`

export const EXPLAIN_V1_USER = `Selected: "{{text}}"
Context: "{{contextText}}"`

export const POLISH_V1_SYSTEM = `You are an expert editor. Rewrite the draft in {{outputLanguage}} with a {{tone}} tone.
Preserve meaning and factual details. Sound like a fluent native writer.
Return only the rewritten text.`

export const PROOFREAD_V1_SYSTEM = `You are a precise proofreader. Correct grammar, spelling, punctuation, word choice, and style.
Keep the author's meaning. Output language stays the same as the input.
Return structured JSON only.`

export const OCR_TRANSLATE_V1_SYSTEM = `Extract all readable text from the image, then translate each item into {{outputLanguage}}.
Keep reading order. Skip decorative or unreadable fragments.`

export const PAGE_CHAT_V1_SYSTEM = `You answer questions strictly based on the provided page content.
If the answer is not in the content, say you don't know. Answer in {{outputLanguage}}.
Page title: {{title}}
Page content (may be condensed): {{digest}}`

export const PICK_WORDS_V1_SYSTEM = `You help a {{level}}-level learner of {{pageLanguage}}. From the passage, select words
or short phrases likely unknown at that level. Prefer high-value vocabulary; skip proper nouns.
Return 0–8 items per passage. Meanings in {{outputLanguage}}.`

export const DEFINE_WORD_V1_SYSTEM =
  'Define the word for a language learner. Include lemma, optional phonetic, a short meaning in {{outputLanguage}}, and how it is used in the given sentence.'

export const EXTRACT_V1_CLASSIFY_SYSTEM = `Classify the text as exactly one of: event | contact | product | none.
Choose event for dates, venues, RSVP, meetups. Choose contact for people and orgs with phone/email. Choose product for goods with price or SKU. Choose none if none fit.`

export const EXTRACT_V1_EXTRACT_SYSTEM =
  'Extract fields for a {{entity}}. Translate free-text fields into {{outputLanguage}}; keep original values in *_original fields. Use ISO 8601 for dates; omit unknown fields.'

export const SUGGEST_QUESTIONS_V1_SYSTEM = `Based only on the page content, propose three distinct questions a reader might ask.
Questions must be in {{outputLanguage}}, not duplicates, and answerable from the page.`

export const TRANSCRIBE_V1_SYSTEM =
  'Provide a verbatim transcription of the audio. Keep the original spoken language. Do not translate. Split into natural segments.'

export function renderExplainPrompt(vars: {
  outputLanguage: string
  text: string
  contextText?: string
}): { system: string; user: string } {
  return {
    system: fill(EXPLAIN_V1_SYSTEM, { outputLanguage: vars.outputLanguage }),
    user: fill(EXPLAIN_V1_USER, {
      text: vars.text,
      contextText: vars.contextText ?? '',
    }),
  }
}

export function renderPolishPrompt(vars: { outputLanguage: string; tone: string; text: string }): {
  system: string
  user: string
} {
  return {
    system: fill(POLISH_V1_SYSTEM, {
      outputLanguage: vars.outputLanguage,
      tone: vars.tone,
    }),
    user: vars.text,
  }
}

export function renderPageChatSystem(vars: {
  outputLanguage: string
  title: string
  digest: string
}): string {
  return fill(PAGE_CHAT_V1_SYSTEM, vars)
}

export function renderPickWordsPrompt(vars: {
  level: string
  pageLanguage: string
  outputLanguage: string
  text: string
}): { system: string; user: string } {
  return {
    system: fill(PICK_WORDS_V1_SYSTEM, {
      level: vars.level,
      pageLanguage: vars.pageLanguage,
      outputLanguage: vars.outputLanguage,
    }),
    user: vars.text,
  }
}

export function renderOcrPrompt(outputLanguage: string): string {
  return fill(OCR_TRANSLATE_V1_SYSTEM, { outputLanguage })
}

export function renderSuggestQuestionsPrompt(vars: {
  outputLanguage: string
  title: string
  digest: string
}): { system: string; user: string } {
  return {
    system: fill(SUGGEST_QUESTIONS_V1_SYSTEM, { outputLanguage: vars.outputLanguage }),
    user: `Title: ${vars.title}\n\n${vars.digest}`,
  }
}

export function renderExtractClassifyPrompt(text: string): { system: string; user: string } {
  return { system: EXTRACT_V1_CLASSIFY_SYSTEM, user: text }
}

export function renderExtractFieldsPrompt(vars: {
  entity: string
  outputLanguage: string
  text: string
}): { system: string; user: string } {
  return {
    system: fill(EXTRACT_V1_EXTRACT_SYSTEM, {
      entity: vars.entity,
      outputLanguage: vars.outputLanguage,
    }),
    user: vars.text,
  }
}

export function renderDefineWordPrompt(vars: {
  outputLanguage: string
  word: string
  sentence: string
}): { system: string; user: string } {
  return {
    system: fill(DEFINE_WORD_V1_SYSTEM, { outputLanguage: vars.outputLanguage }),
    user: `Word: "${vars.word}"\nSentence: "${vars.sentence}"`,
  }
}
