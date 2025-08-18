declare const __DEV__: boolean;

const ZHANGHE_ORIGIN = 'https://zhanghe.dev';

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
          await chrome.storage.local.set({ NATIVE_TRANSLATE_EASTER_EGG_CONFETTI: true });
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

// ============ Dev auto-reload (only in development) ============
if (__DEV__) {
  // Ensure offscreen document exists to maintain SSE connection
  const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

  async function ensureOffscreenDocument() {
    try {
      const existing = await (chrome.runtime as any).getContexts?.({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [OFFSCREEN_URL],
      });
      if (Array.isArray(existing) && existing.length > 0) return;
    } catch { }
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['IFRAME_SCRIPTING' as any],
        justification: 'Keep SSE connection for dev auto-reload',
      });
    } catch (e) {
      console.warn('ensureOffscreenDocument failed', e);
    }
  }

  ensureOffscreenDocument();

  async function devInjectAllOpenTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        const url = tab.url || '';
        if (!tab.id) continue;
        // 跳过受限或不可注入协议
        if (/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) continue;
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['contentScript.js'] });
        } catch (_) { }
      }
    } catch (e) {
      console.warn('devInjectAllOpenTabs failed', e);
    }
  }

  // 扩展被重载后，尽量把最新内容脚本注入到现有标签页（仅开发模式）
  devInjectAllOpenTabs();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'NATIVE_TRANSLATE_DEV_RELOAD') {
      try {
        chrome.runtime.reload();
      } catch (e) {
        console.warn('runtime.reload failed', e);
      }
    }
    return false;
  });
}