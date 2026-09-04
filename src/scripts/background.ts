import {
  isOffscreenPortSender,
  retryUntil,
  waitForOffscreenStreamPort,
} from '@/shared/ai/streamRelay'
import {
  buildExtractMenuPayload,
  buildTranslatePageMessage,
  resolveTranslatePageTarget,
} from '@/shared/commands'
import type { LanguageCode } from '@/shared/languages'
import {
  MSG_AI_CAPABILITIES,
  MSG_AI_TASK,
  MSG_CAPTURE_REGION,
  MSG_EASTER_CONFETTI,
  MSG_OPEN_SETTINGS,
  MSG_START_REGION_SELECT,
  MSG_SUMMARIZE_PAGE,
  MSG_TOGGLE_LEARNING_MODE,
  MSG_TRANSLATE_TEXT,
  PORT_AI_STREAM,
} from '@/shared/messages'
import {
  FIRST_RUN_STATUS_KEY,
  type FirstRunStatus,
  POPUP_SETTINGS_KEY,
  SIDE_PANEL_INTENT_KEY,
} from '@/shared/settings'

const ZHANGHE_ORIGIN = 'https://zhanghe.dev'
const AUTO_OPEN_STATE_KEY = 'nativeTranslate.zhangheAutoOpenState'
const OFFSCREEN_URL = 'offscreen.html'
const OFFSCREEN_REASON = 'DOM_PARSER' as chrome.offscreen.Reason

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    const status: FirstRunStatus = {
      status: 'new',
      updatedAt: Date.now(),
    }
    void chrome.storage.local.set({ [FIRST_RUN_STATUS_KEY]: status })
    void chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') })
  }
  createContextMenus()
})

function createContextMenus(): void {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'nt-summarize',
        title: chrome.i18n.getMessage('ai_summary_title') || 'Smart summary',
        contexts: ['page'],
      })
      chrome.contextMenus.create({
        id: 'nt-screenshot',
        title: chrome.i18n.getMessage('ai_screenshot_title') || 'Translate this image',
        contexts: ['image'],
      })
      chrome.contextMenus.create({
        id: 'nt-extract',
        title: chrome.i18n.getMessage('ai_extract_title') || 'Extract selection',
        contexts: ['selection'],
      })
    })
  } catch {
    // contextMenus may be unavailable in tests
  }
}

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  })
  return contexts.length > 0
}

let offscreenCreating: Promise<void> | null = null

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreenDocument()) return
  if (offscreenCreating) {
    await offscreenCreating
    return
  }
  offscreenCreating = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [OFFSCREEN_REASON],
        justification:
          'Run Chrome built-in on-device AI (Gemini Nano), which is only exposed to documents',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/already exists|Only a single offscreen/i.test(message)) throw error
    }
  })()
  try {
    await offscreenCreating
  } finally {
    offscreenCreating = null
  }
}

async function forwardToOffscreen(message: unknown): Promise<unknown> {
  await ensureOffscreen()
  return retryUntil(
    async () => {
      try {
        return await chrome.runtime.sendMessage(message)
      } catch {
        return undefined
      }
    },
    (value) => value !== undefined,
    10,
    80,
  )
}

async function openSidePanelWithIntent(
  tabId: number,
  kind: 'summary' | 'chat' | 'vocab',
): Promise<void> {
  await chrome.storage.local.set({
    [SIDE_PANEL_INTENT_KEY]: { kind, tabId, createdAt: Date.now() },
  })
  try {
    await chrome.sidePanel.setOptions({ tabId, path: 'sidePanel.html', enabled: true })
  } catch {
    // ignore
  }
  await chrome.sidePanel.open({ tabId })
}

async function sendToTab(tabId: number, message: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message)
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] })
    await chrome.tabs.sendMessage(tabId, message)
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!tab.url) return
  let url: URL
  try {
    url = new URL(tab.url)
  } catch {
    return
  }

  if (url.origin === ZHANGHE_ORIGIN) {
    chrome.sidePanel
      .setOptions({
        tabId,
        path: 'sidePanel.html',
        enabled: true,
      })
      .catch((error) => {
        console.error('Error enabling side panel:', error)
      })
    if (info.status === 'complete') {
      ;(async () => {
        try {
          const state = await chrome.storage.local.get(AUTO_OPEN_STATE_KEY)
          const openedByTab =
            (state[AUTO_OPEN_STATE_KEY] as Record<string, string> | undefined) ?? {}
          if (openedByTab[String(tabId)] === tab.url) return
          await chrome.storage.local.set({
            [AUTO_OPEN_STATE_KEY]: {
              ...openedByTab,
              [String(tabId)]: tab.url,
            },
          })
          await chrome.storage.local.set({ [MSG_EASTER_CONFETTI]: true })
        } catch (e) {
          console.error('auto-enable side panel failed', e)
        }
      })()
    }
  }
})

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel
    .setPanelBehavior({
      openPanelOnActionClick: true,
    })
    .catch((error) => {
      console.error('action.onClicked', error)
    })
  if (tab.id) {
    void chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidePanel.html', enabled: true })
  }
})

