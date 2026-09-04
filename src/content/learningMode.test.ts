import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decorateLearningMark,
  ensureLearningMarkStyles,
  initLearningMode,
  isLearningModeEnabled,
  LEARNING_MARK_STYLE_ID,
  restoreLearningMode,
  setLearningMode,
} from '@/content/learningMode'
import { LEARNING_ENABLED_KEY } from '@/shared/settings'

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

  it('restores learning mode from storage without rewriting the persisted flag', async () => {
    const storage: Record<string, unknown> = { [LEARNING_ENABLED_KEY]: true }
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
          set: vi.fn(async (payload: Record<string, unknown>) => {
            Object.assign(storage, payload)
          }),
        },
      },
    })
    document.body.innerHTML =
      '<p>A long enough paragraph for learning mode to attach observers.</p>'
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
      },
    )
    try {
      await restoreLearningMode()
      expect(isLearningModeEnabled()).toBe(true)
      expect(chrome.storage.local.set).not.toHaveBeenCalled()
      await setLearningMode(false)
      expect(isLearningModeEnabled()).toBe(false)
      expect(storage[LEARNING_ENABLED_KEY]).toBe(false)
    } finally {
      await setLearningMode(false, { persist: false })
      vi.unstubAllGlobals()
    }
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
