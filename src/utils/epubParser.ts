import JSZip from 'jszip'
import { isRTLLanguage } from './rtl'

export interface EpubChapter {
  id: string
  title: string
  content: string
  order: number
}

export interface EpubMetadata {
  title: string
  author: string
  language: string
  identifier: string
}

export interface EpubBook {
  metadata: EpubMetadata
  chapters: EpubChapter[]
}

export interface TextSegment {
  id: string
  chapterId: string
  originalText: string
  translatedText?: string
  elementType: string
  attributeName?: string
  order: number
  // CSS path to the original element within the chapter document
  domPath: string
}

const TRANSLATION_SELECTOR = '.native-translate-translation'
const SVG_METADATA_SELECTOR = 'svg title, svg desc'
const TRANSLATABLE_SELECTOR = `p, li, blockquote, h1, h2, h3, h4, h5, h6, div, caption, th, td, dt, dd, figcaption, aside, summary, label, legend, header, nav, footer, button, option, a, em, span, strong, ${SVG_METADATA_SELECTOR}`
const STANDALONE_INLINE_TEXT_ELEMENT_TAGS = new Set(['a', 'em', 'span', 'strong'])
const GLOBAL_TRANSLATABLE_ATTRIBUTE_NAMES = [
  'aria-braillelabel',
  'aria-brailleroledescription',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'title',
  'data-bs-content',
  'data-bs-original-title',
  'data-bs-title',
  'data-content',
  'data-intro',
  'data-original-title',
  'data-placeholder',
  'data-tip',
  'data-tippy-content',
  'data-tooltip',
  'data-tooltip-content',
] as const
const NON_TRANSLATABLE_ELEMENT_TAGS = new Set([
  'head',
  'link',
  'meta',
  'noscript',
  'script',
  'style',
  'template',
])
const TRANSLATABLE_ATTRIBUTE_TARGETS = [
  { tagName: 'img', attributeNames: ['alt', 'title'] },
  { tagName: 'area', attributeNames: ['alt', 'title'] },
  { tagName: 'a', attributeNames: ['title', 'aria-label'] },
  { tagName: 'abbr', attributeNames: ['title'] },
  { tagName: 'article', attributeNames: ['aria-label'] },
  { tagName: 'aside', attributeNames: ['aria-label'] },
  { tagName: 'audio', attributeNames: ['aria-label'] },
  { tagName: 'button', attributeNames: ['aria-label', 'title'] },
  { tagName: 'canvas', attributeNames: ['aria-label', 'title'] },
  { tagName: 'caption', attributeNames: ['title'] },
  { tagName: 'col', attributeNames: ['title'] },
  { tagName: 'colgroup', attributeNames: ['title'] },
  { tagName: 'details', attributeNames: ['aria-label', 'title'] },
  { tagName: 'dfn', attributeNames: ['title'] },
  { tagName: 'dialog', attributeNames: ['aria-label'] },
  { tagName: 'embed', attributeNames: ['aria-label'] },
  { tagName: 'figure', attributeNames: ['aria-label', 'title'] },
  { tagName: 'figcaption', attributeNames: ['title'] },
  { tagName: 'fieldset', attributeNames: ['aria-label', 'title'] },
  { tagName: 'footer', attributeNames: ['aria-label'] },
  { tagName: 'header', attributeNames: ['aria-label'] },
  { tagName: 'iframe', attributeNames: ['title'] },
  { tagName: 'input', attributeNames: ['placeholder', 'aria-label', 'title', 'value', 'alt'] },
  { tagName: 'label', attributeNames: ['title'] },
  { tagName: 'legend', attributeNames: ['title'] },
  { tagName: 'main', attributeNames: ['aria-label'] },
  { tagName: 'math', attributeNames: ['alttext'] },
  { tagName: 'meter', attributeNames: ['aria-label'] },
  { tagName: 'nav', attributeNames: ['aria-label'] },
  { tagName: 'object', attributeNames: ['aria-label'] },
  { tagName: 'optgroup', attributeNames: ['label', 'title'] },
  { tagName: 'option', attributeNames: ['label', 'title'] },
  { tagName: 'output', attributeNames: ['aria-label'] },
  { tagName: 'progress', attributeNames: ['aria-label'] },
  { tagName: 'section', attributeNames: ['aria-label'] },
  { tagName: 'select', attributeNames: ['aria-label', 'title'] },
  { tagName: 'span', attributeNames: ['aria-label', 'title'] },
  { tagName: 'summary', attributeNames: ['title'] },
  { tagName: 'svg', attributeNames: ['aria-label'] },
  { tagName: 'table', attributeNames: ['summary'] },
  { tagName: 'tbody', attributeNames: ['title'] },
  { tagName: 'td', attributeNames: ['title'] },
  { tagName: 'tfoot', attributeNames: ['title'] },
  { tagName: 'th', attributeNames: ['title'] },
  { tagName: 'thead', attributeNames: ['title'] },
  { tagName: 'textarea', attributeNames: ['placeholder', 'aria-label', 'title'] },
  { tagName: 'time', attributeNames: ['title'] },
  { tagName: 'track', attributeNames: ['label'] },
  { tagName: 'tr', attributeNames: ['title'] },
  { tagName: 'video', attributeNames: ['aria-label'] },
] as const
const TRANSLATABLE_INPUT_VALUE_TYPES = new Set(['button', 'reset', 'submit'])
const TRANSLATABLE_ATTRIBUTE_SELECTOR = Array.from(
  new Set([
    ...GLOBAL_TRANSLATABLE_ATTRIBUTE_NAMES.map((attributeName) => `[${attributeName}]`),
    ...TRANSLATABLE_ATTRIBUTE_TARGETS.flatMap(({ tagName, attributeNames }) =>
      attributeNames.map((attributeName) => `${tagName}[${attributeName}]`),
    ),
  ]),
).join(',')

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isSvgMetadataElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase()
  return (tagName === 'title' || tagName === 'desc') && element.closest('svg') !== null
}

function isInPlaceTextElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase()
  return (
    isSvgMetadataElement(element) ||
    tagName === 'a' ||
    tagName === 'button' ||
    tagName === 'caption' ||
    tagName === 'dd' ||
    tagName === 'dt' ||
    tagName === 'em' ||
    tagName === 'figcaption' ||
    (tagName === 'label' &&
      element.querySelector('button, input, meter, output, progress, select, textarea') === null) ||
    tagName === 'legend' ||
    tagName === 'option' ||
    tagName === 'strong' ||
    tagName === 'summary' ||
    tagName === 'td' ||
    tagName === 'th'
  )
}

function getTranslatableAttributeNames(element: Element): readonly string[] {
  const tagName = element.tagName.toLowerCase()
  const attributeNames = Array.from(
    new Set([
      ...GLOBAL_TRANSLATABLE_ATTRIBUTE_NAMES,
      ...(TRANSLATABLE_ATTRIBUTE_TARGETS.find((item) => item.tagName === tagName)?.attributeNames ??
        []),
    ]),
  )
  return attributeNames.filter((attributeName) =>
    isTranslatableAttributeElement(element, attributeName),
  )
}

function isTranslatableAttributeElement(element: Element, attributeName: string): boolean {
  const inputType = element.getAttribute('type')?.trim().toLowerCase() || 'text'
  if (attributeName === 'value') {
    return (
      element.tagName.toLowerCase() === 'input' && TRANSLATABLE_INPUT_VALUE_TYPES.has(inputType)
    )
  }
  if (attributeName === 'alt' && element.tagName.toLowerCase() === 'input') {
    return inputType === 'image'
  }
  return true
}

function hasNestedTranslatableElement(element: Element): boolean {
  return Array.from(element.querySelectorAll(TRANSLATABLE_SELECTOR)).some((candidate) => {
    if (STANDALONE_INLINE_TEXT_ELEMENT_TAGS.has(candidate.tagName.toLowerCase())) return false
    const text = candidate.textContent?.trim() || ''
    return text.length > 10
  })
}

