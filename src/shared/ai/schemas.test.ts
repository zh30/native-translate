import { describe, expect, it } from 'vitest'
import {
  parseExplainResult,
  parseExtractClassification,
  parseExtractResult,
  parseOcrTranslateResult,
  parsePickWordsResult,
  parseProofreadResult,
  parseSuggestQuestionsResult,
  parseTranscribeResult,
  stripFence,
} from '@/shared/ai/schemas'

describe('stripFence', () => {
  it('unwraps markdown fences and leaves bare JSON alone', () => {
    expect(stripFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripFence('```\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripFence('{"a":1}')).toBe('{"a":1}')
  })
})

describe('schema parsers', () => {
  it('parses a valid EXPLAIN_V1 payload', () => {
    const result = parseExplainResult(`\`\`\`json
{
  "translation": "Good luck",
  "explanation": "Theatre idiom",
  "idioms": [{"phrase":"break a leg","meaning":"good luck"}],
  "grammar": ["imperative"]
}
\`\`\``)
    expect(result.translation).toBe('Good luck')
    expect(result.idioms?.[0]?.phrase).toBe('break a leg')
  })

  it('parses PROOFREAD, OCR, PICK_WORDS, EXTRACT, TRANSCRIBE, SUGGEST_QUESTIONS samples', () => {
    expect(
      parseProofreadResult(
        '{"corrected":"We are ready.","issues":[{"span":"We is","type":"grammar","note":"subject-verb"}]}',
      ),
    ).toEqual({
      corrected: 'We are ready.',
      issues: [{ span: 'We is', type: 'grammar', note: 'subject-verb' }],
    })

    expect(
      parseOcrTranslateResult('{"items":[{"source":"Taxi","translation":"出租车"}]}').items[0],
    ).toEqual({ source: 'Taxi', translation: '出租车' })

    expect(
      parsePickWordsResult(
        '{"words":[{"word":"ephemeral","lemma":"ephemeral","level":"C1","meaning":"lasting a short time"}]}',
      ).words[0].lemma,
    ).toBe('ephemeral')

    expect(parseExtractClassification('{"type":"event"}')).toBe('event')
    expect(parseExtractResult('{"type":"none"}')).toEqual({ type: 'none' })
    expect(
      parseExtractResult(
        '{"type":"contact","name":"Ada","email":"ada@example.com","phone":"+1 555"}',
        'contact',
      ),
    ).toMatchObject({ type: 'contact', name: 'Ada', email: 'ada@example.com' })

    expect(
      parseTranscribeResult('{"segments":[{"text":"hello"},{"text":"world"}]}').segments,
    ).toHaveLength(2)
    expect(
      parseSuggestQuestionsResult(
        '{"questions":["What is the thesis?","Who is cited?","What happens next?"]}',
      ).questions,
    ).toHaveLength(3)
  })

  it('recovers JSON buried in malformed prose', () => {
    const parsed = parseExplainResult('Sure. {"translation":"Hi","explanation":"Greeting"} thanks')
    expect(parsed.translation).toBe('Hi')
  })
})
