import { describe, expect, it } from 'vitest'
import {
  endsWithDoubleSpace,
  fallbackTranslation,
  isModifierActive,
  nextTourStep,
  normalizeWelcomeTour,
  tourStepIndex,
} from './tour'

describe('welcome tour helpers', () => {
  it('advances steps in teaching order', () => {
    expect(nextTourStep('ready')).toBe('hover')
    expect(nextTourStep('hover')).toBe('type')
    expect(nextTourStep('type')).toBe('page')
    expect(nextTourStep('page')).toBe('done')
    expect(nextTourStep('done')).toBe('done')
  })

  it('treats done as past the last lesson', () => {
    expect(tourStepIndex('ready')).toBe(0)
    expect(tourStepIndex('done')).toBe(4)
  })

  it('detects the two spaces that precede a triple-space trigger', () => {
    expect(endsWithDoubleSpace('See you tomorrow.  ')).toBe(true)
    expect(endsWithDoubleSpace('See you tomorrow. ')).toBe(false)
    expect(endsWithDoubleSpace('See you tomorrow.')).toBe(false)
  })

  it('falls back to authored zh-CN demo translations only', () => {
    expect(fallbackTranslation('See you tomorrow.', 'zh-CN')).toBe('明天见。')
    expect(fallbackTranslation('See you tomorrow.', 'ja')).toBeNull()
  })

  it('reads the configured hover modifier', () => {
    const event = { altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }
    expect(isModifierActive(event, 'alt')).toBe(true)
    expect(isModifierActive(event, 'control')).toBe(false)
  })

  it('repairs invalid stored tour state', () => {
    expect(normalizeWelcomeTour({ step: 'nope' })).toEqual({ step: 'ready', completed: false })
    expect(normalizeWelcomeTour({ step: 'page', completed: true })).toEqual({
      step: 'page',
      completed: true,
    })
  })
})
