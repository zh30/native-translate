import { el } from '@/content/overlayKit/components'
import { getOverlayHost } from '@/content/overlayKit/host'
import { showScreenshotResult } from '@/content/screenshotResult'
import { planScreenshotCrop } from '@/shared/ai/imageTask'
import { hudMustUnbindKeydown } from '@/shared/ai/productInvariants'
import { DEFAULT_TARGET_LANGUAGE, type LanguageCode } from '@/shared/languages'
import { MSG_CAPTURE_REGION } from '@/shared/messages'
import { POPUP_SETTINGS_KEY } from '@/shared/settings'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function hideHud(hud: HTMLElement): Promise<void> {
  hud.style.display = 'none'
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
}

async function captureAndCrop(rect: Rect): Promise<string> {
  const dpr = window.devicePixelRatio || 1
  const response = (await chrome.runtime.sendMessage({
    type: MSG_CAPTURE_REGION,
    payload: { rect, dpr },
  })) as { dataUrl?: string }
  if (!response?.dataUrl) throw new Error('capture failed')
  const image = new Image()
  image.src = response.dataUrl
  await image.decode()
  const plan = planScreenshotCrop({
    cssRect: rect,
    dpr,
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
  })
  const canvas = document.createElement('canvas')
  canvas.width = plan.output.width
  canvas.height = plan.output.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(
    image,
    plan.source.x,
    plan.source.y,
    plan.source.width,
    plan.source.height,
    0,
    0,
    plan.output.width,
    plan.output.height,
  )
  return canvas.toDataURL('image/png')
}

export async function startRegionSelect(options?: { srcUrl?: string }): Promise<void> {
  if (options?.srcUrl) {
    const img = Array.from(document.images).find(
      (item) => item.currentSrc === options.srcUrl || item.src === options.srcUrl,
    )
    if (img) {
      img.scrollIntoView({ block: 'center', inline: 'center' })
      const rect = img.getBoundingClientRect()
      if (rect.width > 2 && rect.height > 2) {
        try {
          const dataUrl = await captureAndCrop({
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          })
          const settings = await chrome.storage.local.get(POPUP_SETTINGS_KEY)
          const lang =
            (settings[POPUP_SETTINGS_KEY] as { targetLanguage?: LanguageCode } | undefined)
              ?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE
          showScreenshotResult(dataUrl, lang, () => {
            void startRegionSelect()
          })
          return
        } catch {
          // fall through to box select
        }
      }
    }
  }

  const { root } = getOverlayHost()
  const hud = el('div', 'nt-hud nt-interactive')
  const box = el('div', 'nt-rect')
  const badge = el('div', 'nt-badge')
  hud.append(box, badge)
  root.appendChild(hud)
  let startX = 0
  let startY = 0
  let current: Rect = { x: 0, y: 0, width: 0, height: 0 }
  let dragging = false

  const update = (rect: Rect) => {
    current = rect
    box.style.left = `${rect.x}px`
    box.style.top = `${rect.y}px`
    box.style.width = `${rect.width}px`
    box.style.height = `${rect.height}px`
    badge.style.left = `${rect.x}px`
    badge.style.top = `${rect.y}px`
    badge.textContent = `${Math.round(rect.width)}×${Math.round(rect.height)}`
  }

  function onKey(event: KeyboardEvent): void {
    const action = resolveRegionHudKey(event.key)
    if (action === 'ignore') return
    event.preventDefault()
    event.stopPropagation()
    if (action === 'cancel') {
      if (hudMustUnbindKeydown('esc')) {
        document.removeEventListener('keydown', onKey, true)
      }
      hud.remove()
      return
    }
    if (hudMustUnbindKeydown('enter')) {
      document.removeEventListener('keydown', onKey, true)
    }
    void hideHud(hud).then(finish)
  }

  const finish = async () => {
    if (hudMustUnbindKeydown('enter')) {
      document.removeEventListener('keydown', onKey, true)
    }
    hud.remove()
    if (current.width < 4 || current.height < 4) return
    const dataUrl = await captureAndCrop(current)
    const settings = await chrome.storage.local.get(POPUP_SETTINGS_KEY)
    const lang =
      (settings[POPUP_SETTINGS_KEY] as { targetLanguage?: LanguageCode } | undefined)
        ?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE
    showScreenshotResult(dataUrl, lang, () => {
      void startRegionSelect()
    })
  }

  hud.addEventListener('mousedown', (event) => {
    dragging = true
    startX = event.clientX
    startY = event.clientY
    update({ x: startX, y: startY, width: 0, height: 0 })
  })
  hud.addEventListener('mousemove', (event) => {
    if (!dragging) return
    const x = Math.min(startX, event.clientX)
    const y = Math.min(startY, event.clientY)
    update({
      x,
      y,
      width: Math.abs(event.clientX - startX),
      height: Math.abs(event.clientY - startY),
    })
  })
  hud.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    if (hudMustUnbindKeydown('mouseup')) {
      document.removeEventListener('keydown', onKey, true)
    }
    void hideHud(hud).then(finish)
  })
  document.addEventListener('keydown', onKey, true)
}

export function resolveRegionHudKey(key: string): 'confirm' | 'cancel' | 'ignore' {
  if (key === 'Enter') return 'confirm'
  if (key === 'Escape') return 'cancel'
  return 'ignore'
}

export function initRegionSelector(): void {
  // message handler is registered from contentScript
}
