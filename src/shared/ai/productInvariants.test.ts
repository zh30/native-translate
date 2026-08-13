import { describe, expect, it, vi } from 'vitest'
import { applyLanguageChainFields } from '@/shared/ai/languageChain'
import {
  canExecuteAiLocally,
  digestChapterFromSummarize,
  extractFieldsToChain,
  frameHasMatchingImage,
  hasCustomElementsRegistry,
  hudMustUnbindKeydown,
  isAiAbortError,
  isTopContentFrame,
  learningMutexOnPageTranslate,
  nextLearningProcessed,
  resolveOverlayRect,
  selectionAfterChange,
  selectionModifierPressed,
  shouldAcceptOffscreenMessage,
  shouldHandleContentBroadcast,
  shouldInitPageAssistants,
  summarizerTypeForFormat,
  writingSurface,
} from '@/shared/ai/productInvariants'

describe('summarizerTypeForFormat', () => {
  it.each(['tldr', 'teaser', 'key-points', 'headline'] as const)(
    'passes %s through without collapsing to tldr',
    (format) => {
      expect(summarizerTypeForFormat(format)).toBe(format)
    },
  )
})

describe('extractFieldsToChain', () => {
  it('names free-text fields that must go through applyLanguageChainFields', () => {
    expect(extractFieldsToChain('event')).toEqual(['title', 'location', 'notes'])
    expect(extractFieldsToChain('contact')).toEqual(['name', 'org', 'address'])
    expect(extractFieldsToChain('product')).toEqual(['name', 'specs', 'highlights'])
    expect(extractFieldsToChain('none')).toEqual([])
  })

  it('chains those extract fields into zh-CN via applyLanguageChainFields', async () => {
    const translate = vi.fn(async (text: string) => `译:${text}`)
    const fields = extractFieldsToChain('event')
    const payload = {
      type: 'event',
      title: 'Meetup',
      location: 'Tokyo',
      notes: 'Bring laptop',
      start: '2026-08-13',
    }
    const result = await applyLanguageChainFields(
      payload,
      fields as Array<keyof typeof payload>,
      'zh-CN',
      translate,
    )
    expect(result.title).toBe('译:Meetup')
    expect(result.location).toBe('译:Tokyo')
    expect(result.notes).toBe('译:Bring laptop')
    expect(result.start).toBe('2026-08-13')
  })
})

describe('digestChapterFromSummarize', () => {
  it('always sets bilingual points and pointsOriginal from text/sourceText', () => {
    const chapter = digestChapterFromSummarize(
      { text: '- 本地推理\n- 无云端', sourceText: '- On-device\n- No cloud' },
      { id: 'c1', title: 'One' },
    )
    expect(chapter.points).toEqual(['本地推理', '无云端'])
    expect(chapter.pointsOriginal).toEqual(['On-device', 'No cloud'])
  })
})

describe('nextLearningProcessed', () => {
  it('replaces the WeakSet on disable so re-enable can process blocks again', () => {
    const first = nextLearningProcessed('disable')
    const el = {} as Element
    first.add(el)
    expect(first.has(el)).toBe(true)
    const second = nextLearningProcessed('disable')
    expect(second.has(el)).toBe(false)
    expect(second).not.toBe(first)
  })
})

describe('learningMutexOnPageTranslate', () => {
  it('disables learning when full-page translate starts', () => {
    expect(learningMutexOnPageTranslate()).toBe('disable')
  })
})

describe('writingSurface', () => {
  it('hides polish when writing is off or Nano is unavailable', () => {
    expect(writingSurface('ready', false)).toBe('hidden')
    expect(writingSurface('unavailable', true)).toBe('translate-only')
    expect(writingSurface('ready', true)).toBe('full')
  })
})

describe('selectionAfterChange', () => {
  it('keeps a pinned card even when the selection is still live', () => {
    expect(selectionAfterChange({ cardPinned: true, selectionLen: 12, minChars: 2 })).toBe(
      'keep-card',
    )
    expect(selectionAfterChange({ cardPinned: false, selectionLen: 12, minChars: 2 })).toBe(
      'show-toolbar',
    )
    expect(selectionAfterChange({ cardPinned: false, selectionLen: 1, minChars: 2 })).toBe('close')
    expect(
      selectionAfterChange({
        cardPinned: false,
        selectionLen: 12,
        minChars: 2,
        toolbarVisible: true,
        sameSelection: true,
      }),
    ).toBe('keep-toolbar')
    expect(
      selectionAfterChange({
        cardPinned: false,
        selectionLen: 0,
        minChars: 2,
        toolbarVisible: true,
      }),
    ).toBe('keep-toolbar')
  })
})

describe('hudMustUnbindKeydown', () => {
  it.each(['enter', 'esc', 'mouseup', 'remove'] as const)('unbinds on %s', (exit) => {
    expect(hudMustUnbindKeydown(exit)).toBe(true)
  })
})

