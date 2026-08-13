import { describe, expect, it } from 'vitest'
import {
  extractFromDocument,
  extractFromTextBlocks,
  joinExtractedText,
  PAGE_EXTRACT_MAX_CHARS,
} from '@/shared/extract'

const FIXTURE = `<!DOCTYPE html>
<html lang="en">
  <head><title>Fixture Article</title></head>
  <body>
    <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
    <aside class="sidebar">Subscribe to our newsletter</aside>
    <main>
      <article>
        <h1>On-device translation</h1>
        <p>Chrome can run Gemini Nano locally without sending text to a server.</p>
        <pre><code>const x = 1;</code></pre>
        <p>Summaries should ignore navigation, code samples, and cookie banners.</p>
        <ul>
          <li>Keep the original meaning.</li>
          <li>Prefer article body text.</li>
        </ul>
      </article>
    </main>
    <footer>Copyright 2026</footer>
    <div class="cookie">Accept cookies to continue</div>
  </body>
</html>`

describe('extractFromDocument', () => {
  it('chooses article body blocks and skips nav/code/footer', () => {
    const doc = new DOMParser().parseFromString(FIXTURE, 'text/html')
    const result = extractFromDocument(doc, { url: 'https://example.com/post' })

    expect(result.title).toBe('Fixture Article')
    expect(result.lang).toBe('en')
    expect(result.truncated).toBe(false)
    expect(result.blocks.some((block) => /Gemini Nano/.test(block))).toBe(true)
    expect(result.blocks.some((block) => /Summaries should ignore/.test(block))).toBe(true)
    expect(result.blocks.some((block) => /Keep the original meaning/.test(block))).toBe(true)
    expect(result.blocks.join('\n')).not.toMatch(
      /Home|Subscribe|const x = 1|Copyright|Accept cookies/,
    )
  })

  it('sets truncated when the body exceeds the character budget', () => {
    const long = 'word '.repeat(200)
    const html = `<html><body><main>${Array.from({ length: 20 }, (_, i) => `<p>${i} ${long}</p>`).join('')}</main></body></html>`
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const result = extractFromDocument(doc, { maxChars: 400 })
    expect(result.truncated).toBe(true)
    expect(result.charCount).toBeLessThanOrEqual(400)
    expect(joinExtractedText(result).length).toBeLessThanOrEqual(400 + 40)
  })
})

describe('extractFromTextBlocks', () => {
  it('truncates mid-block and preserves earlier blocks', () => {
    const result = extractFromTextBlocks({
      title: 'T',
      blocks: ['alpha paragraph text', 'bravo paragraph text', 'charlie paragraph text'],
      maxChars: 30,
    })
    expect(result.truncated).toBe(true)
    expect(result.blocks[0]).toBe('alpha paragraph text')
    expect(result.charCount).toBeLessThanOrEqual(30)
    expect(PAGE_EXTRACT_MAX_CHARS).toBe(60_000)
  })
})
