import JSZip from 'jszip'

export interface DigestChapter {
  id: string
  title: string
  points: string[]
  pointsOriginal?: string[]
}

export interface DigestBook {
  title: string
  language?: string
  chapters: DigestChapter[]
}

export function buildDigestXhtml(book: DigestBook): string {
  const chapterBlocks = book.chapters
    .map((chapter) => {
      const items = chapter.points
        .map((point, index) => {
          const original = chapter.pointsOriginal?.[index]
          const originalHtml = original
            ? `<p class="digest-original">${escapeXml(original)}</p>`
            : ''
          return `<li><p>${escapeXml(point)}</p>${originalHtml}</li>`
        })
        .join('')
      return `<section id="${escapeXml(chapter.id)}"><h2>${escapeXml(chapter.title)}</h2><ol>${items}</ol></section>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(book.language || 'en')}" lang="${escapeXml(book.language || 'en')}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(book.title)} — Digest</title>
  <style>
    body { font-family: Georgia, serif; line-height: 1.5; padding: 1.5rem; color: #18181b; }
    h1 { font-size: 1.4rem; }
    h2 { font-size: 1.1rem; margin-top: 1.4rem; }
    .digest-original { color: #71717a; font-size: 0.92em; margin: 0.2rem 0 0.6rem; }
    ol { padding-left: 1.2rem; }
  </style>
</head>
<body>
  <h1>${escapeXml(book.title)}</h1>
  ${chapterBlocks}
</body>
</html>
`
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function injectDigestIntoOpf(opfXml: string, item: { id: string; href: string }): string {
  let next = opfXml
  if (!next.includes(`id="${item.id}"`)) {
    next = next.replace(
      /<manifest(\s[^>]*)?>/i,
      (match) =>
        `${match}\n    <item id="${item.id}" href="${item.href}" media-type="application/xhtml+xml"/>`,
    )
  }
  if (!next.includes(`idref="${item.id}"`)) {
    next = next.replace(
      /<spine(\s[^>]*)?>/i,
      (match) => `${match}\n    <itemref idref="${item.id}"/>`,
    )
  }
  return next
}

export async function addDigestToEpubBlob(
  epub: Blob | ArrayBuffer | Uint8Array,
  book: DigestBook,
  href = 'digest.xhtml',
): Promise<Blob> {
  const zip = await JSZip.loadAsync(epub)
  const container = await zip.file('META-INF/container.xml')?.async('text')
  const opfPath =
    container?.match(/full-path="([^"]+)"/)?.[1] ||
    Object.keys(zip.files).find((name) => name.endsWith('.opf')) ||
    'OEBPS/content.opf'
  const opfFile = zip.file(opfPath)
  if (!opfFile) throw new Error('OPF not found')
  const opfXml = await opfFile.async('text')
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const digestPath = `${baseDir}${href}`
  zip.file(digestPath, buildDigestXhtml(book))
  zip.file(opfPath, injectDigestIntoOpf(opfXml, { id: 'nt-digest', href }))
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
  })
}
