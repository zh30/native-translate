const ZHANGHE_ORIGIN = 'https://zhanghe.dev';

import { MSG_EASTER_CONFETTI } from '@/shared/messages';

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!tab.url) return;
  const url = new URL(tab.url);
  console.info("tabs.onUpdated", url.origin);

  if (url.origin === ZHANGHE_ORIGIN) {
    console.info("tabs.onUpdated", "enabling side panel");
    chrome.sidePanel.setOptions({
      tabId,
      path: 'sidePanel.html',
      enabled: true
    }).catch((error) => {
      console.error("Error enabling side panel:", error);
    });
    // 在目标站点自动打开侧边栏并触发一次撒花
    if (info.status === 'complete') {
      (async () => {
        try {
          await chrome.storage.local.set({ [MSG_EASTER_CONFETTI]: true });
          await chrome.sidePanel.open({ tabId });
        } catch (e) {
          console.error('auto-open side panel failed', e);
        }
      })();
    }
  } else {
    console.info("tabs.onUpdated", "disabling side panel");
    chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    }).catch((error) => {
      console.error("Error disabling side panel:", error);
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true,
  }).catch((error) => {
    console.error("action.onClicked", error);
  });
});

// Dev auto-reload removed