function hasTranslatableTextAncestor(element: Element): boolean {
  let current = element.parentElement
  while (current) {
    const tagName = current.tagName.toLowerCase()
    if (tagName === 'body' || tagName === 'html') return false
    if (
      current.matches(TRANSLATABLE_SELECTOR) &&
      !isExcludedFromTranslationElement(current) &&
      (current.textContent?.trim().length || 0) > 10
    ) {
      return true
    }
    current = current.parentElement
  }
  return false
}

function isVisibleTextTranslatableElement(element: Element): boolean {
  if (!element.matches(TRANSLATABLE_SELECTOR)) return false
  if (STANDALONE_INLINE_TEXT_ELEMENT_TAGS.has(element.tagName.toLowerCase())) {
    return !hasTranslatableTextAncestor(element)
  }
  return !hasNestedTranslatableElement(element)
}

function isExcludedFromTranslationElement(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (NON_TRANSLATABLE_ELEMENT_TAGS.has(current.tagName.toLowerCase())) return true
    if (current.hasAttribute('hidden')) return true
    if (current.getAttribute('aria-hidden')?.trim().toLowerCase() === 'true') return true
    const style = current.getAttribute('style')?.toLowerCase() || ''
    if (/(^|;)\s*display\s*:\s*none\s*(;|$)/.test(style)) return true
    if (/(^|;)\s*visibility\s*:\s*(hidden|collapse)\s*(;|$)/.test(style)) return true
    if (/(^|;)\s*content-visibility\s*:\s*hidden\s*(;|$)/.test(style)) return true
    const translate = current.getAttribute('translate')?.trim().toLowerCase()
    if (translate === 'no') return true
    if (current.hasAttribute('data-no-translate')) return true
    if (current.classList.contains('notranslate') || current.classList.contains('skiptranslate')) {
      return true
    }
    current = current.parentElement
  }
  return false
}

function getDomLanguageTag(languageCode: string): string {
  return languageCode.replace(/_/g, '-')
}

