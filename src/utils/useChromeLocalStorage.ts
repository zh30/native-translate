import * as React from 'react'

interface UseChromeLocalStorageOptions<T> {
  debounceMs?: number
  serialize?: (value: T) => unknown
  deserialize?: (stored: unknown) => T
}

const DEFAULT_DEBOUNCE = 250

export function useChromeLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: UseChromeLocalStorageOptions<T>,
): readonly [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const { debounceMs = DEFAULT_DEBOUNCE, serialize, deserialize } = options ?? {}
  const [value, setValue] = React.useState<T>(defaultValue)
  const [isHydrated, setIsHydrated] = React.useState<boolean>(false)
  const timeoutRef = React.useRef<number | null>(null)
  const hasUserChangeRef = React.useRef(false)
  const pendingWriteRef = React.useRef(false)
  const pendingKeyRef = React.useRef(key)
  const pendingPayloadRef = React.useRef<unknown>(undefined)
  const writeTokenRef = React.useRef(0)
  const defaultValueRef = React.useRef(defaultValue)
  const serializeRef = React.useRef(serialize)
  const deserializeRef = React.useRef(deserialize)

  defaultValueRef.current = defaultValue
  serializeRef.current = serialize
  deserializeRef.current = deserialize

  const setStoredValue = React.useCallback<React.Dispatch<React.SetStateAction<T>>>((next) => {
    hasUserChangeRef.current = true
    setValue(next)
  }, [])
  const flushPendingWrite = React.useCallback(() => {
    if (!pendingWriteRef.current || timeoutRef.current === null) return

    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null

    const pendingKey = pendingKeyRef.current
    const pendingPayload = pendingPayloadRef.current
    pendingWriteRef.current = false
    hasUserChangeRef.current = false
    writeTokenRef.current += 1
    pendingPayloadRef.current = undefined
    void chrome.storage.local.set({ [pendingKey]: pendingPayload }).catch((error: unknown) => {
      console.warn('Failed to write chrome.storage.local key', pendingKey, error)
    })
  }, [])

  React.useEffect(() => {
    hasUserChangeRef.current = false
    setIsHydrated(false)

    let active = true
    ;(async () => {
      try {
        const stored = await chrome.storage.local.get(key)
        if (!active) return
        if (!hasUserChangeRef.current) {
          const raw = stored?.[key as keyof typeof stored]
          if (raw !== undefined) {
            const deserializeValue = deserializeRef.current
            setValue(deserializeValue ? deserializeValue(raw) : (raw as T))
          } else {
            setValue(defaultValueRef.current)
          }
        }
      } catch (error) {
        if (!active) return
        console.warn('Failed to read chrome.storage.local key', key, error)
        if (!hasUserChangeRef.current) {
          setValue(defaultValueRef.current)
        }
      } finally {
        if (active) setIsHydrated(true)
      }
    })()

    return () => {
      active = false
    }
  }, [key])

  React.useEffect(() => {
    const activeKey = key
    return () => {
      if (pendingKeyRef.current === activeKey) flushPendingWrite()
    }
  }, [key, flushPendingWrite])

  React.useEffect(() => {
    if (!isHydrated) return undefined
    if (!hasUserChangeRef.current) return undefined
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
    }
    const serializeValue = serializeRef.current
    const payload = serializeValue ? serializeValue(value) : value
    pendingKeyRef.current = key
    pendingPayloadRef.current = payload
    pendingWriteRef.current = true
    const writeToken = ++writeTokenRef.current
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      void chrome.storage.local
        .set({ [key]: payload })
        .catch((error: unknown) => {
          console.warn('Failed to write chrome.storage.local key', key, error)
        })
        .finally(() => {
          if (writeToken !== writeTokenRef.current) return
          pendingWriteRef.current = false
          hasUserChangeRef.current = false
          pendingPayloadRef.current = undefined
        })
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [value, key, isHydrated, debounceMs])

  React.useDebugValue({ key, value, isHydrated })

  return [value, setStoredValue, isHydrated] as const
}
