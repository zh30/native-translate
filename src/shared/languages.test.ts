import { describe, expect, it } from 'vitest'
import {
  canonicalizeLanguageForTranslation,
  isSameLanguageForTranslation,
  refineGenericChineseLanguage,
} from './languages'

describe('language translation matching', () => {
  it('treats Traditional and Simplified Chinese variants as different translation targets', () => {
    expect(isSameLanguageForTranslation('zh-TW', 'zh-CN')).toBe(false)
    expect(isSameLanguageForTranslation('zh-Hant-CN', 'zh-TW')).toBe(true)
    expect(isSameLanguageForTranslation('zh-Hans-TW', 'zh-CN')).toBe(true)
  })

  it('treats generic Chinese as Simplified Chinese when no variant hint is available', () => {
    expect(isSameLanguageForTranslation('zh', 'zh-CN')).toBe(true)
    expect(isSameLanguageForTranslation('zh', 'zh-TW')).toBe(false)
  })

  it('refines generic Chinese using script or region hints', () => {
    expect(refineGenericChineseLanguage('zh', 'zh-Hant')).toBe('zh-TW')
    expect(refineGenericChineseLanguage('zh', 'zh-Hans-TW')).toBe('zh-CN')
    expect(refineGenericChineseLanguage('zh', 'zh-HK')).toBe('zh-TW')
    expect(refineGenericChineseLanguage('zh', 'zh_Hant')).toBe('zh-TW')
    expect(refineGenericChineseLanguage('zh', 'zh_CN')).toBe('zh-CN')
    expect(refineGenericChineseLanguage('zh', 'en')).toBe('zh')
    expect(refineGenericChineseLanguage('zh-TW', 'zh-CN')).toBe('zh-TW')
  })

  it('matches Chinese variants that use underscores instead of hyphens', () => {
    expect(isSameLanguageForTranslation('zh_Hant', 'zh-TW')).toBe(true)
    expect(isSameLanguageForTranslation('zh_Hant', 'zh-CN')).toBe(false)
    expect(isSameLanguageForTranslation('zh_Hans_TW', 'zh-CN')).toBe(true)
  })

  it('canonicalizes Chinese language tags before passing them to translators', () => {
    expect(canonicalizeLanguageForTranslation('zh_Hant')).toBe('zh-TW')
    expect(canonicalizeLanguageForTranslation('zh-Hans-TW')).toBe('zh-CN')
    expect(canonicalizeLanguageForTranslation('zh_HK')).toBe('zh-TW')
    expect(canonicalizeLanguageForTranslation('en')).toBe('en')
  })
})
