import * as React from 'react'
import type { GateState } from '@/shared/ai/types'
import { MSG_AI_CAPABILITIES } from '@/shared/messages'
import { AI_CAPABILITIES_KEY } from '@/shared/settings'

export type AvailabilityValue =
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available'
  | 'unknown'

export interface AiCapabilitiesSnapshot {
  updatedAt: number
  gate: GateState
  progress?: number
  reason?: 'hardware' | 'os' | 'unknown'
  summarizer: AvailabilityValue
  languageModel: AvailabilityValue
  image: AvailabilityValue
  audio: AvailabilityValue
}

export const CAPABILITIES_TTL_MS = 24 * 60 * 60 * 1000

const EMPTY_SNAPSHOT: AiCapabilitiesSnapshot = {
  updatedAt: 0,
  gate: 'unknown',
  summarizer: 'unknown',
  languageModel: 'unknown',
  image: 'unknown',
  audio: 'unknown',
}

type AvailabilityApi = {
  availability?: (options?: unknown) => Promise<string>
}

function mapAvailability(value: unknown): AvailabilityValue {
  if (value === 'available' || value === 'readily') return 'available'
  if (value === 'downloadable' || value === 'after-download') return 'downloadable'
  if (value === 'downloading') return 'downloading'
  if (value === 'unavailable' || value === 'no') return 'unavailable'
  return 'unknown'
}

function rankAvailability(value: AvailabilityValue): number {
  switch (value) {
    case 'available':
      return 4
    case 'downloading':
      return 3
    case 'downloadable':
      return 2
    case 'unknown':
      return 1
    default:
      return 0
  }
}

function deriveGate(snapshot: Omit<AiCapabilitiesSnapshot, 'gate' | 'updatedAt'>): GateState {
  const best = [snapshot.summarizer, snapshot.languageModel].sort(
    (a, b) => rankAvailability(b) - rankAvailability(a),
  )[0]
  if (best === 'available') return 'ready'
  if (best === 'downloading') return 'downloading'
  if (best === 'downloadable') return 'downloadable'
  if (best === 'unavailable') return 'unavailable'
  return 'unknown'
}

async function probeOne(
  api: AvailabilityApi | undefined,
  options?: unknown,
): Promise<AvailabilityValue> {
  if (!api || typeof api.availability !== 'function') return 'unavailable'
  try {
    const result = await Promise.race([
      api.availability(options),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 2500)),
    ])
    if (result === 'timeout') return 'downloadable'
    return mapAvailability(result)
  } catch {
    return 'unavailable'
  }
}

function getWindowApis(): {
  LanguageModel?: AvailabilityApi
  Summarizer?: AvailabilityApi
} {
  const w = globalThis as typeof globalThis & {
    LanguageModel?: AvailabilityApi
    Summarizer?: AvailabilityApi
  }
  return {
    LanguageModel: w.LanguageModel,
    Summarizer: w.Summarizer,
  }
}

function inferUnavailableReason(): 'hardware' | 'os' | 'unknown' {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/Android|iPhone|iPad/i.test(ua)) return 'os'
  return 'hardware'
}

export function isExtensionAiHost(protocol?: string): boolean {
  const value = protocol ?? (typeof location === 'undefined' ? '' : location.protocol)
  return value === 'chrome-extension:'
}

export function shouldPersistAiCapabilityProbe(input?: {
  protocol?: string
  hasWindowAi?: boolean
}): boolean {
  if (input?.hasWindowAi) return isExtensionAiHost(input.protocol)
  return isExtensionAiHost(input?.protocol)
}

async function requestHostCapabilities(force?: boolean): Promise<AiCapabilitiesSnapshot | null> {
  try {
    const remote = (await chrome.runtime.sendMessage({
      type: MSG_AI_CAPABILITIES,
      payload: { force: Boolean(force) },
    })) as AiCapabilitiesSnapshot | undefined
    if (remote && typeof remote.gate === 'string') return remote
  } catch {
    // host may be unavailable in tests / isolated worlds without a background
  }
  return null
}

