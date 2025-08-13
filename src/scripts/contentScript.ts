// 基础消息通道骨架：接收来自 Popup 的“翻译当前网页全文”指令
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === 'NATIVE_TRANSLATE_TRANSLATE_PAGE') {
    // TODO: 这里后续将遍历文档并插入翻译结果。
    // 先快速确认通路畅通。
    // 目前无需返回值，避免类型不匹配
    return false;
  }
  return false;
});