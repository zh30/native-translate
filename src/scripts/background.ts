import { MSG_EASTER_CONFETTI } from '@/shared/messages'

const ZHANGHE_ORIGIN = 'https://zhanghe.dev'
const AUTO_OPEN_STATE_KEY = 'nativeTranslate.zhangheAutoOpenState'

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
    // 在目标站点自动打开侧边栏并触发一次撒花
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
          await chrome.sidePanel.open({ tabId })
        } catch (e) {
          console.error('auto-open side panel failed', e)
        }
      })()
    }
  } else {
    chrome.sidePanel
      .setOptions({
        tabId,
        enabled: false,
      })
      .catch((error) => {
        console.error('Error disabling side panel:', error)
      })
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
})

// Dev auto-reload removed
