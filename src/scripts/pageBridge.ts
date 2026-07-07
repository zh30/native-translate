const BRIDGE_REQ_TYPE = '__NT_BRIDGE_REQ'
const BRIDGE_RES_TYPE = '__NT_BRIDGE_RES'
const MAX_TRANSLATOR_POOL_ENTRIES = 12

interface TranslatorInstance {
  ready?: Promise<void>
  translate(text: string): Promise<string>
}

interface TranslatorCreateOptions {
  sourceLanguage: string
  targetLanguage: string
}

interface TranslatorStaticLegacy {
  create(options: TranslatorCreateOptions): Promise<TranslatorInstance>
}

interface TranslatorStaticModern {
  createTranslator(options: TranslatorCreateOptions): Promise<TranslatorInstance>
}

type PageBridgeWindow = Window &
  typeof globalThis & {
    Translator?: TranslatorStaticLegacy
    translation?: TranslatorStaticModern
    __nativeTranslateBridgeInit?: boolean
    __nativeTranslateBridgePool?: Map<string, TranslatorInstance>
  }

interface BridgeRequest {
  type: typeof BRIDGE_REQ_TYPE
  id: string
  action: 'translate' | 'warm'
  source: string
  target: string
  text?: string
}

function resolveAdapter(): {
  create(options: TranslatorCreateOptions): Promise<TranslatorInstance>
} | null {
  const win = window as PageBridgeWindow
  if (win.Translator && typeof win.Translator.create === 'function') {
    return { create: win.Translator.create.bind(win.Translator) }
  }
  if (win.translation && typeof win.translation.createTranslator === 'function') {
    return { create: win.translation.createTranslator.bind(win.translation) }
  }
  return null
}

async function getTranslator(sourceLanguage: string, targetLanguage: string) {
  const win = window as PageBridgeWindow
  if (!win.__nativeTranslateBridgePool) {
    win.__nativeTranslateBridgePool = new Map<string, TranslatorInstance>()
  }
  const pool = win.__nativeTranslateBridgePool
  const key = `${sourceLanguage}->${targetLanguage}`
  const existing = pool.get(key)
  if (existing) {
    pool.delete(key)
    pool.set(key, existing)
    return existing
  }

  const adapter = resolveAdapter()
  if (!adapter) throw new Error('Translator API unavailable')
  const translator = await adapter.create({ sourceLanguage, targetLanguage })
  if (translator.ready) {
    try {
      await translator.ready
    } catch (_e) {
      // Translate will surface the actual failure if the instance is unusable.
    }
  }
  pool.set(key, translator)
  while (pool.size > MAX_TRANSLATOR_POOL_ENTRIES) {
    const oldest = pool.keys().next().value
    if (oldest === undefined) break
    pool.delete(oldest)
  }
  return translator
}

function errorToMessage(error: unknown): string {
  if (error instanceof DOMException) {
    return [error.name, error.message].filter(Boolean).join(': ') || 'DOMException'
  }
  if (error instanceof Error) return error.message
  try {
    return String(error)
  } catch (_e) {
    return 'Unknown error'
  }
}

const win = window as PageBridgeWindow
if (!win.__nativeTranslateBridgeInit) {
  win.__nativeTranslateBridgeInit = true
  window.addEventListener(
    'message',
    (event) => {
      const data = event.data as BridgeRequest | undefined
      if (
        !data ||
        data.type !== BRIDGE_REQ_TYPE ||
        (data.action !== 'translate' && data.action !== 'warm')
      ) {
        return
      }
      void (async () => {
        try {
          const translator = await getTranslator(data.source, data.target)
          if (data.action === 'warm') {
            window.postMessage({ type: BRIDGE_RES_TYPE, id: data.id, ok: true }, '*')
            return
          }
          if (typeof data.text !== 'string') throw new Error('bridge_missing_text')
          const result = await translator.translate(data.text)
          window.postMessage({ type: BRIDGE_RES_TYPE, id: data.id, ok: true, result }, '*')
        } catch (error) {
          const message = errorToMessage(error)
          window.postMessage(
            {
              type: BRIDGE_RES_TYPE,
              id: data.id,
              ok: false,
              error: message || 'bridge_error',
            },
            '*',
          )
        }
      })()
    },
    { capture: false },
  )
}
