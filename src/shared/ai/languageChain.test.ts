import { describe, expect, it, vi } from 'vitest'
import {
  applyLanguageChain,
  chatOutputNeedsTranslation,
  NANO_OUTPUT_LANGUAGES,
  resolveChatDisplayText,
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

describe('chat stream finalization', () => {
  it('does not re-translate CJK chat that Nano already wrote in the target script', () => {
    const chinese = '这篇页面介绍的是设备本地翻译，不会把正文送到云端。'
    expect(chatOutputNeedsTranslation(chinese, 'zh-CN')).toBe(false)
    expect(chatOutputNeedsTranslation('The page is about on-device translation.', 'zh-CN')).toBe(
      true,
    )
    expect(chatOutputNeedsTranslation('The page is about on-device translation.', 'ja')).toBe(false)
  })

  it('keeps the streamed answer when a post-stream Translator pass would clobber CJK', () => {
    const streamed = '这篇页面介绍的是设备本地翻译，不会把正文送到云端。'
    const finalized = 'This page 这篇 页 面 介 绍 的是 local translation 云端'
    expect(resolveChatDisplayText({ streamed, finalized, targetLanguage: 'zh-CN' })).toBe(streamed)
  })

  it('uses the finalized translation when the stream was English for a Chinese target', () => {
    expect(
      resolveChatDisplayText({
        streamed: 'The page is about on-device translation.',
        finalized: '该页面介绍的是设备本地翻译。',
        targetLanguage: 'zh-CN',
      }),
    ).toBe('该页面介绍的是设备本地翻译。')
  })

  it('keeps the stream when the finalized payload looks corrupt', () => {
    expect(
      resolveChatDisplayText({
        streamed: 'The page is about on-device translation.',
        finalized: 'Hello [object Object]',
        targetLanguage: 'zh-CN',
      }),
    ).toBe('The page is about on-device translation.')
  })
})
