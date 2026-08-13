import { createRequestId, executeAiTask } from '@/shared/ai/execute'
import { canExecuteAiLocally } from '@/shared/ai/productInvariants'
import type { AiStreamFrame, AiTask, AiTaskResponse } from '@/shared/ai/types'
import { AiTaskError } from '@/shared/ai/types'
import { MSG_AI_TASK, PORT_AI_STREAM } from '@/shared/messages'

function canExecuteLocally(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return canExecuteAiLocally(location.protocol)
  } catch {
    return false
  }
}

export async function runAiTask(task: AiTask, signal?: AbortSignal): Promise<unknown> {
  if (canExecuteLocally()) {
    return executeAiTask(task, { signal })
  }
  const requestId = createRequestId()
  const response = (await chrome.runtime.sendMessage({
    type: MSG_AI_TASK,
    payload: { requestId, task },
  })) as AiTaskResponse | undefined
  if (!response?.ok) {
    throw new AiTaskError(response?.code ?? 'internal', response?.message ?? 'AI task failed')
  }
  return response.result
}

export function streamAiTask(
  task: AiTask,
  onFrame: (frame: AiStreamFrame) => void,
  signal?: AbortSignal,
): Promise<unknown> {
  if (canExecuteLocally()) {
    const requestId = createRequestId()
    return executeAiTask(task, {
      requestId,
      signal,
      onChunk: (delta) => onFrame({ type: 'chunk', requestId, delta }),
      onFrame,
    })
  }

  return new Promise((resolve, reject) => {
    const requestId = createRequestId()
    const port = (
      chrome.runtime as unknown as { connect: (info: { name: string }) => chrome.runtime.Port }
    ).connect({ name: PORT_AI_STREAM })
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      fn()
    }
    const abort = () => {
      try {
        port.postMessage({ type: 'abort', requestId })
      } catch {
        // ignore
      }
      port.disconnect()
      finish(() => reject(new AiTaskError('aborted', 'Task was cancelled')))
    }
    signal?.addEventListener('abort', abort, { once: true })
    port.onMessage.addListener((frame: AiStreamFrame) => {
      if (frame.requestId !== requestId) return
      onFrame(frame)
      if (frame.type === 'done') {
        port.disconnect()
        finish(() => resolve(frame.result))
      }
      if (frame.type === 'error') {
        port.disconnect()
        finish(() => reject(new AiTaskError(frame.code, frame.message)))
      }
    })
    port.onDisconnect.addListener(() => {
      finish(() => reject(new AiTaskError('internal', 'AI stream disconnected')))
    })
    port.postMessage({ type: 'start', requestId, task })
  })
}

export { createRequestId }
