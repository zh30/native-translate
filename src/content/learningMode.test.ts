import { afterEach, describe, expect, it } from 'vitest'
import {
  decorateLearningMark,
  ensureLearningMarkStyles,
  initLearningMode,
  LEARNING_MARK_STYLE_ID,
} from '@/content/learningMode'

afterEach(() => {
  document.getElementById(LEARNING_MARK_STYLE_ID)?.remove()
  document.body.innerHTML = ''
})

describe('learning mark styles', () => {
  it('injects a page-level stylesheet and inline decoration so marks are visible outside the overlay shadow', () => {
    const style = ensureLearningMarkStyles(document)
    expect(style.id).toBe(LEARNING_MARK_STYLE_ID)
    expect(document.getElementById(LEARNING_MARK_STYLE_ID)?.textContent).toMatch(/nt-word/)
    expect(document.getElementById(LEARNING_MARK_STYLE_ID)?.textContent).toMatch(/border-bottom/)

    const mark = decorateLearningMark(document.createElement('nt-word'))
    document.body.appendChild(mark)
    expect(mark.style.borderBottom).toMatch(/dashed/)
    expect(mark.style.background).toBeTruthy()
    expect(mark.className).toBe('nt-word')
  })

  it('does not throw when customElements is null like chrome://newtab/ frames', () => {
    const original = globalThis.customElements
    Object.defineProperty(globalThis, 'customElements', { configurable: true, value: null })
    try {
      expect(() => initLearningMode()).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, 'customElements', {
        configurable: true,
        value: original,
      })
    }
  })
})
