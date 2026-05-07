import { describe, expect, it } from 'vitest'
import { isRTLLanguage } from './rtl'

describe('rtl utility', () => {
  it('detects RTL locale tags with underscores', () => {
    expect(isRTLLanguage('ar_EG')).toBe(true)
    expect(isRTLLanguage('fa_IR')).toBe(true)
    expect(isRTLLanguage('ur_PK')).toBe(true)
  })

  it('does not treat unrelated locales as RTL', () => {
    expect(isRTLLanguage('en_US')).toBe(false)
    expect(isRTLLanguage('zh_Hant')).toBe(false)
  })
})
