import { button, el, glassCard, skeletonLines } from '@/content/overlayKit/components'
import { trapOverlayFocus } from '@/content/overlayKit/focus'
import { getOverlayHost } from '@/content/overlayKit/host'
import { runAiTask } from '@/shared/ai/client'
import type { OcrTranslateResult } from '@/shared/ai/types'
import type { LanguageCode } from '@/shared/languages'
import { t } from '@/utils/i18n'

export function showScreenshotResult(
  imageDataUrl: string,
  targetLanguage: LanguageCode,
  onRetry?: () => void,
): void {
  const { root } = getOverlayHost()
  const card = glassCard()
  const title = el('strong')
  title.textContent = t('ai_screenshot_title')
  const body = el('div')
  body.appendChild(skeletonLines())
  card.append(title, body)
  root.appendChild(card)
  const untrap = trapOverlayFocus(card, () => {
    untrap()
    card.remove()
  })

  void (async () => {
    try {
      const result = (await runAiTask({
        kind: 'ocrTranslate',
        imageDataUrl,
        targetLanguage,
      })) as OcrTranslateResult
      body.textContent = ''
      if (!result.items.length) {
        const empty = el('div', 'nt-muted')
        empty.textContent = `${t('ai_screenshot_empty')} ${t('ai_screenshot_zoom_hint')}`
        body.appendChild(empty)
      } else {
        for (const [index, item] of result.items.entries()) {
          const src = el('div', 'nt-muted')
          src.textContent = `${t('ai_screenshot_copy_source')} ${index + 1}  ${item.source}`
          const dst = el('div', 'nt-stream')
          dst.textContent = item.translation
          body.append(src, dst)
        }
      }
      const actions = el('div')
      actions.append(
        button(t('ai_screenshot_copy_translation'), 'nt-btn nt-btn-ai', () => {
          void navigator.clipboard.writeText(
            result.items.map((item) => item.translation).join('\n'),
          )
        }),
        button(t('ai_screenshot_copy_source'), 'nt-btn', () => {
          void navigator.clipboard.writeText(result.items.map((item) => item.source).join('\n'))
        }),
        button(t('ai_screenshot_retry'), 'nt-btn', () => {
          untrap()
          card.remove()
          onRetry?.()
        }),
      )
      card.appendChild(actions)
    } catch (error) {
      body.textContent = error instanceof Error ? error.message : t('ai_error_internal')
    }
  })()
}