function decodeZipPath(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function normalizeZipPath(path: string): string {
  const pathWithoutAnchor = path.split('#')[0]?.split('?')[0] || ''
  const decodedPath = decodeZipPath(pathWithoutAnchor)
  const parts: string[] = []

  for (const part of decodedPath.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }

  return parts.join('/')
}

class EpubParser {
  private zip: JSZip
  private opfPath = ''
  private spine: Array<{ id: string; href: string }> = []
  private manifest: Map<string, string> = new Map()

  constructor(zipFile: JSZip) {
    this.zip = zipFile
  }

  async parse(): Promise<EpubBook> {
    // Find and parse container.xml to get OPF path
    await this.findOpfPath()

    // Parse OPF file to get metadata and spine
    const { metadata, spine, manifest } = await this.parseOpf()
    this.spine = spine
    this.manifest = manifest

    // Extract chapters content
    const chapters = await this.extractChapters()

    return {
      metadata,
      chapters,
    }
  }

  private async findOpfPath(): Promise<void> {
    const containerFile = this.zip.file('META-INF/container.xml')
    if (!containerFile) {
      throw new Error('Invalid EPUB: Missing container.xml')
    }

    const containerXml = await containerFile.async('text')
    const parser = new DOMParser()
    const doc = parser.parseFromString(containerXml, 'application/xml')

    const rootfile = doc.querySelector('rootfile')
    if (!rootfile) {
      throw new Error('Invalid EPUB: Missing rootfile in container.xml')
    }

    this.opfPath = normalizeZipPath(rootfile.getAttribute('full-path') || '')
    if (!this.opfPath) {
      throw new Error('Invalid EPUB: Missing full-path in rootfile')
    }
  }

  private resolveManifestHref(href: string): string {
    const opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf('/'))
    return normalizeZipPath(opfDir ? `${opfDir}/${href}` : href)
  }

  private async parseOpf(): Promise<{
    metadata: EpubMetadata
    spine: Array<{ id: string; href: string }>
    manifest: Map<string, string>
  }> {
    const opfFile = this.zip.file(this.opfPath)
    if (!opfFile) {
      throw new Error(`Invalid EPUB: Missing OPF file at ${this.opfPath}`)
    }

    const opfXml = await opfFile.async('text')
    const parser = new DOMParser()
    const doc = parser.parseFromString(opfXml, 'application/xml')

    // Extract metadata
    const metadata = this.extractMetadata(doc)

    // Extract manifest
    const manifest = new Map<string, string>()
    const manifestItems = doc.querySelectorAll('manifest item')
    for (const item of manifestItems) {
      const id = item.getAttribute('id')
      const href = item.getAttribute('href')
      if (id && href) {
        manifest.set(id, this.resolveManifestHref(href))
      }
    }

    // Extract spine order
    const spine: Array<{ id: string; href: string }> = []
    const spineItems = doc.querySelectorAll('spine itemref')
    for (const itemref of spineItems) {
      const idref = itemref.getAttribute('idref')
      if (!idref) continue
      const href = manifest.get(idref)
      if (!href) continue
      spine.push({ id: idref, href })
    }

    return { metadata, spine, manifest }
  }

  private extractMetadata(doc: Document): EpubMetadata {
    const getMetadata = (selector: string): string => {
      const element = doc.querySelector(selector)
      return element?.textContent?.trim() || ''
    }

    return {
      title: getMetadata('metadata title') || 'Unknown Title',
      author: getMetadata('metadata creator') || 'Unknown Author',
      language: getMetadata('metadata language') || 'en',
      identifier: getMetadata('metadata identifier') || '',
    }
  }

  private async extractChapters(): Promise<EpubChapter[]> {
    const chapters: EpubChapter[] = []

    for (let i = 0; i < this.spine.length; i++) {
      const spineItem = this.spine[i]
      const chapterPath = spineItem.href

      try {
        const chapterFile = this.zip.file(chapterPath)
        if (!chapterFile) {
          console.warn(`Chapter file not found: ${chapterPath}`)
          continue
        }

        const chapterHtml = await chapterFile.async('text')
        const parser = new DOMParser()
        const doc = parser.parseFromString(chapterHtml, 'text/html')

        // Prefer visible chapter headings over generic XHTML head titles.
        const titleElement =
          Array.from(doc.body?.querySelectorAll('h1, h2, h3, h4, h5, h6') || []).find(
            (element) =>
              !element.classList.contains('native-translate-translation') &&
              !isExcludedFromTranslationElement(element),
          ) || doc.querySelector('title')
        const title = titleElement?.textContent?.trim() || `Chapter ${i + 1}`

        // Clean and extract text content
        const content = this.cleanHtmlContent(doc)

        chapters.push({
          id: spineItem.id,
          title,
          content,
          order: i,
        })
      } catch (error) {
        console.error(`Error processing chapter ${chapterPath}:`, error)
      }
    }

    return chapters
  }

  private cleanHtmlContent(doc: Document): string {
    // Remove script and style elements
    const scriptsAndStyles = doc.querySelectorAll('script, style')
    for (const element of scriptsAndStyles) {
      element.remove()
    }

    // Get text content from body, preserving paragraph structure
    const body = doc.querySelector('body')
    if (!body) return ''

    // Extract text while preserving paragraph breaks
    const paragraphs: string[] = []
    const contentElements = body.querySelectorAll(
      `${TRANSLATABLE_SELECTOR},${TRANSLATABLE_ATTRIBUTE_SELECTOR}`,
    )

    const appendParagraph = (text: string | null | undefined): void => {
      const trimmedText = text?.trim()
      if (trimmedText && trimmedText.length > 10) {
        // Filter out very short texts
        paragraphs.push(trimmedText)
      }
    }

    for (const element of contentElements) {
      if (element.classList.contains('native-translate-translation')) continue
      if (isExcludedFromTranslationElement(element)) continue

      if (isVisibleTextTranslatableElement(element)) {
        appendParagraph(element.textContent)
      }

      for (const attributeName of getTranslatableAttributeNames(element)) {
        appendParagraph(element.getAttribute(attributeName))
      }
    }

    return paragraphs.join('\n\n')
  }

  public async extractTextSegments(_book: EpubBook): Promise<TextSegment[]> {
    const segments: TextSegment[] = []
    let segmentId = 0

    const computeCssPath = (el: Element): string => {
      const parts: string[] = []
      let node: Element | null = el
      while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== 'body') {
        const tag = node.tagName.toLowerCase()
        const parent: Element | null = node.parentElement
        if (!parent) break
        const siblings = Array.from(parent.children).filter(
          (c: Element) =>
            c.tagName.toLowerCase() === tag &&
            !c.classList.contains('native-translate-translation'),
        )
        const index = siblings.indexOf(node) + 1 // nth-of-type is 1-based
        parts.unshift(`${tag}:nth-of-type(${index})`)
        node = parent
      }
      return parts.length > 0 ? `body > ${parts.join(' > ')}` : 'body'
    }

    for (let i = 0; i < this.spine.length; i++) {
      const spineItem = this.spine[i]
      const chapterPath = spineItem.href
      const file = this.zip.file(chapterPath)
      if (!file) continue

      try {
        const html = await file.async('text')
        const dom = new DOMParser()
        let doc = dom.parseFromString(html, 'application/xhtml+xml')
        if (doc.getElementsByTagName('parsererror').length > 0) {
          doc = dom.parseFromString(html, 'text/html')
        }
        for (const node of Array.from(doc.querySelectorAll(TRANSLATION_SELECTOR))) {
          node.remove()
        }
        const textElements = doc.querySelectorAll(
          `${TRANSLATABLE_SELECTOR},${TRANSLATABLE_ATTRIBUTE_SELECTOR}`,
        )
        let order = 0
        for (const el of Array.from(textElements)) {
          if (el.classList.contains('native-translate-translation')) continue
          if (isExcludedFromTranslationElement(el)) continue
          const domPath = computeCssPath(el)

          if (isVisibleTextTranslatableElement(el)) {
            const text = el.textContent?.trim() || ''
            if (text.length > 10) {
              segments.push({
                id: `segment-${segmentId++}`,
                chapterId: spineItem.id,
                originalText: text,
                elementType: el.tagName.toLowerCase(),
                order: order++,
                domPath,
              })
            }
          }

          for (const attributeName of getTranslatableAttributeNames(el)) {
            const text = el.getAttribute(attributeName)?.trim() || ''
            if (text.length <= 10) continue
            segments.push({
              id: `segment-${segmentId++}`,
              chapterId: spineItem.id,
              originalText: text,
              elementType: el.tagName.toLowerCase(),
              attributeName,
              order: order++,
              domPath,
            })
          }
        }
      } catch (e) {
        console.error('extractTextSegments error for', chapterPath, e)
      }
    }

    return segments
  }

  public async reconstructEpub(
    originalBook: EpubBook,
    translatedSegments: TextSegment[],
    targetLanguage?: string,
  ): Promise<Blob> {
    // Create a new zip for the translated EPUB
    const newZip = new JSZip()

    // Copy all original files first (with correct EPUB constraints)
    await this.copyAllOriginalFiles(newZip)

    // Update chapters with translations (overwrite corresponding entries)
    await this.updateChaptersWithTranslations(
      newZip,
      originalBook,
      translatedSegments,
      targetLanguage,
    )
    await this.updatePackageLanguageMetadata(newZip, targetLanguage)

    // Generate the new EPUB blob
    return await newZip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
    })
  }

  private async copyAllOriginalFiles(newZip: JSZip): Promise<void> {
    // 1) Write mimetype first and uncompressed (STORE)
    const origMime = this.zip.file('mimetype')
    let mimeText = 'application/epub+zip'
    if (origMime) {
      try {
        const txt = (await origMime.async('text')).trim()
        if (txt === 'application/epub+zip') mimeText = txt
      } catch {
        // fallback to default
      }
    }
    newZip.file('mimetype', mimeText, { compression: 'STORE' })

    // 2) Copy all remaining files as-is (including HTML/XHTML, OPF, META-INF contents, images, CSS, etc.)
    const copyTasks: Array<Promise<void>> = []
    this.zip.forEach((relativePath, file) => {
      if (file.dir) return
      if (relativePath === 'mimetype') return // already added
      copyTasks.push(
        (async () => {
          const content = await file.async('uint8array')
          newZip.file(relativePath, content)
        })(),
      )
    })
    await Promise.all(copyTasks)
  }

  private async updatePackageLanguageMetadata(
    newZip: JSZip,
    targetLanguage?: string,
  ): Promise<void> {
    if (!targetLanguage || !this.opfPath) return
    const opfFile = newZip.file(this.opfPath)
    if (!opfFile) return

    const opfXml = await opfFile.async('text')
    const parser = new DOMParser()
    const doc = parser.parseFromString(opfXml, 'application/xml')
    const language = getDomLanguageTag(targetLanguage)

    let languageElement = doc.querySelector('metadata language')
    if (!languageElement) {
      const metadata = doc.querySelector('metadata')
      if (!metadata) return
      languageElement = doc.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:language')
      metadata.appendChild(languageElement)
    }
    languageElement.textContent = language

    const serializer = new XMLSerializer()
    newZip.file(this.opfPath, serializer.serializeToString(doc))
  }

  private async updateChaptersWithTranslations(
    newZip: JSZip,
    originalBook: EpubBook,
    translatedSegments: TextSegment[],
    targetLanguage?: string,
  ): Promise<void> {
    // Group segments by chapter
    const segmentsByChapter = new Map<string, TextSegment[]>()
    for (const segment of translatedSegments) {
      if (!segmentsByChapter.has(segment.chapterId)) {
        segmentsByChapter.set(segment.chapterId, [])
      }
      const arr = segmentsByChapter.get(segment.chapterId)
      if (arr) arr.push(segment)
    }

    for (const spineItem of this.spine) {
      const chapterPath = spineItem.href
      const originalFile = this.zip.file(chapterPath)

      if (originalFile) {
        const originalHtml = await originalFile.async('text')
        const segments = segmentsByChapter.get(spineItem.id) || []

        // Generate new HTML with translations
        const translatedHtml = this.injectTranslations(originalHtml, segments, targetLanguage)
        newZip.file(chapterPath, translatedHtml)
      }
    }
  }

  private injectTranslations(
    originalHtml: string,
    segments: TextSegment[],
    targetLanguage?: string,
  ): string {
    const dom = new DOMParser()
    let doc = dom.parseFromString(originalHtml, 'application/xhtml+xml')
    const hasParserError = doc.getElementsByTagName('parsererror').length > 0
    let isXml = true
    if (hasParserError) {
      // Fallback to HTML parsing if input is not strict XHTML
      doc = dom.parseFromString(originalHtml, 'text/html')
      isXml = false
    }

    // Remove existing translated nodes to avoid duplication on re-run
    for (const el of Array.from(doc.querySelectorAll(TRANSLATION_SELECTOR))) {
      el.remove()
    }

    // Strict 1-to-1 by domPath only; two-phase: resolve all targets first, then insert
    const resolvablePairs: Array<{ el: Element; seg: TextSegment }> = []
    const missing: TextSegment[] = []
    const usedElements = new Set<Element>()
    for (const seg of segments) {
      if (!seg.translatedText || !seg.domPath) continue
      const el = doc.querySelector(seg.domPath)
      if (seg.attributeName) {
        if (
          el &&
          !isExcludedFromTranslationElement(el) &&
          getTranslatableAttributeNames(el).includes(seg.attributeName) &&
          normalizeText(el.getAttribute(seg.attributeName) || '') ===
            normalizeText(seg.originalText)
        ) {
          el.setAttribute(seg.attributeName, seg.translatedText)
        }
        continue
      }
      if (el && normalizeText(el.textContent || '') !== normalizeText(seg.originalText)) {
        continue
      }
      if (
        el &&
        !usedElements.has(el) &&
        !el.classList.contains('native-translate-translation') &&
        !isExcludedFromTranslationElement(el) &&
        normalizeText(el.textContent || '') === normalizeText(seg.originalText)
      ) {
        resolvablePairs.push({ el, seg })
        usedElements.add(el)
      } else {
        missing.push(seg)
      }
    }

    if (missing.length > 0) {
      const candidates = Array.from(doc.querySelectorAll(TRANSLATABLE_SELECTOR))
        .filter(
          (el) =>
            !el.classList.contains('native-translate-translation') &&
            !isExcludedFromTranslationElement(el) &&
            isVisibleTextTranslatableElement(el),
        )
        .map((el, index) => ({
          el,
          order: index,
          tag: el.tagName.toLowerCase(),
          normalizedText: normalizeText(el.textContent || ''),
        }))

      const pickCandidate = (
        seg: TextSegment,
        predicate: (candidate: (typeof candidates)[number], normalizedSource: string) => boolean,
      ): (typeof candidates)[number] | null => {
        const normalizedSource = normalizeText(seg.originalText)
        let best: (typeof candidates)[number] | null = null
        let bestDistance = Number.POSITIVE_INFINITY
        for (const candidate of candidates) {
          if (usedElements.has(candidate.el)) continue
          if (!predicate(candidate, normalizedSource)) continue
          const distance = Math.abs(candidate.order - seg.order)
          if (distance < bestDistance) {
            bestDistance = distance
            best = candidate
          }
        }
        return best
      }

      for (const seg of missing) {
        if (!seg.translatedText) continue
        const candidate =
          pickCandidate(
            seg,
            (c, sourceText) => c.tag === seg.elementType && c.normalizedText === sourceText,
          ) || pickCandidate(seg, (c, sourceText) => c.normalizedText === sourceText)
        if (candidate) {
          resolvablePairs.push({ el: candidate.el, seg })
          usedElements.add(candidate.el)
        }
      }
    }

    const ns = 'http://www.w3.org/1999/xhtml'
    for (const { el, seg } of resolvablePairs) {
      if (isInPlaceTextElement(el)) {
        el.textContent = seg.translatedText || ''
        continue
      }
      const tag = el.tagName.toLowerCase()
      const outTag = tag === 'li' ? 'li' : tag // keep list structure for lists
      const translationElement = isXml ? doc.createElementNS(ns, outTag) : doc.createElement(outTag)
      translationElement.setAttribute('class', 'native-translate-translation')
      if (targetLanguage) {
        translationElement.setAttribute('lang', getDomLanguageTag(targetLanguage))
        translationElement.setAttribute('dir', isRTLLanguage(targetLanguage) ? 'rtl' : 'ltr')
      }
      translationElement.textContent = seg.translatedText || ''
      el.parentNode?.insertBefore(translationElement, el.nextSibling)
    }

    // Debug logs (only in dev)
    // Dev-only debug logs (guarded by process.env)
    // eslint-disable-next-line no-console
    if (process?.env?.NODE_ENV !== 'production') {
      try {
        // eslint-disable-next-line no-console
        console.debug(
          '[EPUB][inject] segments:',
          segments.length,
          'inserted:',
          resolvablePairs.length,
          'missing:',
          missing.length,
        )
        if (missing.length > 0) {
          // eslint-disable-next-line no-console
          console.debug(
            '[EPUB][inject] sample missing domPaths:',
            missing.slice(0, 5).map((m) => m.domPath),
          )
        }
      } catch {
        // no-op
      }
    }

    if (isXml) {
      const serializer = new XMLSerializer()
      return serializer.serializeToString(doc)
    }
    return doc.documentElement.outerHTML
  }
}

export async function parseEpubFile(
  file: File,
): Promise<{ book: EpubBook; segments: TextSegment[] }> {
  if (!file.name.toLowerCase().endsWith('.epub')) {
    throw new Error('Only EPUB files are supported')
  }

  if (file.size > 50 * 1024 * 1024) {
    // 50MB limit
    throw new Error('File is too large (max 50MB)')
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)

    const parser = new EpubParser(zip)
    const book = await parser.parse()
    const segments = await parser.extractTextSegments(book)

    return { book, segments }
  } catch (error) {
    console.error('EPUB parsing error:', error)
    throw new Error('Failed to parse EPUB file. Please check the file format.')
  }
}

export async function generateTranslatedEpub(
  originalFile: File,
  book: EpubBook,
  translatedSegments: TextSegment[],
  targetLanguage?: string,
): Promise<Blob> {
  const arrayBuffer = await originalFile.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)

  const parser = new EpubParser(zip)
  await parser.parse() // Initialize parser state

  return await parser.reconstructEpub(book, translatedSegments, targetLanguage)
}