chrome.commands.onCommand.addListener((command, tab) => {
  const tabId = tab?.id
  if (!tabId) return
  if (command === 'translate-page') {
    void (async () => {
      const stored = await chrome.storage.local.get(POPUP_SETTINGS_KEY)
      const settings = stored[POPUP_SETTINGS_KEY] as { targetLanguage?: LanguageCode } | undefined
      await sendToTab(tabId, buildTranslatePageMessage(resolveTranslatePageTarget(settings)))
    })()
  }
  if (command === 'summarize-page') {
    void openSidePanelWithIntent(tabId, 'summary')
  }
  if (command === 'screenshot-translate') {
    void sendToTab(tabId, { type: MSG_START_REGION_SELECT })
  }
  if (command === 'toggle-learning-mode') {
    void sendToTab(tabId, { type: MSG_TOGGLE_LEARNING_MODE, payload: { toggle: true } })
  }
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id
  if (!tabId) return
  if (info.menuItemId === 'nt-summarize') {
    void openSidePanelWithIntent(tabId, 'summary')
  }
  if (info.menuItemId === 'nt-screenshot') {
    void sendToTab(tabId, { type: MSG_START_REGION_SELECT, payload: { srcUrl: info.srcUrl } })
  }
  if (info.menuItemId === 'nt-extract') {
    void sendToTab(tabId, {
      type: MSG_START_REGION_SELECT,
      payload: buildExtractMenuPayload(info),
    })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false
  if (
    (message.type === MSG_AI_TASK || message.type === MSG_AI_CAPABILITIES) &&
    message.target !== 'offscreen'
  ) {
    void (async () => {
      try {
        const result = await forwardToOffscreen({ ...message, target: 'offscreen' })
        sendResponse(result)
      } catch (error) {
        sendResponse({
          ok: false,
          code: 'internal',
          message: error instanceof Error ? error.message : 'offscreen unavailable',
        })
      }
    })()
    return true
  }
  if (message.type === MSG_CAPTURE_REGION) {
    const windowId = sender.tab?.windowId
    void (async () => {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
        sendResponse({ dataUrl })
      } catch (error) {
        sendResponse({ error: error instanceof Error ? error.message : 'capture failed' })
      }
    })()
    return true
  }
  if (message.type === MSG_SUMMARIZE_PAGE && sender.tab?.id) {
    void openSidePanelWithIntent(sender.tab.id, 'summary')
    sendResponse({ ok: true })
    return true
  }
  if (message.type === MSG_OPEN_SETTINGS) {
    void chrome.action.openPopup?.()
    sendResponse({ ok: true })
    return true
  }
  if (message.type === MSG_TRANSLATE_TEXT && sender.tab?.id) {
    void (async () => {
      try {
        const result = await chrome.tabs.sendMessage(sender.tab?.id as number, message)
        sendResponse(result)
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'translate failed',
        })
      }
    })()
    return true
  }
  return false
})

const contentStreamPorts = new Map<string, chrome.runtime.Port>()
let offscreenPort: chrome.runtime.Port | null = null

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_AI_STREAM) return
  if (isOffscreenPortSender(port.sender)) {
    offscreenPort = port
    port.onMessage.addListener((frame: { requestId?: string }) => {
      if (!frame.requestId) return
      contentStreamPorts.get(frame.requestId)?.postMessage(frame)
    })
    port.onDisconnect.addListener(() => {
      if (offscreenPort === port) offscreenPort = null
    })
    return
  }

  port.onMessage.addListener((message: { type?: string; requestId?: string }) => {
    if (!message.requestId) return
    contentStreamPorts.set(message.requestId, port)
    void (async () => {
      try {
        const host = await waitForOffscreenStreamPort(() => offscreenPort, ensureOffscreen)
        host.postMessage(message)
      } catch (error) {
        port.postMessage({
          type: 'error',
          requestId: message.requestId,
          code: 'internal',
          message: error instanceof Error ? error.message : 'offscreen stream unavailable',
        })
      }
    })()
  })
  port.onDisconnect.addListener(() => {
    for (const [id, mapped] of contentStreamPorts) {
      if (mapped === port) contentStreamPorts.delete(id)
    }
  })
})