export async function probeAiCapabilities(options?: {
  force?: boolean
  progress?: number
  persist?: boolean
}): Promise<AiCapabilitiesSnapshot> {
  const persist = options?.persist ?? shouldPersistAiCapabilityProbe()
  if (!options?.force) {
    const cached = await readCachedCapabilities()
    if (
      cached &&
      Date.now() - cached.updatedAt < CAPABILITIES_TTL_MS &&
      cached.gate !== 'checking'
    ) {
      return cached
    }
  }

  if (!persist) {
    const remote = await requestHostCapabilities(options?.force)
    if (remote) return remote
    const cached = await readCachedCapabilities()
    return cached ?? { ...EMPTY_SNAPSHOT, gate: 'unknown', updatedAt: Date.now() }
  }

  const apis = getWindowApis()
  const [summarizer, languageModel, image, audio] = await Promise.all([
    probeOne(apis.Summarizer, { type: 'key-points', format: 'markdown', length: 'medium' }),
    probeOne(apis.LanguageModel),
    probeOne(apis.LanguageModel, { expectedInputs: [{ type: 'image' }] }),
    probeOne(apis.LanguageModel, { expectedInputs: [{ type: 'audio' }] }),
  ])

  const base = { summarizer, languageModel, image, audio, progress: options?.progress }
  const gate = deriveGate(base)
  const snapshot: AiCapabilitiesSnapshot = {
    ...base,
    gate,
    updatedAt: Date.now(),
    ...(gate === 'unavailable' ? { reason: inferUnavailableReason() } : {}),
  }
  await writeCachedCapabilities(snapshot)
  return snapshot
}

export async function readCachedCapabilities(): Promise<AiCapabilitiesSnapshot | null> {
  try {
    const stored = await chrome.storage.local.get(AI_CAPABILITIES_KEY)
    const value = stored?.[AI_CAPABILITIES_KEY] as AiCapabilitiesSnapshot | undefined
    return value ?? null
  } catch {
    return null
  }
}

export async function writeCachedCapabilities(snapshot: AiCapabilitiesSnapshot): Promise<void> {
  try {
    await chrome.storage.local.set({ [AI_CAPABILITIES_KEY]: snapshot })
  } catch {
    // ignore storage failures in tests / missing chrome
  }
}

export async function markCapabilitiesDownloading(
  progress: number,
): Promise<AiCapabilitiesSnapshot> {
  const current = (await readCachedCapabilities()) ?? { ...EMPTY_SNAPSHOT, updatedAt: Date.now() }
  const next: AiCapabilitiesSnapshot = {
    ...current,
    gate: 'downloading',
    progress,
    updatedAt: Date.now(),
  }
  await writeCachedCapabilities(next)
  return next
}

export async function getAiCapabilities(force = false): Promise<AiCapabilitiesSnapshot> {
  return probeAiCapabilities({ force })
}

export function useAiCapabilities(): {
  capabilities: AiCapabilitiesSnapshot
  ready: boolean
  refresh: () => Promise<void>
} {
  const [capabilities, setCapabilities] = React.useState<AiCapabilitiesSnapshot>(EMPTY_SNAPSHOT)
  const [ready, setReady] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setCapabilities((prev) => ({ ...prev, gate: prev.gate === 'unknown' ? 'checking' : prev.gate }))
    const next = await probeAiCapabilities({ force: true })
    setCapabilities(next)
    setReady(true)
  }, [])

  React.useEffect(() => {
    let active = true
    void (async () => {
      const cached = await readCachedCapabilities()
      if (cached && active) {
        setCapabilities(cached)
        setReady(true)
      } else if (active) {
        setCapabilities((prev) => ({ ...prev, gate: 'checking' }))
      }
      const next = await probeAiCapabilities({ force: !cached })
      if (active) {
        setCapabilities(next)
        setReady(true)
      }
    })()
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[AI_CAPABILITIES_KEY]) return
      const next = changes[AI_CAPABILITIES_KEY].newValue as AiCapabilitiesSnapshot | undefined
      if (next) setCapabilities(next)
    }
    try {
      chrome.storage.onChanged.addListener(onChanged)
    } catch {
      // ignore
    }
    return () => {
      active = false
      try {
        chrome.storage.onChanged.removeListener(onChanged)
      } catch {
        // ignore
      }
    }
  }, [])

  return { capabilities, ready, refresh }
}

export function isAiReady(snapshot: AiCapabilitiesSnapshot): boolean {
  return snapshot.gate === 'ready'
}

export function canUseAudio(snapshot: AiCapabilitiesSnapshot): boolean {
  return (
    snapshot.audio === 'available' ||
    snapshot.audio === 'downloadable' ||
    snapshot.audio === 'downloading'
  )
}

export function isAudioReady(snapshot: AiCapabilitiesSnapshot): boolean {
  return snapshot.audio === 'available'
}
