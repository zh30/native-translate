import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getRegisteredInPageTranslator,
  registerInPageTranslator,
  translateInPage,
} from '@/content/inPageTranslate'

afterEach(() => {
  registerInPageTranslator(null)
  vi.unstubAllGlobals()
})

describe('translateInPage', () => {
  it('uses the registered in-world translator and never chrome.runtime.sendMessage', async () => {
    const sendMessage = vi.fn()
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    const translate = vi.fn(async (input: { text: string; targetLanguage: string }) => {
      expect(input.text).toBe('break a leg')
      expect(input.targetLanguage).toBe('zh-CN')
      return '祝你好运'
    })
    registerInPageTranslator(translate)

    await expect(
      translateInPage({ text: 'break a leg', sourceLanguage: 'auto', targetLanguage: 'zh-CN' }),
    ).resolves.toBe('祝你好运')

    expect(translate).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalled()
    expect(getRegisteredInPageTranslator()).toBe(translate)
  })

  it('throws when no translator is registered', async () => {
    registerInPageTranslator(null)
    await expect(translateInPage({ text: 'hi', targetLanguage: 'en' })).rejects.toThrow(
      /not registered/,
    )
  })
})
