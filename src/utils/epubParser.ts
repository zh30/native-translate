import JSZip from 'jszip';

export interface EpubChapter {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface EpubMetadata {
  title: string;
  author: string;
  language: string;
  identifier: string;
}

export interface EpubBook {
  metadata: EpubMetadata;
  chapters: EpubChapter[];
}

export interface TextSegment {
  id: string;
  chapterId: string;
  originalText: string;
  translatedText?: string;
  elementType: string;
  order: number;
  // CSS path to the original element within the chapter document
  domPath: string;
}

class EpubParser {
  private zip: JSZip;
  private opfPath = '';
  private spine: Array<{ id: string; href: string }> = [];
  private manifest: Map<string, string> = new Map();

  constructor(zipFile: JSZip) {
    this.zip = zipFile;
  }

  async parse(): Promise<EpubBook> {
    // Find and parse container.xml to get OPF path
    await this.findOpfPath();

    // Parse OPF file to get metadata and spine
    const { metadata, spine, manifest } = await this.parseOpf();
    this.spine = spine;
    this.manifest = manifest;

    // Extract chapters content
    const chapters = await this.extractChapters();

    return {
      metadata,
      chapters
    };
  }

  private async findOpfPath(): Promise<void> {
    const containerFile = this.zip.file('META-INF/container.xml');
    if (!containerFile) {
      throw new Error('Invalid EPUB: Missing container.xml');
    }

    const containerXml = await containerFile.async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(containerXml, 'application/xml');

    const rootfile = doc.querySelector('rootfile');
    if (!rootfile) {
      throw new Error('Invalid EPUB: Missing rootfile in container.xml');
    }

    this.opfPath = rootfile.getAttribute('full-path') || '';
    if (!this.opfPath) {
      throw new Error('Invalid EPUB: Missing full-path in rootfile');
    }
  }

  private async parseOpf(): Promise<{
    metadata: EpubMetadata;
    spine: Array<{ id: string; href: string }>;
    manifest: Map<string, string>;
  }> {
    const opfFile = this.zip.file(this.opfPath);
    if (!opfFile) {
      throw new Error(`Invalid EPUB: Missing OPF file at ${this.opfPath}`);
    }

    const opfXml = await opfFile.async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(opfXml, 'application/xml');

    // Extract metadata
    const metadata = this.extractMetadata(doc);

    // Extract manifest
    const manifest = new Map<string, string>();
    const manifestItems = doc.querySelectorAll('manifest item');
    for (const item of manifestItems) {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) {
        manifest.set(id, href);
      }
    }

    // Extract spine order
    const spine: Array<{ id: string; href: string }> = [];
    const spineItems = doc.querySelectorAll('spine itemref');
    for (const itemref of spineItems) {
      const idref = itemref.getAttribute('idref');
      if (!idref) continue;
      const href = manifest.get(idref);
      if (!href) continue;
      spine.push({ id: idref, href });
    }

    return { metadata, spine, manifest };
  }

  private extractMetadata(doc: Document): EpubMetadata {
    const getMetadata = (selector: string): string => {
      const element = doc.querySelector(selector);
      return element?.textContent?.trim() || '';
    };

    return {
      title: getMetadata('metadata title') || 'Unknown Title',
      author: getMetadata('metadata creator') || 'Unknown Author',
      language: getMetadata('metadata language') || 'en',
      identifier: getMetadata('metadata identifier') || ''
    };
  }

  private async extractChapters(): Promise<EpubChapter[]> {
    const chapters: EpubChapter[] = [];
    const opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf('/'));
    const basePath = opfDir ? `${opfDir}/` : '';

    for (let i = 0; i < this.spine.length; i++) {
      const spineItem = this.spine[i];
      const chapterPath = basePath + spineItem.href;

      try {
        const chapterFile = this.zip.file(chapterPath);
        if (!chapterFile) {
          console.warn(`Chapter file not found: ${chapterPath}`);
          continue;
        }

        const chapterHtml = await chapterFile.async('text');
        const parser = new DOMParser();
        const doc = parser.parseFromString(chapterHtml, 'text/html');

        // Extract title from h1, h2, or title element
        const titleElement = doc.querySelector('h1, h2, title');
        const title = titleElement?.textContent?.trim() || `Chapter ${i + 1}`;

        // Clean and extract text content
        const content = this.cleanHtmlContent(doc);

        chapters.push({
          id: spineItem.id,
          title,
          content,
          order: i
        });
      } catch (error) {
        console.error(`Error processing chapter ${chapterPath}:`, error);
      }
    }

