import { describe, expect, it } from 'vitest'
import { resolveRegionHudKey } from '@/content/regionSelector'
import { buildSelectionOverflowActions } from '@/content/selectionAssistant'
import {
  buildExtractMenuPayload,
  resolveExtractSelectionText,
  resolveLearningModeEnabled,
} from '@/shared/commands'

describe('command and menu payloads', () => {
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
