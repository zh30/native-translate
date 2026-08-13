export const PAGE_EXTRACT_MAX_CHARS = 60_000

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  'nav',
  'footer',
  'header',
  'aside',
  'form',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'pre',
  'code',
  'kbd',
  'samp',
])

const SKIP_ROLES = new Set([
  'navigation',
  'banner',
  'contentinfo',
  'complementary',
  'search',
  'toolbar',
  'menu',
  'menubar',
])

const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'figcaption',
  'dt',
  'dd',
  'td',
  'th',
  'article',
  'section',
  'main',
])

export interface PageExtractResult {
  title: string
  lang: string
  url?: string
  blocks: string[]
  truncated: boolean
  charCount: number
}

export function normalizeExtractText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function extractFromTextBlocks(input: {
  title?: string
  lang?: string
  url?: string
  blocks: readonly string[]
  maxChars?: number
}): PageExtractResult {
  const maxChars = input.maxChars ?? PAGE_EXTRACT_MAX_CHARS
  const blocks: string[] = []
  let charCount = 0
  let truncated = false

  for (const raw of input.blocks) {
    const text = normalizeExtractText(raw)
    if (!text) continue
    if (charCount >= maxChars) {
      truncated = true
      break
    }
    if (charCount + text.length > maxChars) {
      const remaining = maxChars - charCount
      if (remaining > 20) {
        blocks.push(text.slice(0, remaining).trim())
        charCount += remaining
      }
      truncated = true
      break
    }
    blocks.push(text)
    charCount += text.length
  }

  return {
    title: input.title?.trim() || '',
    lang: input.lang || '',
    ...(input.url ? { url: input.url } : {}),
    blocks,
    truncated,
    charCount,
  }
}

function shouldSkipElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase()
  if (SKIP_TAGS.has(tag)) return true
  const role = element.getAttribute('role')?.trim().toLowerCase()
  if (role && SKIP_ROLES.has(role)) return true
  const cls = `${element.className || ''}`.toLowerCase()
  if (/(^|\s)(nav|navbar|menu|sidebar|footer|cookie|banner)(\s|$)/.test(cls)) return true
  return false
}

function isBlockElement(element: Element): boolean {
  return BLOCK_TAGS.has(element.tagName.toLowerCase())
}

function collectBlocks(root: ParentNode, acc: string[]): void {
  const children = Array.from(root.childNodes)
  for (const node of children) {
    if (node.nodeType === 3) continue
    if (!(node instanceof Element)) continue
    if (shouldSkipElement(node)) continue
    if (isBlockElement(node)) {
      const hasNestedBlock = Array.from(node.children).some(
        (child) => isBlockElement(child) && !shouldSkipElement(child),
      )
      if (!hasNestedBlock) {
        const text = normalizeExtractText(node.textContent || '')
        if (text.length >= 12) acc.push(text)
        continue
      }
    }
    collectBlocks(node, acc)
  }
}

export function extractFromDocument(
  doc: Document,
  options?: { maxChars?: number; url?: string },
): PageExtractResult {
  const preferred =
    doc.querySelector('article') ||
    doc.querySelector('main') ||
    doc.querySelector('[role="main"]') ||
    doc.body
  const blocks: string[] = []
  if (preferred) collectBlocks(preferred, blocks)
  const title = doc.title || doc.querySelector('h1')?.textContent || ''
  const lang =
    doc.documentElement.getAttribute('lang') ||
    doc.querySelector('html')?.getAttribute('lang') ||
    ''
  return extractFromTextBlocks({
    title,
    lang,
    url: options?.url,
    blocks,
    maxChars: options?.maxChars,
  })
}

export function joinExtractedText(result: PageExtractResult): string {
  return result.blocks.join('\n\n')
}
