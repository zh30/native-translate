import { describe, expect, it, vi } from 'vitest'
import { resolveRegionHudKey } from '@/content/regionSelector'
import { buildSelectionOverflowActions } from '@/content/selectionAssistant'
import {
  buildExtractMenuPayload,
  buildTranslatePageMessage,
  classifyTabSendFailure,
  deliverTabMessage,
  openExtensionPopup,
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
    expect(resolveLearningModeEnabled({ query: true }, true)).toBe(true)
    expect(resolveLearningModeEnabled({ query: true }, false)).toBe(false)
  })

  it('retries tab messages only when the content script is missing', async () => {
    expect(
      classifyTabSendFailure(
        new Error('Could not establish connection. Receiving end does not exist.'),
      ),
    ).toBe('missing-receiver')
    expect(
      classifyTabSendFailure(new Error('The message port closed before a response was received.')),
    ).toBe('no-response')
    expect(
      classifyTabSendFailure(
        new Error(
          'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
        ),
      ),
    ).toBe('no-response')
    expect(classifyTabSendFailure(new Error('This page is not scriptable'))).toBe('other')

    const retry = vi.fn(async () => 'retried')
    await expect(
      deliverTabMessage(async () => {
        throw new Error('The message port closed before a response was received.')
      }, retry),
    ).resolves.toBeUndefined()
    expect(retry).not.toHaveBeenCalled()

    await expect(
      deliverTabMessage(async () => {
        throw new Error('Could not establish connection. Receiving end does not exist.')
      }, retry),
    ).resolves.toBe('retried')
    expect(retry).toHaveBeenCalledTimes(1)

    await expect(
      deliverTabMessage(async () => {
        throw new Error('This page is not scriptable')
      }, retry),
    ).rejects.toThrow('This page is not scriptable')
    expect(retry).toHaveBeenCalledTimes(1)

    await expect(deliverTabMessage(async () => 'ok', retry)).resolves.toBe('ok')
  })

  it('opens a popup window when action.openPopup is unavailable', async () => {
    const openPopupWindow = vi.fn(async () => undefined)
    await expect(openExtensionPopup({ openPopupWindow })).resolves.toBe('window')
    expect(openPopupWindow).toHaveBeenCalledTimes(1)

    const openPopup = vi.fn<() => Promise<void>>(async () => {
      throw new Error('openPopup requires a user gesture')
    })
    await expect(openExtensionPopup({ openPopup, openPopupWindow })).resolves.toBe('window')
    expect(openPopupWindow).toHaveBeenCalledTimes(2)

    openPopup.mockImplementation(async () => {})
    await expect(openExtensionPopup({ openPopup, openPopupWindow })).resolves.toBe('popup')
    expect(openPopupWindow).toHaveBeenCalledTimes(2)
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
