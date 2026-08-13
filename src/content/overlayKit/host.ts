import { OVERLAY_STYLES } from '@/content/overlayKit/styles'
import { getUILocale, isRTLLanguage } from '@/utils/rtl'

const HOST_ID = 'native-translate-overlay-host'

export interface OverlayHost {
  root: ShadowRoot
  host: HTMLElement
  destroy: () => void
}

export function getOverlayHost(): OverlayHost {
  const existing = document.getElementById(HOST_ID) as HTMLElement | null
  if (existing?.shadowRoot) {
    return {
      root: existing.shadowRoot,
      host: existing,
      destroy: () => existing.remove(),
    }
  }
  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.zIndex = '2147483647'
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  const root = host.attachShadow({ mode: 'open' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(OVERLAY_STYLES)
  root.adoptedStyleSheets = [sheet]
  const locale = getUILocale()
  host.setAttribute('dir', isRTLLanguage(locale) ? 'rtl' : 'ltr')
  host.setAttribute('lang', locale)
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  host.setAttribute('data-theme', dark ? 'dark' : 'light')
  document.documentElement.appendChild(host)
  return {
    root,
    host,
    destroy: () => host.remove(),
  }
}

export function clearOverlayChildren(predicate?: (el: Element) => boolean): void {
  const host = document.getElementById(HOST_ID)
  const root = host?.shadowRoot
  if (!root) return
  for (const child of Array.from(root.children)) {
    if (!predicate || predicate(child)) child.remove()
  }
}
