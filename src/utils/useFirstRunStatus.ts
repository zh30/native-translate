import {
  FIRST_RUN_STATUS_KEY,
  type FirstRunModelStatus,
  type FirstRunStatus,
} from '@/shared/settings'
import * as React from 'react'

export const defaultFirstRunStatus: FirstRunStatus = {
  status: 'new',
  updatedAt: 0,
}

function isFirstRunModelStatus(value: unknown): value is FirstRunModelStatus {
  return (
    value === 'new' ||
    value === 'preparing' ||
    value === 'downloading' ||
    value === 'ready' ||
    value === 'failed' ||
    value === 'unsupported'
  )
}

function normalizeFirstRunStatus(value: unknown): FirstRunStatus {
  if (!value || typeof value !== 'object') return defaultFirstRunStatus
  const candidate = value as Partial<FirstRunStatus>
  if (!isFirstRunModelStatus(candidate.status)) return defaultFirstRunStatus
  return {
    status: candidate.status,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0,
    progress: typeof candidate.progress === 'number' ? candidate.progress : undefined,
    sourceLanguage:
      typeof candidate.sourceLanguage === 'string' ? candidate.sourceLanguage : undefined,
    targetLanguage:
      typeof candidate.targetLanguage === 'string' ? candidate.targetLanguage : undefined,
    error: typeof candidate.error === 'string' ? candidate.error : undefined,
  }
}

export function useFirstRunStatus(): readonly [
  FirstRunStatus,
  boolean,
  (next: FirstRunStatus) => Promise<void>,
] {
  const [status, setStatus] = React.useState<FirstRunStatus>(defaultFirstRunStatus)
  const [ready, setReady] = React.useState(false)

  const writeStatus = React.useCallback(async (next: FirstRunStatus) => {
    setStatus(next)
    try {
      await chrome.storage.local.set({ [FIRST_RUN_STATUS_KEY]: next })
    } catch (_e) {
      // Best-effort onboarding state.
    }
  }, [])

  React.useEffect(() => {
    let active = true
    void chrome.storage.local
      .get(FIRST_RUN_STATUS_KEY)
      .then((stored) => {
        if (!active) return
        setStatus(normalizeFirstRunStatus(stored[FIRST_RUN_STATUS_KEY]))
      })
      .catch(() => {
        if (active) setStatus(defaultFirstRunStatus)
      })
      .finally(() => {
        if (active) setReady(true)
      })

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      areaName,
    ) => {
      if (areaName !== 'local') return
      const change = changes[FIRST_RUN_STATUS_KEY]
      if (change?.newValue) {
        setStatus(normalizeFirstRunStatus(change.newValue))
      }
    }
    chrome.storage.onChanged.addListener(onStorageChanged)
    return () => {
      active = false
      chrome.storage.onChanged.removeListener(onStorageChanged)
    }
  }, [])

  return [status, ready, writeStatus] as const
}