describe('shouldHandleContentBroadcast', () => {
  it('lets only the top frame answer page-wide tab messages', () => {
    expect(shouldHandleContentBroadcast({ isTopFrame: false, message: 'page-content' })).toBe(false)
    expect(shouldHandleContentBroadcast({ isTopFrame: true, message: 'page-content' })).toBe(true)
    expect(shouldHandleContentBroadcast({ isTopFrame: false, message: 'translate-text' })).toBe(
      false,
    )
    expect(shouldHandleContentBroadcast({ isTopFrame: false, message: 'learning' })).toBe(false)
    expect(shouldHandleContentBroadcast({ isTopFrame: false, message: 'extract' })).toBe(false)
  })

  it('gives screenshot image menus to the frame that owns the image', () => {
    expect(
      shouldHandleContentBroadcast({
        isTopFrame: false,
        message: 'region-select',
        hasMatchingImage: true,
        hasSrcUrl: true,
      }),
    ).toBe(true)
    expect(
      shouldHandleContentBroadcast({
        isTopFrame: true,
        message: 'region-select',
        hasMatchingImage: false,
        hasSrcUrl: true,
      }),
    ).toBe(false)
    expect(
      shouldHandleContentBroadcast({
        isTopFrame: true,
        message: 'region-select',
        hasSrcUrl: false,
      }),
    ).toBe(true)
  })
})

describe('frameHasMatchingImage / isTopContentFrame', () => {
  it('matches src or currentSrc and compares window === top', () => {
    expect(frameHasMatchingImage([{ src: 'https://a/x.png' }], 'https://a/x.png')).toBe(true)
    expect(frameHasMatchingImage([{ currentSrc: 'https://a/x.png' }], 'https://a/x.png')).toBe(true)
    expect(frameHasMatchingImage([{ src: 'https://a/x.png' }], 'https://b/y.png')).toBe(false)
    const top = { top: undefined as unknown }
    top.top = top
    const iframe = { top }
    expect(isTopContentFrame(top)).toBe(true)
    expect(isTopContentFrame(iframe)).toBe(false)
  })
})

describe('shouldInitPageAssistants', () => {
  it('skips chrome new-tab documents and frames without customElements.get', () => {
    expect(hasCustomElementsRegistry(null)).toBe(false)
    expect(hasCustomElementsRegistry({ get: () => undefined })).toBe(true)
    expect(shouldInitPageAssistants({ protocol: 'chrome:' })).toBe(false)
    expect(shouldInitPageAssistants({ protocol: 'chrome-untrusted:' })).toBe(false)
    expect(shouldInitPageAssistants({ protocol: 'https:', customElements: null })).toBe(false)
    expect(
      shouldInitPageAssistants({ protocol: 'https:', customElements: { get: () => undefined } }),
    ).toBe(true)
  })
})

describe('canExecuteAiLocally / shouldAcceptOffscreenMessage', () => {
  it('keeps Prompt API off the isolated page world', () => {
    expect(canExecuteAiLocally('https:')).toBe(false)
    expect(canExecuteAiLocally('http:')).toBe(false)
    expect(canExecuteAiLocally('chrome-extension:')).toBe(true)
    expect(shouldAcceptOffscreenMessage(undefined)).toBe(false)
    expect(shouldAcceptOffscreenMessage('offscreen')).toBe(true)
  })
})

describe('isAiAbortError', () => {
  it('treats DOM AbortError and AiTask aborted as stale', () => {
    expect(isAiAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
    expect(isAiAbortError({ code: 'aborted' })).toBe(true)
    expect(isAiAbortError(new Error('nope'))).toBe(false)
  })
})

describe('selectionModifierPressed', () => {
  it('uses the configured modifier only', () => {
    expect(selectionModifierPressed({ altKey: true }, 'alt')).toBe(true)
    expect(selectionModifierPressed({ ctrlKey: true }, 'alt')).toBe(false)
    expect(selectionModifierPressed({ ctrlKey: true }, 'control')).toBe(true)
    expect(selectionModifierPressed({ metaKey: true }, 'control')).toBe(true)
    expect(selectionModifierPressed({ shiftKey: true }, 'shift')).toBe(true)
  })
})

describe('resolveOverlayRect', () => {
  it('keeps the last selection box after the click collapses the range', () => {
    expect(
      resolveOverlayRect({
        live: { x: 0, y: 0, width: 0, height: 0 },
        remembered: { x: 40, y: 80, width: 120, height: 16 },
      }),
    ).toEqual({ x: 40, y: 80, width: 120, height: 16 })
    expect(resolveOverlayRect({ live: { x: 1, y: 2, width: 10, height: 8 } })).toEqual({
      x: 1,
      y: 2,
      width: 10,
      height: 8,
    })
    expect(resolveOverlayRect({})).toEqual({ x: 16, y: 16, width: 1, height: 1 })
  })
})
