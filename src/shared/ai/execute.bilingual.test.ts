import { describe, expect, it, vi } from 'vitest'
import { finalizeSummarizeOutput } from '@/shared/ai/execute'

describe('finalizeSummarizeOutput', () => {
  it('keeps Nano English as sourceText when the user target needs Translator', async () => {
    vi.spyOn(
      await import('@/shared/ai/localTranslator'),
      'translateWithLocalTranslator',
    ).mockImplementation(async (text, source, target) => {
      expect(source).toBe('en')
      expect(target).toBe('zh-CN')
      return `译:${text}`
    })
    const result = await finalizeSummarizeOutput('- Ships on-device\n- No cloud', 'zh-CN')
    expect(result.sourceText).toBe('- Ships on-device\n- No cloud')
    expect(result.text).toBe('译:- Ships on-device\n- No cloud')
    expect(result.text).not.toBe(result.sourceText)
  })

  it('does not invent a second English pass for Nano-supported targets', async () => {
    const result = await finalizeSummarizeOutput('Key point one', 'ja')
    expect(result.text).toBe('Key point one')
    expect(result.sourceText).toBe('Key point one')
  })
})
