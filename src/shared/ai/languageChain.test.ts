import { describe, expect, it, vi } from 'vitest'
import {
  applyLanguageChain,
  NANO_OUTPUT_LANGUAGES,
  resolveLanguageChain,
} from '@/shared/ai/languageChain'

describe('resolveLanguageChain', () => {
  it.each(NANO_OUTPUT_LANGUAGES)('emits %s directly when it is a Nano language', (code) => {
    const decision = resolveLanguageChain(code)
    expect(decision.nanoLanguage).toBe(code)
    expect(decision.needsTranslation).toBe(false)
    expect(decision.translatorTarget).toBeNull()
  })

  it('uses English then Translator for Chinese targets', () => {
    const decision = resolveLanguageChain('zh-CN')
    expect(decision.nanoLanguage).toBe('en')
    expect(decision.needsTranslation).toBe(true)
    expect(decision.translatorSource).toBe('en')
    expect(decision.translatorTarget).toBe('zh-CN')
  })

  it('uses English then Translator for Korean and Arabic', () => {
    expect(resolveLanguageChain('ko')).toMatchObject({
      nanoLanguage: 'en',
      needsTranslation: true,
      translatorTarget: 'ko',
    })
    expect(resolveLanguageChain('ar')).toMatchObject({
      nanoLanguage: 'en',
      needsTranslation: true,
      translatorTarget: 'ar',
    })
  })
})

describe('applyLanguageChain', () => {
  it('does not call translator for Nano-supported targets', async () => {
    const translate = vi.fn(async (text: string) => `TR:${text}`)
    await expect(applyLanguageChain('hello', 'ja', translate)).resolves.toBe('hello')
    expect(translate).not.toHaveBeenCalled()
  })

  it('translates English Nano output into the user target', async () => {
    const translate = vi.fn(async (text: string, source: string, target: string) => {
      expect(source).toBe('en')
      expect(target).toBe('zh-CN')
      return `中文:${text}`
    })
    await expect(applyLanguageChain('Key point', 'zh-CN', translate)).resolves.toBe(
      '中文:Key point',
    )
    expect(translate).toHaveBeenCalledTimes(1)
  })
})
