import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAiTask, streamAiTask } from '@/shared/ai/client'
import { AiTaskError } from '@/shared/ai/types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('runAiTask routing', () => {
  it('does not execute LanguageModel in an isolated page world even if the constructor exists', async () => {
    const prompt = vi.fn(async () => '{"corrected":"Hi","issues":[]}')
    vi.stubGlobal('LanguageModel', {
      availability: async () => 'available',
      create: async () => ({ prompt }),
    })
    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:', href: 'https://example.com' },
      configurable: true,
    })
    const sendMessage = vi.fn(async () => ({
      ok: true,
      result: { corrected: 'Hi', issues: [] },
    }))
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    await runAiTask({ kind: 'proofread', text: 'Hi' })
    expect(prompt).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalled()
  })
})

describe('streamAiTask disconnect', () => {
  it('rejects when the port disconnects before done', async () => {
    const listeners: Array<(...args: unknown[]) => void> = []
    const port = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: { addListener: vi.fn() },
      onDisconnect: {
        addListener: (fn: () => void) => {
          listeners.push(fn)
        },
      },
    }
    vi.stubGlobal('chrome', {
      runtime: {
        connect: () => port,
      },
    })
    Object.defineProperty(window, 'location', {
      value: { protocol: 'http:', href: 'https://example.com' },
      configurable: true,
    })

    const pending = streamAiTask(
      { kind: 'explain', text: 'hi', targetLanguage: 'zh-CN' },
      () => undefined,
    )
    listeners[0]?.()
    await expect(pending).rejects.toBeInstanceOf(AiTaskError)
    await expect(pending).rejects.toMatchObject({ code: 'internal' })
  })
})
