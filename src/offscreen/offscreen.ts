import { getAiCapabilities, probeAiCapabilities } from '@/shared/ai/capabilities'
import { executeAiTask } from '@/shared/ai/execute'
import { shouldAcceptOffscreenMessage } from '@/shared/ai/productInvariants'
import {
  languageModelPool,
  startSessionIdleSweep,
  summarizerPool,
} from '@/shared/ai/sessionManager'
import type { AiStreamFrame, AiTask } from '@/shared/ai/types'
import { AiTaskError } from '@/shared/ai/types'
import { MSG_AI_CAPABILITIES, MSG_AI_TASK, PORT_AI_STREAM } from '@/shared/messages'

const IDLE_CLOSE_MS = 10 * 60 * 1000
const activeTasks = new Set<string>()
let idleTimer: number | null = null

startSessionIdleSweep()

function bumpIdleTimer(): void {
  if (idleTimer !== null) window.clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    if (activeTasks.size > 0) {
      bumpIdleTimer()
      return
    }
    if (languageModelPool.size > 0 || summarizerPool.size > 0) {
      bumpIdleTimer()
      return
    }
    window.close()
  }, IDLE_CLOSE_MS)
}

bumpIdleTimer()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false
  if (!shouldAcceptOffscreenMessage(message.target)) return false
  if (message.type === MSG_AI_CAPABILITIES) {
    void (async () => {
      const caps = await getAiCapabilities(Boolean(message.payload?.force))
      sendResponse(caps)
    })()
    return true
  }
  if (message.type === MSG_AI_TASK) {
    const { requestId, task } = message.payload as { requestId: string; task: AiTask }
    activeTasks.add(requestId)
    void (async () => {
      try {
        const result = await executeAiTask(task, { requestId })
        sendResponse({ ok: true, requestId, result })
      } catch (error) {
        const code = error instanceof AiTaskError ? error.code : 'internal'
        sendResponse({
          ok: false,
          requestId,
          code,
          message: error instanceof Error ? error.message : 'AI task failed',
        })
      } finally {
        activeTasks.delete(requestId)
        bumpIdleTimer()
      }
    })()
    return true
  }
  return false
})

function attachStreamPort(port: chrome.runtime.Port): void {
  const controllers = new Map<string, AbortController>()
  port.onMessage.addListener((message: { type?: string; requestId?: string; task?: AiTask }) => {
    if (message.type === 'abort' && message.requestId) {
      controllers.get(message.requestId)?.abort()
      return
    }
    if (message.type !== 'start' || !message.requestId || !message.task) return
    const requestId = message.requestId
    const controller = new AbortController()
    controllers.set(requestId, controller)
    activeTasks.add(requestId)
    void (async () => {
      try {
        await executeAiTask(message.task as AiTask, {
          requestId,
          signal: controller.signal,
          onChunk: (delta) => {
            const frame: AiStreamFrame = { type: 'chunk', requestId, delta }
            port.postMessage(frame)
          },
          onFrame: (frame) => port.postMessage(frame),
        })
      } catch {
        // onFrame already emitted error
      } finally {
        controllers.delete(requestId)
        activeTasks.delete(requestId)
        bumpIdleTimer()
      }
    })()
  })
}

function connectStreamToServiceWorker(): void {
  const port = (
    chrome.runtime as unknown as { connect: (info: { name: string }) => chrome.runtime.Port }
  ).connect({ name: PORT_AI_STREAM })
  attachStreamPort(port)
  port.onDisconnect.addListener(() => {
    window.setTimeout(connectStreamToServiceWorker, 250)
  })
}

connectStreamToServiceWorker()

void probeAiCapabilities({ force: true, persist: true })
