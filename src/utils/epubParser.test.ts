import { type TextSegment, generateTranslatedEpub, parseEpubFile } from '@/utils/epubParser'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

const CONTENT_OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Unit Test</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier>urn:test:book</dc:identifier>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`

async function createEpubFile(chapterXhtml: string, fileName = 'test.epub'): Promise<File> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', CONTAINER_XML)
  zip.file('OEBPS/content.opf', CONTENT_OPF)
  zip.file('OEBPS/ch1.xhtml', chapterXhtml)
  const bytes = await zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' })
  const fileLike = {
    name: fileName,
    size: bytes.byteLength,
    type: 'application/epub+zip',
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
  return fileLike as unknown as File
}

async function createEpubFileWithPaths({
  chapterPath,
  chapterXhtml,
  containerXml,
  contentOpf,
  fileName = 'test.epub',
  opfPath,
}: {
  chapterPath: string
  chapterXhtml: string
  containerXml: string
  contentOpf: string
  fileName?: string
  opfPath: string
}): Promise<File> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', containerXml)
  zip.file(opfPath, contentOpf)
  zip.file(chapterPath, chapterXhtml)
  const bytes = await zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' })
  const fileLike = {
    name: fileName,
    size: bytes.byteLength,
    type: 'application/epub+zip',
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
  return fileLike as unknown as File
}

async function readChapterFromEpub(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(blob as unknown as Blob)
  const chapter = zip.file('OEBPS/ch1.xhtml')
  if (!chapter) throw new Error('Missing chapter in translated epub')
  return chapter.async('text')
}

async function readOpfFromEpub(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(blob as unknown as Blob)
  const opf = zip.file('OEBPS/content.opf')
  if (!opf) throw new Error('Missing OPF in translated epub')
  return opf.async('text')
}

describe('epubParser paragraph mapping', () => {
  it('extracts namespaced EPUB package metadata', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Metadata test chapter body content.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'metadata.epub')

    const { book } = await parseEpubFile(file)

    expect(book.metadata).toEqual({
      title: 'Test Book',
      author: 'Unit Test',
      language: 'en',
      identifier: 'urn:test:book',
    })
  })

  it('prefers body headings over document title for EPUB chapter titles', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <title>Generic book title from the XHTML head.</title>
      </head>
      <body>
        <h3>Specific chapter heading from the body.</h3>
        <p>Chapter body content used for title extraction coverage.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'chapter-heading-title.epub')

    const { book } = await parseEpubFile(file)

    expect(book.chapters[0]?.title).toBe('Specific chapter heading from the body.')
  })

  it('skips hidden and no-translate headings for EPUB chapter titles', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <title>Fallback document title.</title>
      </head>
      <body>
        <h1 hidden="">Hidden heading should not name the chapter.</h1>
        <section translate="no">
          <h2>Protected heading should not name the chapter.</h2>
        </section>
        <h4>Visible chapter heading should be used.</h4>
        <p>Chapter body content used for hidden heading coverage.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'chapter-visible-heading-title.epub')

    const { book } = await parseEpubFile(file)

    expect(book.chapters[0]?.title).toBe('Visible chapter heading should be used.')
  })

  it('ignores existing native-translate nodes during segment extraction', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Original paragraph one for translation coverage.</p>
        <p class="native-translate-translation">Translated paragraph one that should be ignored.</p>
        <p>Original paragraph two for translation coverage.</p>
        <p class="native-translate-translation">Translated paragraph two that should be ignored.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'with-existing-translation.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.length).toBe(2)
    expect(segments.map((s) => s.originalText)).toEqual([
      'Original paragraph one for translation coverage.',
      'Original paragraph two for translation coverage.',
    ])
  })

  it('does not duplicate nested blockquote paragraph segments', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <blockquote>
          <p>Quoted paragraph should be translated once in the generated EPUB.</p>
        </blockquote>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'nested-blockquote.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Quoted paragraph should be translated once in the generated EPUB.',
    ])
  })

  it('extracts standalone div paragraphs from EPUB chapters', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <div class="paragraph">Standalone div paragraph should be translated from the EPUB.</div>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'standalone-div.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Standalone div paragraph should be translated from the EPUB.',
    ])
    expect(segments[0]?.elementType).toBe('div')
  })

  it('extracts standalone span text without splitting paragraph inline spans', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <span>Standalone inline note exported by the EPUB tool.</span>
        <p>Paragraph with an <span>inline phrase</span> should stay together.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'standalone-span.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Standalone inline note exported by the EPUB tool.',
      'Paragraph with an inline phrase should stay together.',
    ])
    expect(segments.map((segment) => segment.elementType)).toEqual(['span', 'p'])

    const spanSegment = segments.find((segment) => segment.elementType === 'span')
    const translatedSegments: TextSegment[] = spanSegment
      ? [{ ...spanSegment, translatedText: 'Nota independiente traducida.' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('Nota independiente traducida.')
    expect(translatedChapter).toContain('native-translate-translation')
    expect(translatedChapter).toContain(
      'Paragraph with an <span>inline phrase</span> should stay together.',
    )
  })

  it('translates standalone link text in place without splitting paragraph links', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <a href="#chapter-two">Continue reading the next translated chapter.</a>
        <p>Paragraph with an <a href="#note">inline reference link</a> should stay together.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'standalone-link.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Continue reading the next translated chapter.',
      'Paragraph with an inline reference link should stay together.',
    ])
    expect(segments.map((segment) => segment.elementType)).toEqual(['a', 'p'])

    const linkSegment = segments.find((segment) => segment.elementType === 'a')
    const translatedSegments: TextSegment[] = linkSegment
      ? [{ ...linkSegment, translatedText: 'Continuar al siguiente capitulo traducido.' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      '<a href="#chapter-two">Continuar al siguiente capitulo traducido.</a>',
    )
    expect(translatedChapter).toContain(
      'Paragraph with an <a href="#note">inline reference link</a> should stay together.',
    )
    expect(translatedChapter).not.toContain('Continue reading the next translated chapter.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates standalone emphasis text without splitting paragraph emphasis', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <strong>Important standalone warning for translated readers.</strong>
        <p>Paragraph with <em>inline emphasis text</em> should stay together.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'standalone-emphasis.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Important standalone warning for translated readers.',
      'Paragraph with inline emphasis text should stay together.',
    ])
    expect(segments.map((segment) => segment.elementType)).toEqual(['strong', 'p'])

    const strongSegment = segments.find((segment) => segment.elementType === 'strong')
    const translatedSegments: TextSegment[] = strongSegment
      ? [{ ...strongSegment, translatedText: 'Advertencia importante traducida.' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('<strong>Advertencia importante traducida.</strong>')
    expect(translatedChapter).toContain(
      'Paragraph with <em>inline emphasis text</em> should stay together.',
    )
    expect(translatedChapter).not.toContain('Important standalone warning for translated readers.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('extracts table captions and cells from EPUB chapters', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <caption>Quarterly account revenue table.</caption>
          <thead>
            <tr>
              <th>Subscription plan name.</th>
              <th>Revenue for current quarter.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Business translator plan.</td>
              <td>Revenue increased steadily.</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-content.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Quarterly account revenue table.',
      'Subscription plan name.',
      'Revenue for current quarter.',
      'Business translator plan.',
      'Revenue increased steadily.',
    ])
    expect(segments.map((segment) => segment.elementType)).toEqual([
      'caption',
      'th',
      'th',
      'td',
      'td',
    ])
  })

  it('translates EPUB table cell visible text in place', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <thead>
            <tr>
              <th>Subscription plan name.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Business translator plan.</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-cell-visible-text.epub')
    const { book, segments } = await parseEpubFile(file)
    const tableSegments = segments.filter(
      (segment) =>
        (segment.elementType === 'th' || segment.elementType === 'td') && !segment.attributeName,
    )

    expect(tableSegments.map((segment) => segment.originalText)).toEqual([
      'Subscription plan name.',
      'Business translator plan.',
    ])

    const translatedSegments: TextSegment[] = tableSegments.map((segment) => ({
      ...segment,
      translatedText:
        segment.elementType === 'th' ? 'Nombre del plan traducido.' : 'Plan empresarial traducido.',
    }))
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter.match(/<th[\s>]/g) ?? []).toHaveLength(1)
    expect(translatedChapter.match(/<td[\s>]/g) ?? []).toHaveLength(1)
    expect(translatedChapter).toContain('<th>Nombre del plan traducido.</th>')
    expect(translatedChapter).toContain('<td>Plan empresarial traducido.</td>')
    expect(translatedChapter).not.toContain('Subscription plan name.')
    expect(translatedChapter).not.toContain('Business translator plan.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table caption visible text in place', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <caption>Quarterly account revenue table.</caption>
          <tbody>
            <tr>
              <td>Business translator plan.</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-caption-visible-text.epub')
    const { book, segments } = await parseEpubFile(file)
    const captionSegment = segments.find(
      (segment) => segment.elementType === 'caption' && !segment.attributeName,
    )

    expect(captionSegment?.originalText).toBe('Quarterly account revenue table.')

    const translatedSegments: TextSegment[] = captionSegment
      ? [{ ...captionSegment, translatedText: 'Tabla trimestral traducida.' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter.match(/<caption[\s>]/g) ?? []).toHaveLength(1)
    expect(translatedChapter).toContain('<caption>Tabla trimestral traducida.</caption>')
    expect(translatedChapter).not.toContain('Quarterly account revenue table.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB caption title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <caption title="Hover note for translated table totals"></caption>
          <tbody>
            <tr>
              <td>Business translator plan.</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'caption-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for translated table totals',
    )
    const captionSegment = segments.find(
      (segment) => segment.elementType === 'caption' && segment.attributeName === 'title',
    )
    expect(captionSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = captionSegment
      ? [{ ...captionSegment, translatedText: 'Nota flotante para totales traducidos' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para totales traducidos"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table summary attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table summary="Quarterly revenue summary for subscription plans">
          <tbody>
            <tr>
              <td>Business translator plan.</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-summary.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Quarterly revenue summary for subscription plans',
    )
    const summarySegment = segments.find(
      (segment) => segment.elementType === 'table' && segment.attributeName === 'summary',
    )
    expect(summarySegment).toBeTruthy()

    const translatedSegments: TextSegment[] = summarySegment
      ? [{ ...summarySegment, translatedText: 'Resumen trimestral de ingresos por planes' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('summary="Resumen trimestral de ingresos por planes"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table header title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <thead>
            <tr>
              <th title="Hover note for translated table header"></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Business translator plan.</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-header-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for translated table header',
    )
    const headerSegment = segments.find(
      (segment) => segment.elementType === 'th' && segment.attributeName === 'title',
    )
    expect(headerSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = headerSegment
      ? [{ ...headerSegment, translatedText: 'Nota flotante para encabezado traducido' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para encabezado traducido"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table cell title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <tbody>
            <tr>
              <td title="Hover note for translated table cell"></td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-cell-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for translated table cell',
    )
    const cellSegment = segments.find(
      (segment) => segment.elementType === 'td' && segment.attributeName === 'title',
    )
    expect(cellSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = cellSegment
      ? [{ ...cellSegment, translatedText: 'Nota flotante para celda traducida' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para celda traducida"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table row title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <tbody>
            <tr title="Hover note for translated table row">
              <td></td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-row-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for translated table row',
    )
    const rowSegment = segments.find(
      (segment) => segment.elementType === 'tr' && segment.attributeName === 'title',
    )
    expect(rowSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = rowSegment
      ? [{ ...rowSegment, translatedText: 'Nota flotante para fila traducida' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para fila traducida"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table head title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <thead title="Hover note for translated table head">
            <tr>
              <th></th>
            </tr>
          </thead>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-head-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for translated table head',
    )
    const headSegment = segments.find(
      (segment) => segment.elementType === 'thead' && segment.attributeName === 'title',
    )
    expect(headSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = headSegment
      ? [{ ...headSegment, translatedText: 'Nota flotante para cabecera de tabla traducida' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para cabecera de tabla traducida"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table body title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <tbody title="Hover note for translated table body">
            <tr>
              <td></td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-body-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for translated table body',
    )
    const bodySegment = segments.find(
      (segment) => segment.elementType === 'tbody' && segment.attributeName === 'title',
    )
    expect(bodySegment).toBeTruthy()

    const translatedSegments: TextSegment[] = bodySegment
      ? [{ ...bodySegment, translatedText: 'Nota flotante para cuerpo de tabla traducido' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para cuerpo de tabla traducido"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table foot title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <tfoot title="Hover note for translated table foot">
            <tr>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-foot-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for translated table foot',
    )
    const footSegment = segments.find(
      (segment) => segment.elementType === 'tfoot' && segment.attributeName === 'title',
    )
    expect(footSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = footSegment
      ? [{ ...footSegment, translatedText: 'Nota flotante para pie de tabla traducido' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para pie de tabla traducido"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table column group title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <colgroup title="Hover note for translated column group">
            <col span="2" />
          </colgroup>
          <tbody>
            <tr>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-column-group-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for translated column group',
    )
    const columnGroupSegment = segments.find(
      (segment) => segment.elementType === 'colgroup' && segment.attributeName === 'title',
    )
    expect(columnGroupSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = columnGroupSegment
      ? [
          {
            ...columnGroupSegment,
            translatedText: 'Nota flotante para grupo de columnas traducido',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para grupo de columnas traducido"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB table column title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <colgroup>
            <col title="Hover note for translated column" />
          </colgroup>
          <tbody>
            <tr>
              <td></td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'table-column-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for translated column',
    )
    const columnSegment = segments.find(
      (segment) => segment.elementType === 'col' && segment.attributeName === 'title',
    )
    expect(columnSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = columnSegment
      ? [{ ...columnSegment, translatedText: 'Nota flotante para columna traducida' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para columna traducida"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('includes table text in EPUB chapter content previews', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <table>
          <caption>Quarterly account revenue table.</caption>
          <tbody>
            <tr>
              <td>Business translator plan.</td>
              <td>Revenue grew faster than expected.</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'chapter-table-preview.epub')

    const { book } = await parseEpubFile(file)

    expect(book.chapters[0]?.content).toContain('Quarterly account revenue table.')
    expect(book.chapters[0]?.content).toContain('Business translator plan.')
    expect(book.chapters[0]?.content).toContain('Revenue grew faster than expected.')
  })

  it('includes translatable attribute text in EPUB chapter content previews', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <figure>
          <img src="workflow.png" alt="Workflow diagram explaining file translation steps."/>
        </figure>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'chapter-attribute-preview.epub')

    const { book } = await parseEpubFile(file)

    expect(book.chapters[0]?.content).toContain(
      'Workflow diagram explaining file translation steps.',
    )
  })

  it('keeps EPUB attribute and text segments in DOM reading order', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <img src="cover.png" alt="Cover image introducing the translation workflow."/>
        <p>Opening paragraph that follows the cover image.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'attribute-reading-order.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Cover image introducing the translation workflow.',
      'Opening paragraph that follows the cover image.',
    ])
    expect(segments.map((segment) => segment.attributeName ?? null)).toEqual(['alt', null])
  })

  it('extracts definition list terms and descriptions from EPUB chapters', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <dl>
          <dt>Translation memory entry.</dt>
          <dd>Reusable source and target phrase pair.</dd>
        </dl>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'definition-list.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Translation memory entry.',
      'Reusable source and target phrase pair.',
    ])
    expect(segments.map((segment) => segment.elementType)).toEqual(['dt', 'dd'])
  })

  it('translates EPUB definition list visible text in place', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <dl>
          <dt>Translation memory entry.</dt>
          <dd>Reusable source and target phrase pair.</dd>
        </dl>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'definition-list-visible-text.epub')
    const { book, segments } = await parseEpubFile(file)
    const listSegments = segments.filter(
      (segment) =>
        (segment.elementType === 'dt' || segment.elementType === 'dd') && !segment.attributeName,
    )

    expect(listSegments.map((segment) => segment.originalText)).toEqual([
      'Translation memory entry.',
      'Reusable source and target phrase pair.',
    ])

    const translatedSegments: TextSegment[] = listSegments.map((segment) => ({
      ...segment,
      translatedText:
        segment.elementType === 'dt'
          ? 'Entrada de memoria traducida.'
          : 'Par reutilizable traducido.',
    }))
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter.match(/<dt[\s>]/g) ?? []).toHaveLength(1)
    expect(translatedChapter.match(/<dd[\s>]/g) ?? []).toHaveLength(1)
    expect(translatedChapter).toContain('<dt>Entrada de memoria traducida.</dt>')
    expect(translatedChapter).toContain('<dd>Par reutilizable traducido.</dd>')
    expect(translatedChapter).not.toContain('Translation memory entry.')
    expect(translatedChapter).not.toContain('Reusable source and target phrase pair.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('extracts figure captions from EPUB chapters', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <figure>
          <img src="diagram.png" alt="diagram"/>
          <figcaption>Diagram showing the document translation workflow.</figcaption>
        </figure>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'figure-caption.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Diagram showing the document translation workflow.',
    ])
    expect(segments[0]?.elementType).toBe('figcaption')
  })

  it('translates EPUB figure caption visible text in place', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <figure>
          <img src="diagram.png" alt="diagram"/>
          <figcaption>Diagram showing the document translation workflow.</figcaption>
        </figure>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'figure-caption-visible-text.epub')
    const { book, segments } = await parseEpubFile(file)
    const captionSegment = segments.find(
      (segment) => segment.elementType === 'figcaption' && !segment.attributeName,
    )

    expect(captionSegment?.originalText).toBe('Diagram showing the document translation workflow.')

    const translatedSegments: TextSegment[] = captionSegment
      ? [{ ...captionSegment, translatedText: 'Diagrama del flujo de traduccion.' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter.match(/<figcaption[\s>]/g) ?? []).toHaveLength(1)
    expect(translatedChapter).toContain(
      '<figcaption>Diagrama del flujo de traduccion.</figcaption>',
    )
    expect(translatedChapter).not.toContain('Diagram showing the document translation workflow.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('extracts details summary text from EPUB chapters', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <details>
          <summary>Reveal additional translator notes.</summary>
          <p>These notes explain the translated terminology choices.</p>
        </details>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'details-summary.epub')
    const { book, segments } = await parseEpubFile(file)

    const summarySegment = segments.find((segment) => segment.elementType === 'summary')

    expect(summarySegment?.originalText).toBe('Reveal additional translator notes.')

    const translatedSegments: TextSegment[] = summarySegment
      ? [{ ...summarySegment, translatedText: 'Mostrar notas adicionales del traductor.' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      '<summary>Mostrar notas adicionales del traductor.</summary>',
    )
    expect(translatedChapter).not.toContain('Reveal additional translator notes.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB summary title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <details>
          <summary title="Toggle the translated terminology explanation"></summary>
          <p>These notes explain the translated terminology choices.</p>
        </details>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'summary-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Toggle the translated terminology explanation',
    )
    const summarySegment = segments.find(
      (segment) => segment.elementType === 'summary' && segment.attributeName === 'title',
    )
    expect(summarySegment).toBeTruthy()

    const translatedSegments: TextSegment[] = summarySegment
      ? [
          {
            ...summarySegment,
            translatedText: 'Alterna la explicacion de terminologia traducida',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Alterna la explicacion de terminologia traducida"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('extracts visible form label text from EPUB chapters', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <label for="reflection">Choose the best translation strategy for this passage.</label>
          <textarea id="reflection"></textarea>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'form-label.epub')
    const { book, segments } = await parseEpubFile(file)

    const labelSegment = segments.find((segment) => segment.elementType === 'label')

    expect(labelSegment?.originalText).toBe(
      'Choose the best translation strategy for this passage.',
    )

    const translatedSegments: TextSegment[] = labelSegment
      ? [{ ...labelSegment, translatedText: 'Elige la mejor estrategia de traduccion.' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      '<label for="reflection">Elige la mejor estrategia de traduccion.</label>',
    )
    expect(translatedChapter).toContain('<textarea id="reflection"></textarea>')
    expect(translatedChapter).not.toContain(
      'Choose the best translation strategy for this passage.',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('extracts visible fieldset legend text from EPUB chapters', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <fieldset>
            <legend>Select the correct translation register for each speaker.</legend>
            <label><input type="radio" name="register"/> Formal</label>
          </fieldset>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'fieldset-legend.epub')
    const { book, segments } = await parseEpubFile(file)

    const legendSegment = segments.find((segment) => segment.elementType === 'legend')

    expect(legendSegment?.originalText).toBe(
      'Select the correct translation register for each speaker.',
    )

    const translatedSegments: TextSegment[] = legendSegment
      ? [{ ...legendSegment, translatedText: 'Selecciona el registro correcto.' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('<legend>Selecciona el registro correcto.</legend>')
    expect(translatedChapter).toContain('<input type="radio" name="register" /> Formal')
    expect(translatedChapter).not.toContain(
      'Select the correct translation register for each speaker.',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB legend title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <fieldset>
            <legend title="Answer group for translated dialogue tone"></legend>
            <label><input type="radio" name="tone"/> Formal</label>
          </fieldset>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'legend-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Answer group for translated dialogue tone',
    )
    const legendSegment = segments.find(
      (segment) => segment.elementType === 'legend' && segment.attributeName === 'title',
    )
    expect(legendSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = legendSegment
      ? [
          {
            ...legendSegment,
            translatedText: 'Grupo de respuestas para el tono del dialogo traducido',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'title="Grupo de respuestas para el tono del dialogo traducido"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB fieldset aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <fieldset aria-label="Translated dialogue tone question group">
            <label><input type="radio" name="tone"/> Formal</label>
          </fieldset>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'fieldset-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Translated dialogue tone question group',
    )
    const fieldsetSegment = segments.find(
      (segment) => segment.elementType === 'fieldset' && segment.attributeName === 'aria-label',
    )
    expect(fieldsetSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = fieldsetSegment
      ? [
          {
            ...fieldsetSegment,
            translatedText: 'Grupo de preguntas sobre el tono del dialogo traducido',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-label="Grupo de preguntas sobre el tono del dialogo traducido"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB fieldset title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <fieldset title="Choose the register that best matches the translated speaker">
            <label><input type="radio" name="tone"/> Formal</label>
          </fieldset>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'fieldset-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Choose the register that best matches the translated speaker',
    )
    const fieldsetSegment = segments.find(
      (segment) => segment.elementType === 'fieldset' && segment.attributeName === 'title',
    )
    expect(fieldsetSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = fieldsetSegment
      ? [
          {
            ...fieldsetSegment,
            translatedText: 'Elige el registro que mejor coincide con el hablante traducido',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'title="Elige el registro que mejor coincide con el hablante traducido"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('extracts standalone aside notes from EPUB chapters', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <aside>Translator note explaining the cultural context.</aside>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'aside-note.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Translator note explaining the cultural context.',
    ])
    expect(segments[0]?.elementType).toBe('aside')
  })

  it('extracts standalone landmark text from EPUB chapters', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <header>Chapter introduction for the translated edition.</header>
        <nav>Return to the interactive table of contents.</nav>
        <footer>End notes prepared by the original publisher.</footer>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'landmark-text.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Chapter introduction for the translated edition.',
      'Return to the interactive table of contents.',
      'End notes prepared by the original publisher.',
    ])
    expect(segments.map((segment) => segment.elementType)).toEqual(['header', 'nav', 'footer'])
  })

  it('resolves normalized and decoded manifest hrefs for EPUB chapters', async () => {
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/package/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`
    const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
    <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Path Test Book</dc:title>
        <dc:creator>Unit Test</dc:creator>
        <dc:language>en</dc:language>
        <dc:identifier>urn:test:path-book</dc:identifier>
      </metadata>
      <manifest>
        <item id="ch1" href="../Text/chapter%201.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="ch1"/>
      </spine>
    </package>`
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Encoded chapter path should still be translated.</p>
      </body>
    </html>`
    const file = await createEpubFileWithPaths({
      chapterPath: 'OEBPS/Text/chapter 1.xhtml',
      chapterXhtml: chapter,
      containerXml,
      contentOpf,
      fileName: 'encoded-path.epub',
      opfPath: 'OEBPS/package/content.opf',
    })

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Encoded chapter path should still be translated.',
    ])
  })

  it('skips EPUB segments inside no-translate containers', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Regular paragraph should still be translated.</p>
        <section translate="no">
          <p>Protected translate no paragraph should stay original.</p>
        </section>
        <section class="notranslate">
          <p>Protected class paragraph should stay original.</p>
        </section>
        <section data-no-translate="true">
          <p>Protected data attribute paragraph should stay original.</p>
        </section>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'no-translate.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Regular paragraph should still be translated.',
    ])
  })

  it('skips EPUB segments inside hidden containers', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Visible paragraph should still be translated.</p>
        <section hidden="">
          <p>Hidden paragraph should stay out of translation.</p>
        </section>
        <section aria-hidden="true">
          <p>Aria hidden paragraph should stay out of translation.</p>
        </section>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'hidden-content.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Visible paragraph should still be translated.',
    ])
  })

  it('skips EPUB segments hidden by inline styles', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Readable paragraph should still be translated.</p>
        <section style="display: none">
          <p>Display none paragraph should stay out of translation.</p>
        </section>
        <section style="visibility: hidden">
          <p>Visibility hidden paragraph should stay out of translation.</p>
        </section>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'inline-hidden-content.epub')

    const { segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Readable paragraph should still be translated.',
    ])
  })

  it('does not inject fallback translations into no-translate elements', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <section translate="no">
          <p>Protected paragraph should not receive fallback output.</p>
        </section>
        <p>Readable paragraph should receive fallback output.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'fallback-no-translate.epub')
    const { book, segments } = await parseEpubFile(file)

    const translatedSegments: TextSegment[] = segments.map((segment) => ({
      ...segment,
      domPath: 'body > p:nth-of-type(999)',
      translatedText: 'translated fallback output',
    }))

    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('Protected paragraph should not receive fallback output.')
    expect(translatedChapter).toContain(
      '<p>Readable paragraph should receive fallback output.</p><p class="native-translate-translation">translated fallback output</p>',
    )
    expect(translatedChapter).not.toContain(
      '<p>Protected paragraph should not receive fallback output.</p><p class="native-translate-translation">translated fallback output</p>',
    )
  })

  it('translates EPUB image alt attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <figure>
          <img src="diagram.png" alt="Diagram showing workflow steps clearly."/>
        </figure>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'image-alt.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Diagram showing workflow steps clearly.',
    ])
    expect(segments[0]?.attributeName).toBe('alt')

    const translatedSegments: TextSegment[] = segments.map((segment) => ({
      ...segment,
      translatedText: 'Diagrama que muestra claramente los pasos del flujo.',
    }))
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'alt="Diagrama que muestra claramente los pasos del flujo."',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB image title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <figure>
          <img src="diagram.png" title="Workflow diagram hover description."/>
        </figure>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'image-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Workflow diagram hover description.',
    ])
    expect(segments[0]?.attributeName).toBe('title')

    const translatedSegments: TextSegment[] = segments.map((segment) => ({
      ...segment,
      translatedText: 'Descripcion emergente del diagrama de flujo.',
    }))
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Descripcion emergente del diagrama de flujo."')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB link title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p><a href="#note" title="Footnote explaining the historical reference.">[1]</a></p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'link-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Footnote explaining the historical reference.',
    ])
    expect(segments[0]?.attributeName).toBe('title')
    expect(segments[0]?.elementType).toBe('a')

    const translatedSegments: TextSegment[] = segments.map((segment) => ({
      ...segment,
      translatedText: 'Nota al pie que explica la referencia historica.',
    }))
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota al pie que explica la referencia historica."')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB abbreviation title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p><abbr title="Application programming interface">API</abbr> clients can reuse glossary terms.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'abbr-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Application programming interface',
    )
    const abbrSegment = segments.find((segment) => segment.elementType === 'abbr')
    expect(abbrSegment?.attributeName).toBe('title')

    const translatedSegments: TextSegment[] = abbrSegment
      ? [{ ...abbrSegment, translatedText: 'Interfaz de programacion de aplicaciones' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Interfaz de programacion de aplicaciones"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB definition title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p><dfn title="A culturally specific idiom explained for readers">local saying</dfn> appears in the translated notes.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'definition-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'A culturally specific idiom explained for readers',
    )
    const definitionSegment = segments.find(
      (segment) => segment.elementType === 'dfn' && segment.attributeName === 'title',
    )
    expect(definitionSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = definitionSegment
      ? [{ ...definitionSegment, translatedText: 'Un modismo cultural explicado para lectores' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Un modismo cultural explicado para lectores"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB label title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <label title="Choose whether the translation preserves the original tone">
            <input type="checkbox"/>
          </label>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'label-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Choose whether the translation preserves the original tone',
    )
    const labelSegment = segments.find(
      (segment) => segment.elementType === 'label' && segment.attributeName === 'title',
    )
    expect(labelSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = labelSegment
      ? [
          {
            ...labelSegment,
            translatedText: 'Elige si la traduccion conserva el tono original',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Elige si la traduccion conserva el tono original"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <a href="#next" aria-label="Go to the next translated chapter">Next</a>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Go to the next translated chapter',
    )
    const ariaSegment = segments.find((segment) => segment.attributeName === 'aria-label')
    expect(ariaSegment?.elementType).toBe('a')

    const translatedSegments: TextSegment[] = ariaSegment
      ? [{ ...ariaSegment, translatedText: 'Ir al siguiente capitulo traducido' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Ir al siguiente capitulo traducido"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB section aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <section aria-label="Supplemental reading questions">
          <p>Question prompt should still be translated normally.</p>
        </section>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'section-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Supplemental reading questions',
    )
    const ariaSegment = segments.find(
      (segment) => segment.elementType === 'section' && segment.attributeName === 'aria-label',
    )
    expect(ariaSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = ariaSegment
      ? [{ ...ariaSegment, translatedText: 'Preguntas de lectura complementarias' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Preguntas de lectura complementarias"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB figure aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <figure aria-label="Revenue chart comparing translation plan growth">
          <img src="chart.png" alt="Revenue chart"/>
        </figure>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'figure-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Revenue chart comparing translation plan growth',
    )
    const figureSegment = segments.find(
      (segment) => segment.elementType === 'figure' && segment.attributeName === 'aria-label',
    )
    expect(figureSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = figureSegment
      ? [{ ...figureSegment, translatedText: 'Grafico de ingresos comparando el crecimiento' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-label="Grafico de ingresos comparando el crecimiento"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB figure title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <figure title="Hover description for the translated workflow diagram">
          <img src="diagram.png" alt="Workflow diagram"/>
        </figure>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'figure-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover description for the translated workflow diagram',
    )
    const figureSegment = segments.find(
      (segment) => segment.elementType === 'figure' && segment.attributeName === 'title',
    )
    expect(figureSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = figureSegment
      ? [
          {
            ...figureSegment,
            translatedText: 'Descripcion flotante para el diagrama de flujo traducido',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'title="Descripcion flotante para el diagrama de flujo traducido"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB figcaption title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <figure>
          <img src="timeline.png" alt="Translation timeline"/>
          <figcaption title="Hover note for the translated caption"></figcaption>
        </figure>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'figcaption-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for the translated caption',
    )
    const captionSegment = segments.find(
      (segment) => segment.elementType === 'figcaption' && segment.attributeName === 'title',
    )
    expect(captionSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = captionSegment
      ? [{ ...captionSegment, translatedText: 'Nota flotante para el pie traducido' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para el pie traducido"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB nav aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <nav aria-label="Supplemental chapter navigation">
          <ol>
            <li><a href="#chapter-two">Next chapter</a></li>
          </ol>
        </nav>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'nav-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Supplemental chapter navigation',
    )
    const navSegment = segments.find(
      (segment) => segment.elementType === 'nav' && segment.attributeName === 'aria-label',
    )
    expect(navSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = navSegment
      ? [{ ...navSegment, translatedText: 'Navegacion complementaria del capitulo' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Navegacion complementaria del capitulo"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB aside aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <aside aria-label="Translator note about regional terminology">
          <p>This note explains why the local phrase was preserved.</p>
        </aside>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'aside-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Translator note about regional terminology',
    )
    const asideSegment = segments.find(
      (segment) => segment.elementType === 'aside' && segment.attributeName === 'aria-label',
    )
    expect(asideSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = asideSegment
      ? [{ ...asideSegment, translatedText: 'Nota del traductor sobre terminologia regional' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-label="Nota del traductor sobre terminologia regional"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB footer aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <footer aria-label="Publisher footnotes and source citations">
          <p>Copyright and source citation text.</p>
        </footer>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'footer-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Publisher footnotes and source citations',
    )
    const footerSegment = segments.find(
      (segment) => segment.elementType === 'footer' && segment.attributeName === 'aria-label',
    )
    expect(footerSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = footerSegment
      ? [{ ...footerSegment, translatedText: 'Notas del editor y citas de origen' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Notas del editor y citas de origen"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB header aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <header aria-label="Chapter introduction and edition notes">
          <p>Introduction prepared for the translated edition.</p>
        </header>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'header-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Chapter introduction and edition notes',
    )
    const headerSegment = segments.find(
      (segment) => segment.elementType === 'header' && segment.attributeName === 'aria-label',
    )
    expect(headerSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = headerSegment
      ? [{ ...headerSegment, translatedText: 'Introduccion del capitulo y notas de edicion' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Introduccion del capitulo y notas de edicion"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB main aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <main aria-label="Primary chapter content and reading flow">
          <p>Main chapter paragraph for the translated edition.</p>
        </main>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'main-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Primary chapter content and reading flow',
    )
    const mainSegment = segments.find(
      (segment) => segment.elementType === 'main' && segment.attributeName === 'aria-label',
    )
    expect(mainSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = mainSegment
      ? [{ ...mainSegment, translatedText: 'Contenido principal y flujo de lectura' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Contenido principal y flujo de lectura"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB article aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <article aria-label="Standalone appendix essay">
          <p>Appendix paragraph included in the translated edition.</p>
        </article>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'article-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain('Standalone appendix essay')
    const articleSegment = segments.find(
      (segment) => segment.elementType === 'article' && segment.attributeName === 'aria-label',
    )
    expect(articleSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = articleSegment
      ? [{ ...articleSegment, translatedText: 'Ensayo independiente del apendice' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Ensayo independiente del apendice"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB details aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <details aria-label="Expandable translator terminology note">
          <summary>Translator note</summary>
          <p>This note explains the retained source term.</p>
        </details>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'details-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Expandable translator terminology note',
    )
    const detailsSegment = segments.find(
      (segment) => segment.elementType === 'details' && segment.attributeName === 'aria-label',
    )
    expect(detailsSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = detailsSegment
      ? [{ ...detailsSegment, translatedText: 'Nota expandible de terminologia del traductor' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-label="Nota expandible de terminologia del traductor"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB dialog aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <dialog aria-label="Translation comparison dialog"></dialog>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'dialog-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Translation comparison dialog',
    )
    const dialogSegment = segments.find(
      (segment) => segment.elementType === 'dialog' && segment.attributeName === 'aria-label',
    )
    expect(dialogSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = dialogSegment
      ? [{ ...dialogSegment, translatedText: 'Dialogo de comparacion de traducciones' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Dialogo de comparacion de traducciones"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB canvas aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <canvas aria-label="Interactive vocabulary matching chart"></canvas>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'canvas-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Interactive vocabulary matching chart',
    )
    const canvasSegment = segments.find(
      (segment) => segment.elementType === 'canvas' && segment.attributeName === 'aria-label',
    )
    expect(canvasSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = canvasSegment
      ? [{ ...canvasSegment, translatedText: 'Grafico interactivo para emparejar vocabulario' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-label="Grafico interactivo para emparejar vocabulario"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB canvas title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <canvas title="Hover note for the interactive vocabulary chart"></canvas>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'canvas-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for the interactive vocabulary chart',
    )
    const canvasSegment = segments.find(
      (segment) => segment.elementType === 'canvas' && segment.attributeName === 'title',
    )
    expect(canvasSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = canvasSegment
      ? [{ ...canvasSegment, translatedText: 'Nota flotante para el grafico de vocabulario' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante para el grafico de vocabulario"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB details title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <details title="Open to compare the alternate translation note">
          <summary>Translator note</summary>
          <p>This note explains the retained source term.</p>
        </details>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'details-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Open to compare the alternate translation note',
    )
    const detailsSegment = segments.find(
      (segment) => segment.elementType === 'details' && segment.attributeName === 'title',
    )
    expect(detailsSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = detailsSegment
      ? [
          {
            ...detailsSegment,
            translatedText: 'Abre para comparar la nota de traduccion alternativa',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'title="Abre para comparar la nota de traduccion alternativa"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB MathML alttext attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Formula reference:</p>
        <math xmlns="http://www.w3.org/1998/Math/MathML" alttext="Quadratic formula equation">
          <mi>x</mi>
          <mo>=</mo>
          <mfrac>
            <mrow><mo>-</mo><mi>b</mi></mrow>
            <mrow><mn>2</mn><mi>a</mi></mrow>
          </mfrac>
        </math>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'math-alttext.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain('Quadratic formula equation')
    const mathSegment = segments.find(
      (segment) => segment.elementType === 'math' && segment.attributeName === 'alttext',
    )
    expect(mathSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = mathSegment
      ? [{ ...mathSegment, translatedText: 'Ecuacion de formula cuadratica' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('alttext="Ecuacion de formula cuadratica"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB SVG aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Annotated migration route map">
          <path d="M0 0 L10 10"/>
        </svg>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'svg-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Annotated migration route map',
    )
    const svgSegment = segments.find(
      (segment) => segment.elementType === 'svg' && segment.attributeName === 'aria-label',
    )
    expect(svgSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = svgSegment
      ? [{ ...svgSegment, translatedText: 'Mapa anotado de la ruta migratoria' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Mapa anotado de la ruta migratoria"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB SVG title and desc metadata in place', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <svg xmlns="http://www.w3.org/2000/svg" role="img">
          <title>Quarterly revenue trend chart</title>
          <desc>Line chart comparing revenue across the last four quarters</desc>
          <path d="M0 40 L40 20 L80 30 L120 10"/>
        </svg>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'svg-metadata-text.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Quarterly revenue trend chart',
      'Line chart comparing revenue across the last four quarters',
    ])
    const titleSegment = segments.find((segment) => segment.elementType === 'title')
    const descSegment = segments.find((segment) => segment.elementType === 'desc')
    expect(titleSegment).toBeTruthy()
    expect(descSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = []
    if (titleSegment) {
      translatedSegments.push({
        ...titleSegment,
        translatedText: 'Grafico de tendencia de ingresos trimestrales',
      })
    }
    if (descSegment) {
      translatedSegments.push({
        ...descSegment,
        translatedText: 'Grafico lineal que compara ingresos de los ultimos cuatro trimestres',
      })
    }
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      '<title>Grafico de tendencia de ingresos trimestrales</title>',
    )
    expect(translatedChapter).toContain(
      '<desc>Grafico lineal que compara ingresos de los ultimos cuatro trimestres</desc>',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB span aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p><span role="img" aria-label="Vocabulary difficulty icon"></span></p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'span-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain('Vocabulary difficulty icon')
    const spanSegment = segments.find(
      (segment) => segment.elementType === 'span' && segment.attributeName === 'aria-label',
    )
    expect(spanSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = spanSegment
      ? [{ ...spanSegment, translatedText: 'Icono de dificultad de vocabulario' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Icono de dificultad de vocabulario"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB span title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p><span title="Hover note for vocabulary difficulty"></span></p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'span-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Hover note for vocabulary difficulty',
    )
    const spanSegment = segments.find(
      (segment) => segment.elementType === 'span' && segment.attributeName === 'title',
    )
    expect(spanSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = spanSegment
      ? [{ ...spanSegment, translatedText: 'Nota flotante sobre dificultad de vocabulario' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Nota flotante sobre dificultad de vocabulario"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates global EPUB title and aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>
          <mark title="Highlighted glossary warning tooltip"></mark>
          <em aria-label="Emphasized translation tone note"></em>
        </p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'global-text-attributes.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Highlighted glossary warning tooltip',
      'Emphasized translation tone note',
    ])
    const markSegment = segments.find(
      (segment) => segment.elementType === 'mark' && segment.attributeName === 'title',
    )
    const emphasisSegment = segments.find(
      (segment) => segment.elementType === 'em' && segment.attributeName === 'aria-label',
    )
    expect(markSegment).toBeTruthy()
    expect(emphasisSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = []
    if (markSegment) {
      translatedSegments.push({
        ...markSegment,
        translatedText: 'Aviso flotante del glosario resaltado',
      })
    }
    if (emphasisSegment) {
      translatedSegments.push({
        ...emphasisSegment,
        translatedText: 'Nota de tono de traduccion enfatizada',
      })
    }
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Aviso flotante del glosario resaltado"')
    expect(translatedChapter).toContain('aria-label="Nota de tono de traduccion enfatizada"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates global EPUB ARIA description attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>
          <mark aria-description="Glossary warning description for highlighted term"></mark>
          <em aria-roledescription="pronunciation emphasis note"></em>
          <span aria-valuetext="Reader confidence level seven of ten"></span>
        </p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'global-aria-description-attributes.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Glossary warning description for highlighted term',
      'pronunciation emphasis note',
      'Reader confidence level seven of ten',
    ])
    const descriptionSegment = segments.find(
      (segment) => segment.elementType === 'mark' && segment.attributeName === 'aria-description',
    )
    const roleDescriptionSegment = segments.find(
      (segment) => segment.elementType === 'em' && segment.attributeName === 'aria-roledescription',
    )
    const valueTextSegment = segments.find(
      (segment) => segment.elementType === 'span' && segment.attributeName === 'aria-valuetext',
    )
    expect(descriptionSegment).toBeTruthy()
    expect(roleDescriptionSegment).toBeTruthy()
    expect(valueTextSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = []
    if (descriptionSegment) {
      translatedSegments.push({
        ...descriptionSegment,
        translatedText: 'Descripcion de advertencia del glosario para termino resaltado',
      })
    }
    if (roleDescriptionSegment) {
      translatedSegments.push({
        ...roleDescriptionSegment,
        translatedText: 'nota de enfasis de pronunciacion',
      })
    }
    if (valueTextSegment) {
      translatedSegments.push({
        ...valueTextSegment,
        translatedText: 'Nivel de confianza del lector siete de diez',
      })
    }
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-description="Descripcion de advertencia del glosario para termino resaltado"',
    )
    expect(translatedChapter).toContain('aria-roledescription="nota de enfasis de pronunciacion"')
    expect(translatedChapter).toContain(
      'aria-valuetext="Nivel de confianza del lector siete de diez"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates global EPUB tooltip data attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>
          <mark data-tooltip="Tooltip for glossary warning"></mark>
          <em data-tippy-content="Interactive pronunciation helper"></em>
          <span data-placeholder="Reader note placeholder text"></span>
          <strong data-tooltip-content="Extended tooltip content for glossary example"></strong>
        </p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'global-tooltip-data-attributes.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Tooltip for glossary warning',
      'Interactive pronunciation helper',
      'Reader note placeholder text',
      'Extended tooltip content for glossary example',
    ])
    const tooltipSegment = segments.find(
      (segment) => segment.elementType === 'mark' && segment.attributeName === 'data-tooltip',
    )
    const tippySegment = segments.find(
      (segment) => segment.elementType === 'em' && segment.attributeName === 'data-tippy-content',
    )
    const placeholderSegment = segments.find(
      (segment) => segment.elementType === 'span' && segment.attributeName === 'data-placeholder',
    )
    const tooltipContentSegment = segments.find(
      (segment) =>
        segment.elementType === 'strong' && segment.attributeName === 'data-tooltip-content',
    )
    expect(tooltipSegment).toBeTruthy()
    expect(tippySegment).toBeTruthy()
    expect(placeholderSegment).toBeTruthy()
    expect(tooltipContentSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = []
    if (tooltipSegment) {
      translatedSegments.push({
        ...tooltipSegment,
        translatedText: 'Informacion flotante para advertencia del glosario',
      })
    }
    if (tippySegment) {
      translatedSegments.push({
        ...tippySegment,
        translatedText: 'Ayuda interactiva de pronunciacion',
      })
    }
    if (placeholderSegment) {
      translatedSegments.push({
        ...placeholderSegment,
        translatedText: 'Texto de marcador para nota del lector',
      })
    }
    if (tooltipContentSegment) {
      translatedSegments.push({
        ...tooltipContentSegment,
        translatedText: 'Contenido extendido para ejemplo de glosario',
      })
    }
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'data-tooltip="Informacion flotante para advertencia del glosario"',
    )
    expect(translatedChapter).toContain('data-tippy-content="Ayuda interactiva de pronunciacion"')
    expect(translatedChapter).toContain('data-placeholder="Texto de marcador para nota del lector"')
    expect(translatedChapter).toContain(
      'data-tooltip-content="Contenido extendido para ejemplo de glosario"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('skips global EPUB text attributes on non-content elements', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta title="Technical metadata tooltip should not translate"/>
        <link title="Stylesheet title should not translate"/>
      </head>
      <body>
        <script title="Inline script title should not translate"></script>
        <style aria-label="Inline stylesheet label should not translate"></style>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'non-content-global-attributes.epub')
    const { segments } = await parseEpubFile(file)

    expect(segments).toEqual([])
  })

  it('translates EPUB button aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <section>
          <button type="button" aria-label="Reveal the chapter quiz answer"></button>
        </section>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'button-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Reveal the chapter quiz answer',
    )
    const buttonSegment = segments.find(
      (segment) => segment.elementType === 'button' && segment.attributeName === 'aria-label',
    )
    expect(buttonSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = buttonSegment
      ? [{ ...buttonSegment, translatedText: 'Mostrar la respuesta del cuestionario del capitulo' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-label="Mostrar la respuesta del cuestionario del capitulo"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB button title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <section>
          <button type="button" title="Check the annotated answer explanation"></button>
        </section>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'button-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Check the annotated answer explanation',
    )
    const buttonSegment = segments.find(
      (segment) => segment.elementType === 'button' && segment.attributeName === 'title',
    )
    expect(buttonSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = buttonSegment
      ? [{ ...buttonSegment, translatedText: 'Revisar la explicacion anotada de la respuesta' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Revisar la explicacion anotada de la respuesta"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB button visible text in place', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <section>
          <button type="button" data-action="quiz">Reveal annotated glossary note</button>
        </section>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'button-visible-text.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Reveal annotated glossary note',
    )
    const buttonSegment = segments.find(
      (segment) => segment.elementType === 'button' && segment.attributeName === undefined,
    )
    expect(buttonSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = buttonSegment
      ? [{ ...buttonSegment, translatedText: 'Mostrar nota de glosario anotada' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      '<button type="button" data-action="quiz">Mostrar nota de glosario anotada</button>',
    )
    expect(translatedChapter).not.toContain('Reveal annotated glossary note')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB iframe title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <iframe src="interactive-quiz.xhtml" title="Interactive comprehension quiz"></iframe>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'iframe-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Interactive comprehension quiz',
    )
    const iframeSegment = segments.find(
      (segment) => segment.elementType === 'iframe' && segment.attributeName === 'title',
    )
    expect(iframeSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = iframeSegment
      ? [{ ...iframeSegment, translatedText: 'Cuestionario interactivo de comprension' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Cuestionario interactivo de comprension"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB object aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <object data="timeline.svg" type="image/svg+xml" aria-label="Interactive timeline diagram"></object>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'object-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Interactive timeline diagram',
    )
    const objectSegment = segments.find(
      (segment) => segment.elementType === 'object' && segment.attributeName === 'aria-label',
    )
    expect(objectSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = objectSegment
      ? [{ ...objectSegment, translatedText: 'Diagrama interactivo de linea de tiempo' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Diagrama interactivo de linea de tiempo"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB embed aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <embed src="pronunciation.mp3" type="audio/mpeg" aria-label="Pronunciation audio example"/>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'embed-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain('Pronunciation audio example')
    const embedSegment = segments.find(
      (segment) => segment.elementType === 'embed' && segment.attributeName === 'aria-label',
    )
    expect(embedSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = embedSegment
      ? [{ ...embedSegment, translatedText: 'Ejemplo de audio de pronunciacion' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Ejemplo de audio de pronunciacion"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB audio aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <audio controls="" aria-label="Narrated chapter introduction">
          <source src="intro.mp3" type="audio/mpeg"/>
        </audio>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'audio-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Narrated chapter introduction',
    )
    const audioSegment = segments.find(
      (segment) => segment.elementType === 'audio' && segment.attributeName === 'aria-label',
    )
    expect(audioSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = audioSegment
      ? [{ ...audioSegment, translatedText: 'Introduccion narrada del capitulo' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Introduccion narrada del capitulo"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB video aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <video controls="" aria-label="Demonstration video for the experiment">
          <source src="experiment.mp4" type="video/mp4"/>
        </video>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'video-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Demonstration video for the experiment',
    )
    const videoSegment = segments.find(
      (segment) => segment.elementType === 'video' && segment.attributeName === 'aria-label',
    )
    expect(videoSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = videoSegment
      ? [{ ...videoSegment, translatedText: 'Video de demostracion del experimento' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Video de demostracion del experimento"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB progress aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <progress max="100" value="45" aria-label="Chapter download progress"></progress>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'progress-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain('Chapter download progress')
    const progressSegment = segments.find(
      (segment) => segment.elementType === 'progress' && segment.attributeName === 'aria-label',
    )
    expect(progressSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = progressSegment
      ? [{ ...progressSegment, translatedText: 'Progreso de descarga del capitulo' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Progreso de descarga del capitulo"')
    expect(translatedChapter).toContain('value="45"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB meter aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <meter min="0" max="10" value="7" aria-label="Reader confidence rating"></meter>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'meter-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain('Reader confidence rating')
    const meterSegment = segments.find(
      (segment) => segment.elementType === 'meter' && segment.attributeName === 'aria-label',
    )
    expect(meterSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = meterSegment
      ? [{ ...meterSegment, translatedText: 'Calificacion de confianza del lector' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Calificacion de confianza del lector"')
    expect(translatedChapter).toContain('value="7"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB output aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <output for="source target" aria-label="Calculated translation score"></output>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'output-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Calculated translation score',
    )
    const outputSegment = segments.find(
      (segment) => segment.elementType === 'output' && segment.attributeName === 'aria-label',
    )
    expect(outputSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = outputSegment
      ? [{ ...outputSegment, translatedText: 'Puntuacion de traduccion calculada' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('aria-label="Puntuacion de traduccion calculada"')
    expect(translatedChapter).toContain('for="source target"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB input placeholder attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <input type="text" placeholder="Type your translated answer here"/>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'input-placeholder.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Type your translated answer here',
    )
    const inputSegment = segments.find(
      (segment) => segment.elementType === 'input' && segment.attributeName === 'placeholder',
    )
    expect(inputSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = inputSegment
      ? [{ ...inputSegment, translatedText: 'Escribe aqui tu respuesta traducida' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('placeholder="Escribe aqui tu respuesta traducida"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB input aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <input type="text" aria-label="Short written response for the reflection question"/>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'input-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Short written response for the reflection question',
    )
    const inputSegment = segments.find(
      (segment) => segment.elementType === 'input' && segment.attributeName === 'aria-label',
    )
    expect(inputSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = inputSegment
      ? [
          {
            ...inputSegment,
            translatedText: 'Respuesta escrita breve para la pregunta de reflexion',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-label="Respuesta escrita breve para la pregunta de reflexion"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB input title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <input type="text" title="Use a short formal answer for this response"/>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'input-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Use a short formal answer for this response',
    )
    const inputSegment = segments.find(
      (segment) => segment.elementType === 'input' && segment.attributeName === 'title',
    )
    expect(inputSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = inputSegment
      ? [
          {
            ...inputSegment,
            translatedText: 'Usa una respuesta formal breve para esta respuesta',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'title="Usa una respuesta formal breve para esta respuesta"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB button-like input value attributes without translating editable values', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <input type="submit" value="Send translated chapter answers"/>
          <input type="button" value="Reveal annotated glossary note"/>
          <input type="reset" value="Clear chapter response form"/>
          <input type="text" value="Reader private draft answer"/>
          <input type="search" value="Search query should remain original"/>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'input-button-like-value.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Send translated chapter answers',
      'Reveal annotated glossary note',
      'Clear chapter response form',
    ])
    const submitSegment = segments.find(
      (segment) =>
        segment.elementType === 'input' &&
        segment.attributeName === 'value' &&
        segment.originalText === 'Send translated chapter answers',
    )
    const buttonSegment = segments.find(
      (segment) =>
        segment.elementType === 'input' &&
        segment.attributeName === 'value' &&
        segment.originalText === 'Reveal annotated glossary note',
    )
    const resetSegment = segments.find(
      (segment) =>
        segment.elementType === 'input' &&
        segment.attributeName === 'value' &&
        segment.originalText === 'Clear chapter response form',
    )
    expect(submitSegment).toBeTruthy()
    expect(buttonSegment).toBeTruthy()
    expect(resetSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = []
    if (submitSegment) {
      translatedSegments.push({
        ...submitSegment,
        translatedText: 'Enviar respuestas del capitulo traducido',
      })
    }
    if (buttonSegment) {
      translatedSegments.push({
        ...buttonSegment,
        translatedText: 'Mostrar nota de glosario anotada',
      })
    }
    if (resetSegment) {
      translatedSegments.push({
        ...resetSegment,
        translatedText: 'Borrar formulario de respuesta del capitulo',
      })
    }
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('value="Enviar respuestas del capitulo traducido"')
    expect(translatedChapter).toContain('value="Mostrar nota de glosario anotada"')
    expect(translatedChapter).toContain('value="Borrar formulario de respuesta del capitulo"')
    expect(translatedChapter).toContain('value="Reader private draft answer"')
    expect(translatedChapter).toContain('value="Search query should remain original"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB image input alt attributes without translating editable input alt text', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <input type="image" src="submit.png" alt="Submit annotated workbook answer"/>
          <input type="text" alt="Editable answer helper text should stay original"/>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'input-image-alt.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Submit annotated workbook answer',
    ])
    const inputAltSegment = segments.find(
      (segment) => segment.elementType === 'input' && segment.attributeName === 'alt',
    )
    expect(inputAltSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = inputAltSegment
      ? [{ ...inputAltSegment, translatedText: 'Enviar respuesta anotada del cuaderno' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('alt="Enviar respuesta anotada del cuaderno"')
    expect(translatedChapter).toContain('alt="Editable answer helper text should stay original"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB textarea placeholder attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <textarea placeholder="Describe the character motivation in two sentences"></textarea>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'textarea-placeholder.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Describe the character motivation in two sentences',
    )
    const textareaSegment = segments.find(
      (segment) => segment.elementType === 'textarea' && segment.attributeName === 'placeholder',
    )
    expect(textareaSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = textareaSegment
      ? [
          {
            ...textareaSegment,
            translatedText: 'Describe la motivacion del personaje en dos frases',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'placeholder="Describe la motivacion del personaje en dos frases"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB textarea aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <textarea aria-label="Long written response for the chapter reflection"></textarea>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'textarea-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Long written response for the chapter reflection',
    )
    const textareaSegment = segments.find(
      (segment) => segment.elementType === 'textarea' && segment.attributeName === 'aria-label',
    )
    expect(textareaSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = textareaSegment
      ? [
          {
            ...textareaSegment,
            translatedText: 'Respuesta escrita larga para la reflexion del capitulo',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-label="Respuesta escrita larga para la reflexion del capitulo"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB textarea title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <textarea title="Write a concise paragraph about the translated passage"></textarea>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'textarea-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Write a concise paragraph about the translated passage',
    )
    const textareaSegment = segments.find(
      (segment) => segment.elementType === 'textarea' && segment.attributeName === 'title',
    )
    expect(textareaSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = textareaSegment
      ? [
          {
            ...textareaSegment,
            translatedText: 'Escribe un parrafo conciso sobre el pasaje traducido',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'title="Escribe un parrafo conciso sobre el pasaje traducido"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB select aria-label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <select aria-label="Choose the correct translated glossary term">
            <option>Formal register</option>
          </select>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'select-aria-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Choose the correct translated glossary term',
    )
    const selectSegment = segments.find(
      (segment) => segment.elementType === 'select' && segment.attributeName === 'aria-label',
    )
    expect(selectSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = selectSegment
      ? [
          {
            ...selectSegment,
            translatedText: 'Elige el termino correcto del glosario traducido',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'aria-label="Elige el termino correcto del glosario traducido"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB select title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <select title="Choose the source sentence that matches this translation">
            <option>Formal register</option>
          </select>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'select-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Choose the source sentence that matches this translation',
    )
    const selectSegment = segments.find(
      (segment) => segment.elementType === 'select' && segment.attributeName === 'title',
    )
    expect(selectSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = selectSegment
      ? [
          {
            ...selectSegment,
            translatedText: 'Elige la frase de origen que coincide con esta traduccion',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'title="Elige la frase de origen que coincide con esta traduccion"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB optgroup label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <select>
            <optgroup label="Translation strategies for dialogue passages">
              <option>Formal register</option>
            </optgroup>
          </select>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'optgroup-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Translation strategies for dialogue passages',
    )
    const optgroupSegment = segments.find(
      (segment) => segment.elementType === 'optgroup' && segment.attributeName === 'label',
    )
    expect(optgroupSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = optgroupSegment
      ? [
          {
            ...optgroupSegment,
            translatedText: 'Estrategias de traduccion para pasajes de dialogo',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('label="Estrategias de traduccion para pasajes de dialogo"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB optgroup title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <select>
            <optgroup title="Literal choices for grammar translation practice">
              <option>Formal register</option>
            </optgroup>
          </select>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'optgroup-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Literal choices for grammar translation practice',
    )
    const optgroupSegment = segments.find(
      (segment) => segment.elementType === 'optgroup' && segment.attributeName === 'title',
    )
    expect(optgroupSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = optgroupSegment
      ? [
          {
            ...optgroupSegment,
            translatedText: 'Opciones literales para practicar traduccion gramatical',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'title="Opciones literales para practicar traduccion gramatical"',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB option label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <select>
            <option value="formal" label="Formal translation register choice">Formal</option>
          </select>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'option-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Formal translation register choice',
    )
    const optionSegment = segments.find(
      (segment) => segment.elementType === 'option' && segment.attributeName === 'label',
    )
    expect(optionSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = optionSegment
      ? [
          {
            ...optionSegment,
            translatedText: 'Opcion de registro formal de traduccion',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('label="Opcion de registro formal de traduccion"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB option title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <select>
            <option value="literal" title="Literal translation answer choice">Literal</option>
          </select>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'option-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Literal translation answer choice',
    )
    const optionSegment = segments.find(
      (segment) => segment.elementType === 'option' && segment.attributeName === 'title',
    )
    expect(optionSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = optionSegment
      ? [
          {
            ...optionSegment,
            translatedText: 'Opcion de respuesta de traduccion literal',
          },
        ]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Opcion de respuesta de traduccion literal"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB option visible text in place without changing option values', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <form>
          <select>
            <option value="formal">Formal register answer choice</option>
            <option value="casual">Casual dialogue answer choice</option>
          </select>
        </form>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'option-visible-text.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toEqual([
      'Formal register answer choice',
      'Casual dialogue answer choice',
    ])
    const formalSegment = segments.find(
      (segment) =>
        segment.elementType === 'option' &&
        segment.originalText === 'Formal register answer choice',
    )
    const casualSegment = segments.find(
      (segment) =>
        segment.elementType === 'option' &&
        segment.originalText === 'Casual dialogue answer choice',
    )
    expect(formalSegment).toBeTruthy()
    expect(casualSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = []
    if (formalSegment) {
      translatedSegments.push({
        ...formalSegment,
        translatedText: 'Opcion de respuesta de registro formal',
      })
    }
    if (casualSegment) {
      translatedSegments.push({
        ...casualSegment,
        translatedText: 'Opcion de respuesta de dialogo informal',
      })
    }
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      '<option value="formal">Opcion de respuesta de registro formal</option>',
    )
    expect(translatedChapter).toContain(
      '<option value="casual">Opcion de respuesta de dialogo informal</option>',
    )
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB image map area alt attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <img src="map.png" usemap="#chapters" alt="Chapter navigation map"/>
        <map name="chapters">
          <area shape="rect" coords="0,0,100,100" href="#chapter-two" alt="Open chapter two notes"/>
        </map>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'image-map-area.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain('Open chapter two notes')
    const areaSegment = segments.find((segment) => segment.elementType === 'area')
    expect(areaSegment?.attributeName).toBe('alt')

    const translatedSegments: TextSegment[] = areaSegment
      ? [{ ...areaSegment, translatedText: 'Abrir notas del capitulo dos' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('alt="Abrir notas del capitulo dos"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB media track label attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <video controls="">
          <track kind="captions" srclang="en" src="captions.vtt" label="English captions for the interview video"/>
        </video>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'media-track-label.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'English captions for the interview video',
    )
    const trackSegment = segments.find((segment) => segment.elementType === 'track')
    expect(trackSegment?.attributeName).toBe('label')

    const translatedSegments: TextSegment[] = trackSegment
      ? [{ ...trackSegment, translatedText: 'Subtitulos en ingles para el video de entrevista' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('label="Subtitulos en ingles para el video de entrevista"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('translates EPUB time title attributes', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>
          Published
          <time datetime="2026-05-05" title="Exact publication date tooltip">May 5</time>
        </p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'time-title.epub')
    const { book, segments } = await parseEpubFile(file)

    expect(segments.map((segment) => segment.originalText)).toContain(
      'Exact publication date tooltip',
    )
    const timeSegment = segments.find(
      (segment) => segment.elementType === 'time' && segment.attributeName === 'title',
    )
    expect(timeSegment).toBeTruthy()

    const translatedSegments: TextSegment[] = timeSegment
      ? [{ ...timeSegment, translatedText: 'Informacion exacta de fecha de publicacion' }]
      : []
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('title="Informacion exacta de fecha de publicacion"')
    expect(translatedChapter).toContain('datetime="2026-05-05"')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('does not inject stale image alt translations as visible text', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <img src="diagram.png" alt="Diagram showing workflow steps clearly."/>
        <p>Readable paragraph should remain separate from image attributes.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'stale-image-alt.epub')
    const { book, segments } = await parseEpubFile(file)
    const imageAltSegment = segments.find((segment) => segment.attributeName === 'alt')
    if (!imageAltSegment) throw new Error('Missing image alt segment')

    const translatedSegments: TextSegment[] = [
      {
        ...imageAltSegment,
        domPath: 'body > img:nth-of-type(999)',
        translatedText: 'Diagrama obsoleto que no debe insertarse.',
      },
    ]
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('alt="Diagram showing workflow steps clearly."')
    expect(translatedChapter).not.toContain('native-translate-translation')
    expect(translatedChapter).not.toContain('Diagrama obsoleto que no debe insertarse.')
  })

  it('does not overwrite EPUB attributes when the source attribute text is stale', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <img src="diagram.png" alt="Current workflow diagram description."/>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'stale-existing-image-alt.epub')
    const { book, segments } = await parseEpubFile(file)
    const imageAltSegment = segments.find((segment) => segment.attributeName === 'alt')
    if (!imageAltSegment) throw new Error('Missing image alt segment')

    const translatedSegments: TextSegment[] = [
      {
        ...imageAltSegment,
        originalText: 'Outdated workflow diagram description.',
        translatedText: 'Descripcion obsoleta que no debe sobrescribir.',
      },
    ]
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('alt="Current workflow diagram description."')
    expect(translatedChapter).not.toContain('Descripcion obsoleta que no debe sobrescribir.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('does not inject EPUB body translations when the source text is stale', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Current paragraph that should not receive stale translation.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'stale-existing-paragraph.epub')
    const { book, segments } = await parseEpubFile(file)
    const paragraphSegment = segments[0]
    if (!paragraphSegment) throw new Error('Missing paragraph segment')

    const translatedSegments: TextSegment[] = [
      {
        ...paragraphSegment,
        originalText: 'Outdated paragraph that no longer exists.',
        translatedText: 'Traduccion obsoleta que no debe insertarse.',
      },
    ]
    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain(
      'Current paragraph that should not receive stale translation.',
    )
    expect(translatedChapter).not.toContain('Traduccion obsoleta que no debe insertarse.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('falls back to paragraph order when domPath cannot be resolved', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Alpha paragraph for fallback mapping.</p>
        <p>Beta paragraph for fallback mapping.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'fallback.epub')
    const { book, segments } = await parseEpubFile(file)

    const translatedSegments: TextSegment[] = segments.map((segment) => ({
      ...segment,
      domPath: 'body > p:nth-of-type(999)',
      translatedText: `translated::${segment.order}`,
    }))

    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('translated::0')
    expect(translatedChapter).toContain('translated::1')
    const count = (translatedChapter.match(/native-translate-translation/g) || []).length
    expect(count).toBe(2)
  })

  it('does not fallback EPUB body translations when source text is absent', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Current unrelated paragraph should remain unchanged.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'fallback-stale-source.epub')
    const { book, segments } = await parseEpubFile(file)
    const paragraphSegment = segments[0]
    if (!paragraphSegment) throw new Error('Missing paragraph segment')

    const translatedSegments: TextSegment[] = [
      {
        ...paragraphSegment,
        domPath: 'body > p:nth-of-type(999)',
        originalText: 'Outdated paragraph that is absent from the chapter.',
        translatedText: 'Traduccion de fallback que no debe insertarse.',
      },
    ]

    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments)
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('Current unrelated paragraph should remain unchanged.')
    expect(translatedChapter).not.toContain('Traduccion de fallback que no debe insertarse.')
    expect(translatedChapter).not.toContain('native-translate-translation')
  })

  it('marks generated translation nodes with target language direction metadata', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Hello world from the source book.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'rtl-output.epub')
    const { book, segments } = await parseEpubFile(file)

    const translatedSegments: TextSegment[] = segments.map((segment) => ({
      ...segment,
      translatedText: 'مرحبا بالعالم',
    }))

    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments, 'ar_EG')
    const translatedChapter = await readChapterFromEpub(translatedBlob)

    expect(translatedChapter).toContain('class="native-translate-translation"')
    expect(translatedChapter).toContain('lang="ar-EG"')
    expect(translatedChapter).toContain('dir="rtl"')
  })

  it('updates EPUB package language metadata to the target language', async () => {
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Hello world from the source book.</p>
      </body>
    </html>`
    const file = await createEpubFile(chapter, 'metadata-language.epub')
    const { book, segments } = await parseEpubFile(file)

    const translatedSegments: TextSegment[] = segments.map((segment) => ({
      ...segment,
      translatedText: 'مرحبا بالعالم',
    }))

    const translatedBlob = await generateTranslatedEpub(file, book, translatedSegments, 'ar_EG')
    const translatedOpf = await readOpfFromEpub(translatedBlob)

    expect(translatedOpf).toContain('<dc:language>ar-EG</dc:language>')
    expect(translatedOpf).not.toContain('<dc:language>en</dc:language>')
  })
})
