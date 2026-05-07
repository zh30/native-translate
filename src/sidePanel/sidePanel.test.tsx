import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MSG_TRANSLATE_TEXT } from '@/shared/messages'

const parseEpubFile = vi.fn()
const generateTranslatedEpub = vi.fn()
let autoDownloadMock = false

vi.mock('@/utils/epubParser', () => ({
  parseEpubFile: (...args: Parameters<typeof parseEpubFile>) => parseEpubFile(...args),
  generateTranslatedEpub: (...args: Parameters<typeof generateTranslatedEpub>) =>
    generateTranslatedEpub(...args),
}))

vi.mock('@/utils/i18n', () => ({
  t: (key: string) => key,
}))

vi.mock('@/utils/rtl', () => ({
  getUILocale: () => 'en',
  isRTLLanguage: () => false,
}))

vi.mock('@/utils/useChromeLocalStorage', () => ({
  useChromeLocalStorage: (_key: string, fallbackValue: unknown, _opts?: unknown) => {
    if (_key === 'fileTranslation:autoDownload') {
      return [autoDownloadMock, vi.fn(), true]
    }
    return [fallbackValue, vi.fn(), true]
  },
}))

type TranslateMessageHandler = (tabId: number, message: { type?: string }) => Promise<unknown>

function installChromeMock(options?: { onTranslateMessage?: TranslateMessageHandler }) {
  const activatedListeners: Array<(info: { tabId: number }) => void> = []
  let activeTabId = 1
  const translateMessageHandlerRef = {
    current:
      options?.onTranslateMessage ??
      (() => Promise.resolve({ ok: true, result: 'translated', detectedSource: 'en' })),
  }

  const tabsQuery = vi.fn(async () => [{ id: activeTabId }])
  const sendMessage = vi.fn(async (_tabId: number, message: { type?: string }) => {
    if (message?.type === '__PING__') return { ok: true }
    if (message?.type === MSG_TRANSLATE_TEXT) {
      return translateMessageHandlerRef.current(_tabId, message)
    }
    return { ok: true }
  })

  const emitTabActivated = (tabId: number) => {
    activeTabId = tabId
    for (const listener of activatedListeners) {
      listener({ tabId })
    }
  }

  vi.stubGlobal('chrome', {
    tabs: {
      query: tabsQuery,
      get: vi.fn(async (tabId: number) => ({
        id: tabId,
        url: 'https://example.com',
      })),
      sendMessage,
      onActivated: {
        addListener: (fn: (info: { tabId: number }) => void) => {
          activatedListeners.push(fn)
        },
        removeListener: vi.fn(),
      },
      onRemoved: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    windows: {
      onFocusChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => ({})),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    scripting: {
      executeScript: vi.fn(async () => ({})),
    },
  })

  return {
    emitTabActivated,
    sendMessage,
  }
}

function getTranslateCalls(sendMessageMock: ReturnType<typeof vi.fn>) {
  return sendMessageMock.mock.calls.filter(
    ([, message]) => (message as { type?: string } | undefined)?.type === MSG_TRANSLATE_TEXT,
  )
}

async function mountSidePanel() {
  await vi.resetModules()
  document.body.innerHTML = '<div id="root"></div>'
  await act(async () => {
    await import('./sidePanel')
  })
  await waitFor(() => {
    expect(document.getElementById('root')?.childElementCount).toBeGreaterThan(0)
  })
}

beforeEach(() => {
  autoDownloadMock = false
  parseEpubFile.mockReset()
  generateTranslatedEpub.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('sidePanel regressions', () => {
  it('continues processing the next file in queue even when auto-download is disabled', async () => {
    autoDownloadMock = false
    installChromeMock()
    parseEpubFile.mockResolvedValue({
      book: {
        metadata: {
          title: 'Source EPUB',
          author: 'Tester',
          language: 'en',
          identifier: 'id',
        },
        chapters: [],
      },
      segments: [],
    })
    generateTranslatedEpub.mockResolvedValue(new Blob(['translated']))

    await mountSidePanel()

    await waitFor(() => {
      expect(document.querySelector('input[type="file"]')).toBeInstanceOf(HTMLInputElement)
    })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const first = new File(['first'], 'first.epub', { type: 'application/epub+zip' })
    const second = new File(['second'], 'second.epub', { type: 'application/epub+zip' })
    await userEvent.upload(fileInput, [first, second])

    await waitFor(() => {
      expect(generateTranslatedEpub).toHaveBeenCalledTimes(2)
    })

    expect(parseEpubFile).toHaveBeenNthCalledWith(1, first)
    expect(parseEpubFile).toHaveBeenNthCalledWith(2, second)
  })

  it('uses updated active tab id for translation requests after tab switch', async () => {
    const chromeStub = installChromeMock()

    await mountSidePanel()

    await new Promise((resolve) => setTimeout(resolve, 0))
    chromeStub.emitTabActivated(2)

    const input = screen.getByPlaceholderText('sidepanel_input_placeholder')
    await userEvent.type(input, 'translate this sentence')

    await waitFor(() => {
      const translateCalls = chromeStub.sendMessage.mock.calls.filter(
        ([, message]) => (message as { type?: string } | undefined)?.type === MSG_TRANSLATE_TEXT,
      )
      expect(translateCalls.some(([tabId]) => tabId === 2)).toBe(true)
    })

    const translateCallsAfterSwitch = chromeStub.sendMessage.mock.calls.filter(
      ([, message]) => (message as { type?: string } | undefined)?.type === MSG_TRANSLATE_TEXT,
    )
    expect(translateCallsAfterSwitch.every(([tabId]) => tabId !== 1)).toBe(true)
  })

  it('retries content-script translation when the first message delivery fails', async () => {
    let attempts = 0
    const chromeStub = installChromeMock({
      onTranslateMessage: async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Error('Could not establish connection')
        }
        return { ok: true, result: 'translated', detectedSource: 'en' }
      },
    })

    await mountSidePanel()

    const input = screen.getByPlaceholderText('sidepanel_input_placeholder')
    fireEvent.change(input, { target: { value: 'retry this message' } })

    const output = screen.getByPlaceholderText('sidepanel_output_placeholder')

    await waitFor(() => {
      expect(output).toHaveValue('translated')
    })

    await waitFor(() => {
      expect(getTranslateCalls(chromeStub.sendMessage).length).toBe(2)
    })
  })

  it('retries translation request on updated active tab when tab switches between attempts', async () => {
    let attempts = 0
    const chromeStub = installChromeMock({
      onTranslateMessage: async (_tabId: number) => {
        attempts += 1
        if (attempts === 1) {
          setTimeout(() => {
            chromeStub.emitTabActivated(2)
          }, 5)
          throw new Error('Could not establish connection')
        }
        return { ok: true, result: 'translated', detectedSource: 'en' }
      },
    })

    await mountSidePanel()

    const input = screen.getByPlaceholderText('sidepanel_input_placeholder')
    fireEvent.change(input, { target: { value: 'retry on switched tab' } })

    const output = screen.getByPlaceholderText('sidepanel_output_placeholder')
    await waitFor(() => {
      expect(output).toHaveValue('translated')
      const translateCalls = getTranslateCalls(chromeStub.sendMessage)
      expect(translateCalls).toHaveLength(2)
      expect(translateCalls[0]?.[0]).toBe(1)
      expect(translateCalls[1]?.[0]).toBe(2)
    })
  })
})
