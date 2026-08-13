import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAiCapabilities,
  isExtensionAiHost,
  shouldPersistAiCapabilityProbe,
} from '@/shared/ai/capabilities'
import { AI_CAPABILITIES_KEY } from '@/shared/settings'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('capability probe persistence', () => {
  it('does not persist isolated-world misses', () => {
    expect(isExtensionAiHost('http:')).toBe(false)
    expect(shouldPersistAiCapabilityProbe({ protocol: 'http:', hasWindowAi: false })).toBe(false)
    expect(shouldPersistAiCapabilityProbe({ protocol: 'chrome-extension:' })).toBe(true)
  })

  it('asks the extension host and never writes unavailable from isolated world', async () => {
    const set = vi.fn(async () => undefined)
    const get = vi.fn(async () => ({}))
    const sendMessage = vi.fn(async () => ({
      updatedAt: 1,
      gate: 'ready',
      summarizer: 'available',
      languageModel: 'available',
      image: 'available',
      audio: 'unavailable',
    }))
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { get, set } },
    })

    const snapshot = await getAiCapabilities(true)
    expect(snapshot.gate).toBe('ready')
    expect(sendMessage).toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(AI_CAPABILITIES_KEY).toBe('nativeTranslate.aiCapabilities')
  })
})
