import { describe, expect, it } from 'vitest'
import { buildIcsEvent, buildProductTableRow, buildVcard, escapeIcsText } from '@/shared/exporters'

describe('ICS export', () => {
  it('escapes commas/semicolons and flags missing timezones as local', () => {
    expect(escapeIcsText('Hello, there; yes')).toBe('Hello\\, there\\; yes')
    const { ics, usedLocalTz } = buildIcsEvent({
      type: 'event',
      title: 'Meetup, Tokyo',
      start: '2026-08-13T19:00:00',
      end: '2026-08-13T21:00:00',
      location: 'Shibuya',
    })
    expect(usedLocalTz).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Meetup\\, Tokyo')
    expect(ics).toContain('X-NT-TZ-NOTE:Source had no timezone; times are local')
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('keeps zoned timestamps in UTC form', () => {
    const { ics, usedLocalTz } = buildIcsEvent({
      type: 'event',
      title: 'Call',
      start: '2026-08-13T10:00:00Z',
      end: '2026-08-13T11:00:00Z',
    })
    expect(usedLocalTz).toBe(false)
    expect(ics).toMatch(/DTSTART:20260813T100000Z/)
  })
})

describe('vCard and product row', () => {
  it('emits importable vCard fields', () => {
    const card = buildVcard({
      type: 'contact',
      name: 'Ada Lovelace',
      org: 'Analytical Engines',
      phone: '+44 20 0000',
      email: 'ada@example.com',
      address: 'London',
    })
    expect(card).toContain('BEGIN:VCARD')
    expect(card).toContain('FN:Ada Lovelace')
    expect(card).toContain('ORG:Analytical Engines')
    expect(card).toContain('TEL:+44 20 0000')
    expect(card).toContain('EMAIL:ada@example.com')
    expect(card).toContain('ADR:;;London;;;')
    expect(card).toContain('END:VCARD')
  })

  it('emits a quoted CSV table row for products', () => {
    const row = buildProductTableRow({
      type: 'product',
      name: 'Widget, Mini',
      price: '12.5',
      currency: 'USD',
      specs: 'blue',
      highlights: 'light',
    })
    expect(row).toBe('"Widget, Mini","12.5","USD","blue","light"')
  })
})
