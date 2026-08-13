import type { ExtractedContact, ExtractedEvent, ExtractedProduct } from '@/shared/ai/types'

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function escapeVcardText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

export function parseLooseDate(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function sourceHasTimezone(value: string | undefined): boolean {
  if (!value) return false
  return /z$/i.test(value.trim()) || /[+-]\d{2}:?\d{2}$/.test(value.trim())
}

export function formatIcsDateTime(
  value: string,
  fallback: Date,
): { line: string; usedLocalTz: boolean } {
  const parsed = parseLooseDate(value) ?? fallback
  const usedLocalTz = !sourceHasTimezone(value)
  if (usedLocalTz) {
    const local = `${parsed.getFullYear()}${pad(parsed.getMonth() + 1)}${pad(parsed.getDate())}T${pad(parsed.getHours())}${pad(parsed.getMinutes())}${pad(parsed.getSeconds())}`
    return { line: local, usedLocalTz: true }
  }
  return { line: formatStamp(parsed), usedLocalTz: false }
}

export function buildIcsEvent(event: ExtractedEvent): { ics: string; usedLocalTz: boolean } {
  const now = new Date()
  const start = formatIcsDateTime(event.start ?? '', event.start ? new Date(event.start) : now)
  const endSource = event.end ?? event.start ?? ''
  const end = formatIcsDateTime(
    endSource,
    event.end ? new Date(event.end) : new Date(now.getTime() + 60 * 60 * 1000),
  )
  const usedLocalTz = start.usedLocalTz || end.usedLocalTz
  const uid = `native-translate-${Date.now()}@local`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Native Translate//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatStamp(now)}`,
    usedLocalTz ? `DTSTART:${start.line}` : `DTSTART:${start.line}`,
    usedLocalTz ? `DTEND:${end.line}` : `DTEND:${end.line}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ]
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`)
  if (event.url) lines.push(`URL:${escapeIcsText(event.url)}`)
  if (event.notes) lines.push(`DESCRIPTION:${escapeIcsText(event.notes)}`)
  if (usedLocalTz) {
    lines.push('X-NT-TZ-NOTE:Source had no timezone; times are local')
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return { ics: `${lines.join('\r\n')}\r\n`, usedLocalTz }
}

export function buildVcard(contact: ExtractedContact): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVcardText(contact.name)}`,
    `N:${escapeVcardText(contact.name)};;;;`,
  ]
  if (contact.org) lines.push(`ORG:${escapeVcardText(contact.org)}`)
  if (contact.phone) lines.push(`TEL:${escapeVcardText(contact.phone)}`)
  if (contact.email) lines.push(`EMAIL:${escapeVcardText(contact.email)}`)
  if (contact.address) lines.push(`ADR:;;${escapeVcardText(contact.address)};;;`)
  lines.push('END:VCARD')
  return `${lines.join('\r\n')}\r\n`
}

export function buildProductTableRow(product: ExtractedProduct): string {
  const cells = [
    product.name,
    product.price ?? '',
    product.currency ?? '',
    product.specs ?? '',
    product.highlights ?? '',
  ].map((cell) => `"${cell.replace(/"/g, '""')}"`)
  return cells.join(',')
}
