import { positionOverlay } from '@/content/overlayKit/anchor'
import { button, el, glassCard } from '@/content/overlayKit/components'
import { trapOverlayFocus } from '@/content/overlayKit/focus'
import { getOverlayHost } from '@/content/overlayKit/host'
import { runAiTask } from '@/shared/ai/client'
import type {
  ExtractEntity,
  ExtractedContact,
  ExtractedEvent,
  ExtractedProduct,
  ExtractResult,
} from '@/shared/ai/types'
import { buildIcsEvent, buildProductTableRow, buildVcard } from '@/shared/exporters'
import type { LanguageCode } from '@/shared/languages'
import { t } from '@/utils/i18n'

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function field(label: string, value?: string): HTMLElement {
  const row = el('div')
  row.style.margin = '4px 0'
  const name = el('span', 'nt-muted')
  name.textContent = label
  const val = el('button', 'nt-btn')
  val.textContent = value || '—'
  val.addEventListener('click', () => {
    if (value) void navigator.clipboard.writeText(value)
  })
  row.append(name, val)
  return row
}

export async function showExtractCard(
  text: string,
  targetLanguage: LanguageCode,
  entity: ExtractEntity = 'auto',
): Promise<void> {
  const { root } = getOverlayHost()
  const card = glassCard()
  const title = el('strong')
  title.textContent = t('ai_extract_title')
  card.appendChild(title)
  const body = el('div', 'nt-muted')
  body.textContent = '…'
  card.appendChild(body)
  root.appendChild(card)
  void positionOverlay(card, { kind: 'selection' })
  const untrap = trapOverlayFocus(card, () => {
    untrap()
    card.remove()
  })

  let result: ExtractResult
  try {
    result = (await runAiTask({
      kind: 'extract',
      text,
      entity,
      targetLanguage,
    })) as ExtractResult
  } catch (error) {
    body.textContent = error instanceof Error ? error.message : t('ai_error_internal')
    return
  }

  body.textContent = ''
  if (result.type === 'none') {
    body.textContent = t('ai_extract_none')
    return
  }

  const switcher = el('div')
  for (const kind of ['event', 'contact', 'product'] as const) {
    switcher.appendChild(
      button(t(`ai_extract_${kind}`), kind === result.type ? 'nt-btn nt-btn-ai' : 'nt-btn', () => {
        untrap()
        card.remove()
        void showExtractCard(text, targetLanguage, kind)
      }),
    )
  }
  card.appendChild(switcher)

  if (result.type === 'event') {
    const event = result as ExtractedEvent
    body.append(
      field(t('ai_extract_event'), event.title),
      field('start', event.start),
      field('end', event.end),
      field('location', event.location),
    )
    if (event.start && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(event.start)) {
      const note = el('div', 'nt-muted')
      note.textContent = t('ai_extract_local_tz')
      body.appendChild(note)
    }
    const actions = el('div')
    actions.appendChild(
      button(t('ai_extract_download_ics'), 'nt-btn nt-btn-ai', () => {
        const { ics } = buildIcsEvent(event)
        download('event.ics', ics, 'text/calendar')
      }),
    )
    actions.appendChild(
      button(t('ai_extract_copy_details'), 'nt-btn', () => {
        void navigator.clipboard.writeText(
          [event.title, event.start, event.end, event.location, event.url]
            .filter(Boolean)
            .join('\n'),
        )
      }),
    )
    card.appendChild(actions)
  }

  if (result.type === 'contact') {
    const contact = result as ExtractedContact
    body.append(
      field('name', contact.name),
      field('org', contact.org),
      field('phone', contact.phone),
      field('email', contact.email),
    )
    card.appendChild(
      button(t('ai_extract_copy_vcard'), 'nt-btn nt-btn-ai', () => {
        void navigator.clipboard.writeText(buildVcard(contact))
      }),
    )
  }

  if (result.type === 'product') {
    const product = result as ExtractedProduct
    body.append(
      field('name', product.name),
      field('price', [product.price, product.currency].filter(Boolean).join(' ')),
      field('specs', product.specs),
    )
    card.appendChild(
      button(t('ai_extract_copy_table'), 'nt-btn nt-btn-ai', () => {
        void navigator.clipboard.writeText(buildProductTableRow(product))
      }),
    )
  }
}