    return chapters;
  }

  private cleanHtmlContent(doc: Document): string {
    // Remove script and style elements
    const scriptsAndStyles = doc.querySelectorAll('script, style');
    for (const element of scriptsAndStyles) {
      element.remove();
    }

    // Get text content from body, preserving paragraph structure
    const body = doc.querySelector('body');
    if (!body) return '';

    // Extract text while preserving paragraph breaks
    const paragraphs: string[] = [];
    const textElements = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div');

    for (const element of textElements) {
      const text = element.textContent?.trim();
      if (text && text.length > 10) { // Filter out very short texts
        paragraphs.push(text);
      }
    }

    return paragraphs.join('\n\n');
  }

  public async extractTextSegments(_book: EpubBook): Promise<TextSegment[]> {
    const segments: TextSegment[] = [];
    let segmentId = 0;

    const opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf('/'));
    const basePath = opfDir ? `${opfDir}/` : '';

    const computeCssPath = (el: Element): string => {
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== 'body') {
        const tag = node.tagName.toLowerCase();
        const parent: Element | null = node.parentElement;
        if (!parent) break;
        const siblings = Array.from(parent.children).filter((c: Element) => c.tagName.toLowerCase() === tag);
        const index = siblings.indexOf(node) + 1; // nth-of-type is 1-based
        parts.unshift(`${tag}:nth-of-type(${index})`);
        node = parent;
      }
      return parts.length > 0 ? `body > ${parts.join(' > ')}` : 'body';
    };

    for (let i = 0; i < this.spine.length; i++) {
      const spineItem = this.spine[i];
      const chapterPath = basePath + spineItem.href;
      const file = this.zip.file(chapterPath);
      if (!file) continue;

      try {
        const html = await file.async('text');
        const dom = new DOMParser();
        let doc = dom.parseFromString(html, 'application/xhtml+xml');
        if (doc.getElementsByTagName('parsererror').length > 0) {
          doc = dom.parseFromString(html, 'text/html');
        }
        const textElements = doc.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6');
        let order = 0;
        for (const el of Array.from(textElements)) {
          const text = el.textContent?.trim() || '';
          if (text.length <= 10) continue;
          const domPath = computeCssPath(el);
          segments.push({
            id: `segment-${segmentId++}`,
            chapterId: spineItem.id,
            originalText: text,
            elementType: el.tagName.toLowerCase(),
            order: order++,
            domPath,
          });
        }
      } catch (e) {
        console.error('extractTextSegments error for', chapterPath, e);
      }
    }

    return segments;
  }

  public async reconstructEpub(
    originalBook: EpubBook,
    translatedSegments: TextSegment[]
  ): Promise<Blob> {
    // Create a new zip for the translated EPUB
    const newZip = new JSZip();

    // Copy all original files first (with correct EPUB constraints)
    await this.copyAllOriginalFiles(newZip);

    // Update chapters with translations (overwrite corresponding entries)
    await this.updateChaptersWithTranslations(newZip, originalBook, translatedSegments);

    // Generate the new EPUB blob
    return await newZip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
    });
  }

  private async copyAllOriginalFiles(newZip: JSZip): Promise<void> {
    // 1) Write mimetype first and uncompressed (STORE)
    const origMime = this.zip.file('mimetype');
    let mimeText = 'application/epub+zip';
    if (origMime) {
      try {
        const txt = (await origMime.async('text')).trim();
        if (txt === 'application/epub+zip') mimeText = txt;
      } catch {
        // fallback to default
      }
    }
    newZip.file('mimetype', mimeText, { compression: 'STORE' });

    // 2) Copy all remaining files as-is (including HTML/XHTML, OPF, META-INF contents, images, CSS, etc.)
    const copyTasks: Array<Promise<void>> = [];
    this.zip.forEach((relativePath, file) => {
      if (file.dir) return;
      if (relativePath === 'mimetype') return; // already added
      copyTasks.push((async () => {
        const content = await file.async('uint8array');
        newZip.file(relativePath, content);
      })());
    });
    await Promise.all(copyTasks);
  }

  private async updateChaptersWithTranslations(
    newZip: JSZip,
    originalBook: EpubBook,
    translatedSegments: TextSegment[]
  ): Promise<void> {
    const opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf('/'));
    const basePath = opfDir ? `${opfDir}/` : '';

    // Group segments by chapter
    const segmentsByChapter = new Map<string, TextSegment[]>();
    for (const segment of translatedSegments) {
      if (!segmentsByChapter.has(segment.chapterId)) {
        segmentsByChapter.set(segment.chapterId, []);
      }
      const arr = segmentsByChapter.get(segment.chapterId);
      if (arr) arr.push(segment);
    }

    for (const spineItem of this.spine) {
      const chapterPath = basePath + spineItem.href;
      const originalFile = this.zip.file(chapterPath);

      if (originalFile) {
        const originalHtml = await originalFile.async('text');
        const segments = segmentsByChapter.get(spineItem.id) || [];

        // Generate new HTML with translations
        const translatedHtml = this.injectTranslations(originalHtml, segments);
        newZip.file(chapterPath, translatedHtml);
      }
    }
  }

  private injectTranslations(originalHtml: string, segments: TextSegment[]): string {
    const dom = new DOMParser();
    let doc = dom.parseFromString(originalHtml, 'application/xhtml+xml');
    const hasParserError = doc.getElementsByTagName('parsererror').length > 0;
    let isXml = true;
    if (hasParserError) {
      // Fallback to HTML parsing if input is not strict XHTML
      doc = dom.parseFromString(originalHtml, 'text/html');
      isXml = false;
    }

    // Remove existing translated nodes to avoid duplication on re-run
    for (const el of Array.from(doc.querySelectorAll('.native-translate-translation'))) {
      el.remove();
    }

    // Strict 1-to-1 by domPath only; two-phase: resolve all targets first, then insert
    const resolvablePairs: Array<{ el: Element; seg: TextSegment }> = [];
    const missing: TextSegment[] = [];
    for (const seg of segments) {
      if (!seg.translatedText || !seg.domPath) continue;
      const el = doc.querySelector(seg.domPath);
      if (el) {
        resolvablePairs.push({ el, seg });
      } else {
        missing.push(seg);
      }
    }

    const ns = 'http://www.w3.org/1999/xhtml';
    for (const { el, seg } of resolvablePairs) {
      const tag = el.tagName.toLowerCase();
      const outTag = tag === 'li' ? 'li' : tag; // keep list structure for lists
      const translationElement = isXml
        ? doc.createElementNS(ns, outTag)
        : doc.createElement(outTag);
      translationElement.setAttribute('class', 'native-translate-translation');
      translationElement.textContent = seg.translatedText || '';
      el.parentNode?.insertBefore(translationElement, el.nextSibling);
    }

    // Debug logs (only in dev)
    // Dev-only debug logs (guarded by process.env)
    // eslint-disable-next-line no-console
    if (process?.env?.NODE_ENV !== 'production') {
      try {
        // eslint-disable-next-line no-console
        console.debug('[EPUB][inject] segments:', segments.length, 'inserted:', resolvablePairs.length, 'missing:', missing.length);
        if (missing.length > 0) {
          // eslint-disable-next-line no-console
          console.debug('[EPUB][inject] sample missing domPaths:', missing.slice(0, 5).map((m) => m.domPath));
        }
      } catch {
        // no-op
      }
    }

    if (isXml) {
      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc);
    }
    return doc.documentElement.outerHTML;
  }
}

export async function parseEpubFile(file: File): Promise<{ book: EpubBook; segments: TextSegment[] }> {
  if (!file.name.toLowerCase().endsWith('.epub')) {
    throw new Error('Only EPUB files are supported');
  }

  if (file.size > 50 * 1024 * 1024) { // 50MB limit
    throw new Error('File is too large (max 50MB)');
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const parser = new EpubParser(zip);
    const book = await parser.parse();
    const segments = await parser.extractTextSegments(book);

    return { book, segments };
  } catch (error) {
    console.error('EPUB parsing error:', error);
    throw new Error('Failed to parse EPUB file. Please check the file format.');
  }
}

export async function generateTranslatedEpub(
  originalFile: File,
  book: EpubBook,
  translatedSegments: TextSegment[]
): Promise<Blob> {
  const arrayBuffer = await originalFile.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const parser = new EpubParser(zip);
  await parser.parse(); // Initialize parser state

  return await parser.reconstructEpub(book, translatedSegments);
}