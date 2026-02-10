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

async function readChapterFromEpub(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(blob as unknown as Blob)
  const chapter = zip.file('OEBPS/ch1.xhtml')
  if (!chapter) throw new Error('Missing chapter in translated epub')
  return chapter.async('text')
}

describe('epubParser paragraph mapping', () => {
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
})
