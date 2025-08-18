import { MSG_DEV_RELOAD } from '@/shared/messages';
declare const __DEV__: boolean;

const PORT = Number((self as any).NT_DEV_RELOAD_PORT || 5174);
const URL_EVENTS = `http://localhost:${PORT}/events`;

function connect() {
  try {
    const es = new EventSource(URL_EVENTS);
    es.onmessage = () => {
      chrome.runtime.sendMessage({ type: MSG_DEV_RELOAD }).catch(() => { });
    };
    es.onerror = () => {
      try { es.close(); } catch { }
      setTimeout(connect, 800);
    };
  } catch {
    setTimeout(connect, 1000);
  }
}

if (typeof EventSource !== 'undefined') connect();

export { };


