export function isOffscreenPortSender(sender?: {
  tab?: { id?: number } | null
  url?: string
}): boolean {
  // Content scripts always have a tab. Offscreen/extension pages do not.
  return !sender?.tab
}

export async function retryUntil<T>(
  work: () => Promise<T>,
  isOk: (value: T) => boolean,
  attempts = 8,
  delayMs = 50,
): Promise<T> {
  let last: T | undefined
  for (let i = 0; i < attempts; i += 1) {
    last = await work()
    if (isOk(last)) return last
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  if (last === undefined) throw new Error('retryUntil produced no result')
  return last
}

export async function waitForOffscreenStreamPort<T>(
  getPort: () => T | null,
  ensureHost: () => Promise<void>,
  timeoutMs = 8000,
): Promise<T> {
  await ensureHost()
  const started = Date.now()
  let port = getPort()
  while (!port) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('offscreen stream port not connected')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
    port = getPort()
  }
  return port
}
