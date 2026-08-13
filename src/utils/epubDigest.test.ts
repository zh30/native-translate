import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { addDigestToEpubBlob, buildDigestXhtml, injectDigestIntoOpf } from '@/utils/epubDigest'

describe('EPUB digest helpers', () => {
  it('renders bilingual chapter points', () => {
    const xhtml = buildDigestXhtml({
      title: 'Moby Dick',
      chapters: [
        {
          id: 'c1',
          title: 'Loomings',
          points: ['Ishmael goes to sea'],
          pointsOriginal: ['Call me Ishmael.'],
        },
      ],
    })
    expect(xhtml).toContain('Ishmael goes to sea')
    expect(xhtml).toContain('Call me Ishmael.')
    expect(xhtml).toContain('digest-original')
  })

  it('injects digest.xhtml at the front of the spine', async () => {
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
    )
    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0"?><package><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`,
    )
    zip.file('OEBPS/ch1.xhtml', '<html><body>hi</body></html>')
    const blob = await zip.generateAsync({ type: 'blob' })
    const next = await addDigestToEpubBlob(blob, {
      title: 'Book',
      chapters: [{ id: 'c1', title: 'One', points: ['Point'] }],
    })
    const out = await JSZip.loadAsync(next)
    expect(out.file('OEBPS/digest.xhtml')).toBeTruthy()
    const opf = await out.file('OEBPS/content.opf')?.async('text')
    expect(opf).toContain('id="nt-digest"')
    expect(opf?.indexOf('idref="nt-digest"') ?? -1).toBeLessThan(opf?.indexOf('idref="ch1"') ?? 0)
    expect(
      injectDigestIntoOpf('<package><manifest></manifest><spine></spine></package>', {
        id: 'nt-digest',
        href: 'digest.xhtml',
      }),
    ).toContain('digest.xhtml')
  })
})
