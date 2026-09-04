import { describe, expect, it } from 'vitest'
import { resolveRegionHudKey } from '@/content/regionSelector'
import { buildSelectionOverflowActions } from '@/content/selectionAssistant'
import {
  buildExtractMenuPayload,
  buildTranslatePageMessage,
  resolveExtractSelectionText,
  resolveLearningModeEnabled,
  resolveTranslatePageTarget,
} from '@/shared/commands'
import { DEFAULT_TARGET_LANGUAGE } from '@/shared/languages'
import { MSG_TRANSLATE_PAGE } from '@/shared/messages'

describe('command and menu payloads', () => {
  it('uses the stored target language for full-page translation', () => {
    expect(resolveTranslatePageTarget(undefined)).toBe(DEFAULT_TARGET_LANGUAGE)
    expect(resolveTranslatePageTarget({})).toBe(DEFAULT_TARGET_LANGUAGE)
    expect(resolveTranslatePageTarget({ targetLanguage: 'en' })).toBe('en')
    expect(buildTranslatePageMessage('ja')).toEqual({
      type: MSG_TRANSLATE_PAGE,
      payload: { targetLanguage: 'ja' },
    })
  })

  it('toggles learning instead of always enabling', () => {
    expect(resolveLearningModeEnabled({ toggle: true }, false)).toBe(true)
    expect(resolveLearningModeEnabled({ toggle: true }, true)).toBe(false)
    expect(resolveLearningModeEnabled({ enabled: true }, false)).toBe(true)
    expect(resolveLearningModeEnabled({ enabled: false }, true)).toBe(false)
  })

  it('keeps context-menu selection text for extract', () => {
    const payload = buildExtractMenuPayload({ selectionText: '  Meetup Friday  ' })
    expect(payload).toEqual({ extractSelection: true, selectionText: 'Meetup Friday' })
    expect(resolveExtractSelectionText(payload)).toBe('Meetup Friday')
    expect(resolveExtractSelectionText({ extractSelection: true })).toBe('')
  })
})

describe('selection overflow and HUD keys', () => {
  it('exposes copy, vocab, and settings in the overflow menu', () => {
    expect(buildSelectionOverflowActions()).toEqual(['copy', 'vocab', 'settings'])
  })

  it('keeps Enter/Esc after unrelated keys', () => {
    expect(resolveRegionHudKey('a')).toBe('ignore')
    expect(resolveRegionHudKey('Enter')).toBe('confirm')
    expect(resolveRegionHudKey('Escape')).toBe('cancel')
  })
})
