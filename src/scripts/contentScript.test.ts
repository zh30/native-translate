import { waitFor } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let latestTestables: Awaited<ReturnType<typeof loadContentScriptTestables>> | null = null

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function installChromeStub(localStorageValues: Record<string, unknown> = {}): void {
  const getLocalStorageValue = async (
    keys?: string | string[] | Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> => {
    if (!keys) return { ...localStorageValues }
    if (typeof keys === 'string') return { [keys]: localStorageValues[keys] }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, localStorageValues[key]]))
    }
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [key, localStorageValues[key] ?? fallback]),
    )
  }

  const storageArea = {
    get: vi.fn(getLocalStorageValue),
    set: vi.fn(async () => undefined),
  }

  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: vi.fn((key: string) => key),
    },
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://native-translate/${path}`),
      onMessage: {
        addListener: vi.fn(),
      },
    },
    storage: {
      local: storageArea,
      session: storageArea,
      onChanged: {
        addListener: vi.fn(),
      },
    },
  })
}

async function loadContentScriptTestables(localStorageValues: Record<string, unknown> = {}) {
  installChromeStub(localStorageValues)
  const module = await import('./contentScript')
  latestTestables = module.__testables
  return module.__testables
}

describe('content script DOM translation helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    document.documentElement.removeAttribute('lang')
    document.documentElement.removeAttribute('dir')
    window.__nativeLanguageDetector = undefined
    window.__nativeTranslateAdapter = undefined
    window.__nativeTranslatePool = undefined
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 24,
      width: 100,
      height: 24,
      toJSON: () => undefined,
    })
  })

  afterEach(() => {
    latestTestables?.stopFullPageTranslationObserver()
    latestTestables = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('collects text inside table cells without translating table structure as one block', async () => {
    document.body.innerHTML = `
      <main>
        <table>
          <thead>
            <tr>
              <th>Model name</th>
              <th>Accuracy score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Baseline translator</td>
              <td>Accuracy reaches seventy four percent on the sample.</td>
            </tr>
          </tbody>
        </table>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual([
      'th',
      'th',
      'td',
      'td',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Model name',
      'Accuracy score',
      'Baseline translator',
      'Accuracy reaches seventy four percent on the sample.',
    ])
  })

  it('collects text inside ARIA table cells without translating row wrappers as one block', async () => {
    document.body.innerHTML = `
      <main>
        <span role="table">
          <span role="row">
            <span role="columnheader">Model name</span>
            <span role="columnheader">Accuracy score</span>
          </span>
          <span role="row">
            <span role="rowheader">Baseline translator</span>
            <span role="cell">Accuracy reaches seventy four percent on the sample.</span>
          </span>
        </span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.getAttribute('role'))).toEqual([
      'columnheader',
      'columnheader',
      'rowheader',
      'cell',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Model name',
      'Accuracy score',
      'Baseline translator',
      'Accuracy reaches seventy four percent on the sample.',
    ])
  })

  it('collects text inside ARIA grid cells without translating grid wrappers as one block', async () => {
    document.body.innerHTML = `
      <main>
        <span role="grid">
          <span role="row">
            <span role="columnheader">Task name</span>
            <span role="columnheader">Current status</span>
          </span>
          <span role="row">
            <span role="gridcell">Document translation</span>
            <span role="gridcell">Ready for final review.</span>
          </span>
        </span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.getAttribute('role'))).toEqual([
      'columnheader',
      'columnheader',
      'gridcell',
      'gridcell',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Task name',
      'Current status',
      'Document translation',
      'Ready for final review.',
    ])
  })

  it('collects ARIA list items without translating the list wrapper as one block', async () => {
    document.body.innerHTML = `
      <main>
        <span role="list">
          <span role="listitem">Install the browser extension from the release page.</span>
          <span role="listitem">Open the side panel and choose the target language.</span>
        </span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.getAttribute('role'))).toEqual([
      'listitem',
      'listitem',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Install the browser extension from the release page.',
      'Open the side panel and choose the target language.',
    ])
  })

  it('collects ARIA feed articles without translating the feed wrapper as one block', async () => {
    document.body.innerHTML = `
      <main>
        <span role="feed">
          <span role="article">Release notes explain the latest translation improvements.</span>
          <span role="article">Community feedback highlights pages that need better coverage.</span>
        </span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.getAttribute('role'))).toEqual([
      'article',
      'article',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Release notes explain the latest translation improvements.',
      'Community feedback highlights pages that need better coverage.',
    ])
  })

  it('collects ARIA article paragraphs without translating the article wrapper as one block', async () => {
    document.body.innerHTML = `
      <main>
        <span role="article">
          <span role="paragraph">First paragraph from a component-rendered article.</span>
          <span role="paragraph">Second paragraph should remain a separate translation unit.</span>
        </span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.getAttribute('role'))).toEqual([
      'paragraph',
      'paragraph',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'First paragraph from a component-rendered article.',
      'Second paragraph should remain a separate translation unit.',
    ])
  })

  it('collects mixed-case ARIA article paragraphs without translating the wrapper as one block', async () => {
    document.body.innerHTML = `
      <main>
        <span role="Article">
          <span role="Paragraph">Mixed case paragraph role should still be detected.</span>
          <span role="Paragraph">Another mixed case paragraph should remain separate.</span>
        </span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.getAttribute('role'))).toEqual([
      'Paragraph',
      'Paragraph',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Mixed case paragraph role should still be detected.',
      'Another mixed case paragraph should remain separate.',
    ])
  })

  it('collects ARIA blockquote paragraphs without translating the quote wrapper as one block', async () => {
    document.body.innerHTML = `
      <main>
        <span role="blockquote">
          <span role="paragraph">The first quoted paragraph should be translated separately.</span>
          <span role="paragraph">The second quoted paragraph should not be merged with it.</span>
        </span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.getAttribute('role'))).toEqual([
      'paragraph',
      'paragraph',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'The first quoted paragraph should be translated separately.',
      'The second quoted paragraph should not be merged with it.',
    ])
  })

  it('collects ARIA term and definition items without translating the wrapper as one block', async () => {
    document.body.innerHTML = `
      <main>
        <span role="group">
          <span role="term">Source language</span>
          <span role="definition">The language detected from the current page content.</span>
          <span role="term">Target language</span>
          <span role="definition">The language selected for translated output.</span>
        </span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.getAttribute('role'))).toEqual([
      'term',
      'definition',
      'term',
      'definition',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Source language',
      'The language detected from the current page content.',
      'Target language',
      'The language selected for translated output.',
    ])
  })

  it('collects ARIA figure captions without translating the figure wrapper as one block', async () => {
    document.body.innerHTML = `
      <main>
        <span role="figure">
          <span role="img" aria-label="Chart placeholder"></span>
          <span role="caption">Quarterly revenue chart for the translated report.</span>
        </span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.getAttribute('role'))).toEqual(['caption'])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Quarterly revenue chart for the translated report.',
    ])
  })

  it('collects text inside details disclosure blocks without translating the container as one block', async () => {
    document.body.innerHTML = `
      <main>
        <details open>
          <summary>Frequently asked question title</summary>
          <p>Detailed answer text should be translated separately.</p>
        </details>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual(['summary', 'p'])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Frequently asked question title',
      'Detailed answer text should be translated separately.',
    ])
  })

  it('collects direct text from top-level custom elements', async () => {
    document.body.innerHTML = `
      <summary-label>Top level custom element text should be translated.</summary-label>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual(['summary-label'])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Top level custom element text should be translated.',
    ])
  })

  it('translates loose text and child blocks from top-level custom elements', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <article-card>
        Introductory custom element text should be translated.
        <p>Custom element paragraph should also be translated.</p>
      </article-card>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing custom element')
    expect(host.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
      'translated: Introductory custom element text should be translated.',
    )
    expect(host.querySelector('p .native-translate-translation')).toHaveTextContent(
      'translated: Custom element paragraph should also be translated.',
    )
  })

  it('skips collapsed details body text until the disclosure is opened', async () => {
    document.body.innerHTML = `
      <main>
        <details>
          <summary>Collapsed question title</summary>
          <p>Collapsed answer text should wait until the user opens it.</p>
        </details>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual(['summary'])
    expect(blocks.map(({ text }) => text)).toEqual(['Collapsed question title'])
  })

  it('translates collapsed details body text after the disclosure opens dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <details>
          <summary>Collapsed question title</summary>
          <p>Collapsed answer text should translate after opening.</p>
        </details>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const details = document.querySelector('details')
    const answer = document.querySelector('details p')
    if (!details || !answer) throw new Error('Missing details elements')
    expect(answer.querySelector('.native-translate-translation')).toBeNull()

    details.setAttribute('open', '')

    await waitFor(() => {
      expect(answer.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Collapsed answer text should translate after opening.',
      )
    })
  })

  it('removes details body translations after an open disclosure collapses dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <details open>
          <summary>Open question title</summary>
          <p>Expanded answer text should be cleared after collapsing.</p>
        </details>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const details = document.querySelector('details')
    const answer = document.querySelector('details p')
    if (!details || !answer) throw new Error('Missing details elements')
    expect(answer.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Expanded answer text should be cleared after collapsing.',
    )

    details.removeAttribute('open')

    await waitFor(() => {
      expect(answer.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(answer).not.toHaveAttribute('data-native-translate-done')
  })

  it('skips closed dialog text until the dialog is opened', async () => {
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <dialog>
          <p>Dialog body text should wait until the dialog opens.</p>
        </dialog>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual(['Visible page text should be translated.'])
  })

  it('skips inert template content during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <template>
          <p>Template body text should not be translated before rendering.</p>
        </template>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual(['Visible page text should be translated.'])
  })

  it('translates closed dialog text after the dialog opens dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <dialog>
          <p>Dialog body text should translate after opening.</p>
        </dialog>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const dialog = document.querySelector('dialog')
    const dialogText = document.querySelector('dialog p')
    if (!dialog || !dialogText) throw new Error('Missing dialog elements')
    expect(dialogText.querySelector('.native-translate-translation')).toBeNull()

    dialog.setAttribute('open', '')

    await waitFor(() => {
      expect(dialogText.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Dialog body text should translate after opening.',
      )
    })
  })

  it('removes dialog translations after an open dialog closes dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <dialog open>
          <p>Dialog body text should be cleared after closing.</p>
        </dialog>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const dialog = document.querySelector('dialog')
    const dialogText = document.querySelector('dialog p')
    if (!dialog || !dialogText) throw new Error('Missing dialog elements')
    expect(dialogText.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Dialog body text should be cleared after closing.',
    )

    dialog.removeAttribute('open')

    await waitFor(() => {
      expect(dialogText.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(dialogText).not.toHaveAttribute('data-native-translate-done')
  })

  it('translates and clears dialog text through showModal and close', async () => {
    const originalShowModal = HTMLDialogElement.prototype.showModal
    const originalClose = HTMLDialogElement.prototype.close
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '')
      },
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open')
      },
    })

    try {
      document.documentElement.setAttribute('lang', 'en')
      document.body.innerHTML = `
        <main>
          <p>Visible page text should be translated.</p>
          <dialog>
            <p>Dialog API text should translate while open.</p>
          </dialog>
        </main>
      `

      const testables = await loadContentScriptTestables()
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(async () => ({
          translate: async (text: string) => `translated: ${text}`,
        })),
      })

      await testables.translateFullPageAutoDetect('zh')

      const dialog = document.querySelector('dialog')
      const dialogText = document.querySelector('dialog p')
      if (!dialog || !dialogText) throw new Error('Missing dialog elements')
      expect(dialogText.querySelector('.native-translate-translation')).toBeNull()

      dialog.showModal()

      await waitFor(() => {
        expect(dialogText.querySelector('.native-translate-translation')).toHaveTextContent(
          'translated: Dialog API text should translate while open.',
        )
      })

      dialog.close()

      await waitFor(() => {
        expect(dialogText.querySelector('.native-translate-translation')).toBeNull()
      })
      expect(dialogText).not.toHaveAttribute('data-native-translate-done')
    } finally {
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
        configurable: true,
        value: originalShowModal,
      })
      Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        configurable: true,
        value: originalClose,
      })
    }
  })

  it('collects table captions and form legends as translatable text blocks', async () => {
    document.body.innerHTML = `
      <main>
        <table>
          <caption>Revenue summary for the current quarter</caption>
          <tbody>
            <tr>
              <td>Subscription revenue increased steadily.</td>
            </tr>
          </tbody>
        </table>
        <fieldset>
          <legend>Customer profile preferences</legend>
          <p>Choose the notification settings for this account.</p>
        </fieldset>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual([
      'caption',
      'td',
      'legend',
      'p',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Revenue summary for the current quarter',
      'Subscription revenue increased steadily.',
      'Customer profile preferences',
      'Choose the notification settings for this account.',
    ])
  })

  it('collects output elements as standalone result text', async () => {
    document.body.innerHTML = `
      <main>
        <form>
          <label>Monthly seats</label>
          <output>Total subscription cost is updated automatically.</output>
        </form>
        <p>Review the billing summary before checkout.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual([
      'label',
      'output',
      'p',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Monthly seats',
      'Total subscription cost is updated automatically.',
      'Review the billing summary before checkout.',
    ])
  })

  it('collects form labels without translating the input controls', async () => {
    document.body.innerHTML = `
      <main>
        <form>
          <label>
            Email address for billing updates
            <input
              type="email"
              value="user@example.com"
              placeholder="Enter your work email address"
            >
          </label>
          <p>Use a work email address when possible.</p>
        </form>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual(['label', 'p'])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Email address for billing updates',
      'Use a work email address when possible.',
    ])
  })

  it('translates document titles during full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.title = 'Quarterly revenue dashboard'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(document.title).toBe('translated: Quarterly revenue dashboard')
  })

  it('restores translated document titles when the active page language matches the target', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.title = 'Quarterly revenue dashboard'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')
    expect(document.title).toBe('translated: Quarterly revenue dashboard')

    await testables.translateFullPageAutoDetect('en')

    expect(document.title).toBe('Quarterly revenue dashboard')
  })

  it('translates document title changes after full page translation starts', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.title = 'Quarterly revenue dashboard'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')
    document.title = 'Product analytics workspace'

    await waitFor(() => {
      expect(document.title).toBe('translated: Product analytics workspace')
    })
  })

  it('translates visible form placeholder attributes without inserting adjacent prose', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input type="email" placeholder="Enter your work email address">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing input')
    expect(input).toHaveAttribute('placeholder', 'translated: Enter your work email address')
    expect(input.nextElementSibling?.classList.contains('native-translate-translation')).not.toBe(
      true,
    )
  })

  it('translates visible contenteditable data placeholder attributes without visible inserts', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <div contenteditable="true" data-placeholder="Write a comment for this article"></div>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const editor = document.querySelector('[contenteditable]')
    if (!editor) throw new Error('Missing contenteditable editor')
    expect(editor).toHaveAttribute(
      'data-placeholder',
      'translated: Write a comment for this article',
    )
    expect(editor.nextElementSibling?.classList.contains('native-translate-translation')).not.toBe(
      true,
    )
  })

  it('translates visible number input placeholder attributes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input type="number" placeholder="Enter invoice quantity">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing input')
    expect(input).toHaveAttribute('placeholder', 'translated: Enter invoice quantity')
  })

  it('translates latest placeholder text changed while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input placeholder="Search account settings">
      </main>
    `

    const testables = await loadContentScriptTestables()
    const searchTranslation = createDeferred<string>()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) =>
          text === 'Search account settings' ? searchTranslation.promise : `translated: ${text}`,
      })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalled()
    })
    const input = document.querySelector('input')
    if (!input) throw new Error('Missing pending placeholder setup')
    input.setAttribute('placeholder', 'Search billing reports')
    searchTranslation.resolve('translated: Search account settings')
    await translationPromise

    expect(input).toHaveAttribute('placeholder', 'translated: Search billing reports')
    expect(input).toHaveAttribute(
      'data-native-translate-original-placeholder',
      'Search billing reports',
    )
    expect(input).toHaveAttribute('data-native-translate-placeholder-done', '1')
  })

  it('does not translate latest placeholder text after the input becomes hidden while pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input placeholder="Search account settings">
      </main>
    `

    const testables = await loadContentScriptTestables()
    const searchTranslation = createDeferred<string>()
    const translate = vi.fn(async (text: string) =>
      text === 'Search account settings' ? searchTranslation.promise : `translated: ${text}`,
    )
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalled()
    })
    const input = document.querySelector('input')
    if (!input) throw new Error('Missing pending hidden placeholder setup')
    input.hidden = true
    input.setAttribute('placeholder', 'Search hidden billing reports')
    searchTranslation.resolve('translated: Search account settings')
    await translationPromise

    expect(translate).not.toHaveBeenCalledWith('Search hidden billing reports')
    expect(input).toHaveAttribute('placeholder', 'Search hidden billing reports')
    expect(input).not.toHaveAttribute('data-native-translate-original-placeholder')
    expect(input).not.toHaveAttribute('data-native-translate-placeholder-done')
  })

  it('does not translate dynamic placeholders that become hidden while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    window.__nativeTranslateAdapter = undefined
    window.__nativeTranslatePool = undefined
    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const input = document.createElement('input')
    input.type = 'search'
    input.placeholder = 'Buscar configuracion de cuenta'
    main.appendChild(input)

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Buscar configuracion de cuenta')
    })
    input.hidden = true
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

    await new Promise((resolve) => setTimeout(resolve, 160))

    expect(translate).not.toHaveBeenCalledWith('Buscar configuracion de cuenta')
    expect(input).toHaveAttribute('placeholder', 'Buscar configuracion de cuenta')
    expect(input).not.toHaveAttribute('data-native-translate-original-placeholder')
    expect(input).not.toHaveAttribute('data-native-translate-placeholder-done')
  })

  it('translates only the latest dynamic placeholder text changed while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    window.__nativeTranslateAdapter = undefined
    window.__nativeTranslatePool = undefined
    window.__nativeLanguageDetector = undefined
    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const input = document.createElement('input')
    input.type = 'search'
    input.placeholder = 'Buscar configuracion de cuenta'
    main.appendChild(input)

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Buscar configuracion de cuenta')
    })
    input.placeholder = 'Buscar facturas recientes'
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

    await waitFor(() => {
      expect(input).toHaveAttribute('placeholder', 'translated: Buscar facturas recientes')
    })

    expect(translate).not.toHaveBeenCalledWith('Buscar configuracion de cuenta')
    expect(translate).toHaveBeenCalledWith('Buscar facturas recientes')
    expect(input).toHaveAttribute(
      'data-native-translate-original-placeholder',
      'Buscar facturas recientes',
    )
  })

  it('restores translated placeholder attributes when clearing full page translations', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input type="search" placeholder="Search account settings">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing input')
    expect(input).toHaveAttribute('placeholder', 'translated: Search account settings')

    await testables.translateFullPageAutoDetect('en')

    expect(input).toHaveAttribute('placeholder', 'Search account settings')
    expect(input).not.toHaveAttribute('data-native-translate-placeholder-done')
    expect(input).not.toHaveAttribute('data-native-translate-original-placeholder')
  })

  it('includes placeholder attributes in source language detection samples', async () => {
    document.body.innerHTML = `
      <main>
        <input type="search" placeholder="Buscar configuracion de cuenta ahora">
      </main>
    `

    const testables = await loadContentScriptTestables()
    const detect = vi.fn(async (sample: string) => [
      {
        confidence: 0.9,
        detectedLanguage: sample.includes('Buscar configuracion') ? 'es' : 'en',
      },
    ])
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { sourceLanguage: string }) => ({
        translate: async (text: string) => `${options.sourceLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(detect).toHaveBeenCalledWith(
      expect.stringContaining('Buscar configuracion de cuenta ahora'),
    )
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'es',
        targetLanguage: 'zh-CN',
      }),
    )
    expect(document.querySelector('input')).toHaveAttribute(
      'placeholder',
      'es: Buscar configuracion de cuenta ahora',
    )
  })

  it('includes document titles in source language detection samples', async () => {
    document.title = 'Panel de metricas de ingresos ahora'
    document.body.innerHTML = '<main></main>'

    const testables = await loadContentScriptTestables()
    const detect = vi.fn(async (sample: string) => [
      {
        confidence: 0.9,
        detectedLanguage: sample.includes('Panel de metricas') ? 'es' : 'en',
      },
    ])
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { sourceLanguage: string }) => ({
        translate: async (text: string) => `${options.sourceLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(detect).toHaveBeenCalledWith(
      expect.stringContaining('Panel de metricas de ingresos ahora'),
    )
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'es',
        targetLanguage: 'zh-CN',
      }),
    )
    expect(document.title).toBe('es: Panel de metricas de ingresos ahora')
  })

  it('includes shadow root attribute text in source language detection samples', async () => {
    document.body.innerHTML = '<main><settings-panel></settings-panel></main>'
    const host = document.querySelector('settings-panel')
    if (!host) throw new Error('Missing shadow host')
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<button aria-label="Buscar configuracion de cuenta ahora"></button>'

    const testables = await loadContentScriptTestables()
    const detect = vi.fn(async (sample: string) => [
      {
        confidence: 0.9,
        detectedLanguage: sample.includes('Buscar configuracion') ? 'es' : 'en',
      },
    ])
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { sourceLanguage: string }) => ({
        translate: async (text: string) => `${options.sourceLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(detect).toHaveBeenCalledWith(
      expect.stringContaining('Buscar configuracion de cuenta ahora'),
    )
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'es',
        targetLanguage: 'zh-CN',
      }),
    )
    expect(host.shadowRoot?.querySelector('button')).toHaveAttribute(
      'aria-label',
      'es: Buscar configuracion de cuenta ahora',
    )
  })

  it('translates visible accessibility and tooltip attributes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button
          aria-label="Open account settings"
          aria-braillelabel="acct settings"
          aria-brailleroledescription="settings launcher"
          aria-description="Only account administrators can change this setting"
          aria-placeholder="Search account settings"
          aria-roledescription="account settings launcher"
          title="Account settings menu"
        ></button>
        <div
          role="slider"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="75"
          aria-valuetext="High priority account usage"
        ></div>
        <img alt="Quarterly revenue chart" title="Revenue chart details">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    const slider = document.querySelector('[role="slider"]')
    const image = document.querySelector('img')
    if (!button || !slider || !image) throw new Error('Missing attributed elements')

    expect(button).toHaveAttribute('aria-label', 'translated: Open account settings')
    expect(button).toHaveAttribute('aria-braillelabel', 'translated: acct settings')
    expect(button).toHaveAttribute('aria-brailleroledescription', 'translated: settings launcher')
    expect(button).toHaveAttribute(
      'aria-description',
      'translated: Only account administrators can change this setting',
    )
    expect(button).toHaveAttribute('aria-placeholder', 'translated: Search account settings')
    expect(button).toHaveAttribute('aria-roledescription', 'translated: account settings launcher')
    expect(button).toHaveAttribute('title', 'translated: Account settings menu')
    expect(slider).toHaveAttribute('aria-valuetext', 'translated: High priority account usage')
    expect(image).toHaveAttribute('alt', 'translated: Quarterly revenue chart')
    expect(image).toHaveAttribute('title', 'translated: Revenue chart details')
    expect(button.nextElementSibling?.classList.contains('native-translate-translation')).not.toBe(
      true,
    )
  })

  it('translates common JavaScript tooltip data attributes without visible inserts', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button
          data-original-title="Open legacy Bootstrap tooltip"
          data-bs-original-title="Open initialized Bootstrap tooltip"
          data-bs-title="Open Bootstrap tooltip"
          data-intro="Start the guided tour from here"
          data-tippy-content="Open interactive Tippy tooltip"
          data-tip="Open React tooltip"
          data-tooltip="Open generic tooltip"
          data-tooltip-content="Open generic tooltip content"
        ></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing tooltip button')
    expect(button).toHaveAttribute(
      'data-original-title',
      'translated: Open legacy Bootstrap tooltip',
    )
    expect(button).toHaveAttribute(
      'data-bs-original-title',
      'translated: Open initialized Bootstrap tooltip',
    )
    expect(button).toHaveAttribute('data-bs-title', 'translated: Open Bootstrap tooltip')
    expect(button).toHaveAttribute('data-intro', 'translated: Start the guided tour from here')
    expect(button).toHaveAttribute(
      'data-tippy-content',
      'translated: Open interactive Tippy tooltip',
    )
    expect(button).toHaveAttribute('data-tip', 'translated: Open React tooltip')
    expect(button).toHaveAttribute('data-tooltip', 'translated: Open generic tooltip')
    expect(button).toHaveAttribute(
      'data-tooltip-content',
      'translated: Open generic tooltip content',
    )
    expect(button.nextElementSibling?.classList.contains('native-translate-translation')).not.toBe(
      true,
    )
  })

  it('translates JavaScript popover content data attributes only on popover triggers', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button data-toggle="popover" data-content="Legacy popover body text"></button>
        <button data-bs-toggle="popover" data-bs-content="Bootstrap popover body text"></button>
        <div data-content="Internal application content key"></div>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const legacyPopover = document.querySelector('[data-toggle="popover"]')
    const bootstrapPopover = document.querySelector('[data-bs-toggle="popover"]')
    const genericData = document.querySelector('div[data-content]')
    if (!legacyPopover || !bootstrapPopover || !genericData) {
      throw new Error('Missing popover data elements')
    }
    expect(legacyPopover).toHaveAttribute('data-content', 'translated: Legacy popover body text')
    expect(bootstrapPopover).toHaveAttribute(
      'data-bs-content',
      'translated: Bootstrap popover body text',
    )
    expect(genericData).toHaveAttribute('data-content', 'Internal application content key')
    expect(
      legacyPopover.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
    expect(
      bootstrapPopover.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('translates latest accessibility attributes changed while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button aria-label="Open account settings"></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const labelTranslation = createDeferred<string>()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) =>
          text === 'Open account settings' ? labelTranslation.promise : `translated: ${text}`,
      })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalled()
    })
    const button = document.querySelector('button')
    if (!button) throw new Error('Missing pending label setup')
    button.setAttribute('aria-label', 'Open billing preferences')
    labelTranslation.resolve('translated: Open account settings')
    await translationPromise

    expect(button).toHaveAttribute('aria-label', 'translated: Open billing preferences')
    expect(button).toHaveAttribute(
      'data-native-translate-original-aria-label',
      'Open billing preferences',
    )
    expect(button).toHaveAttribute('data-native-translate-aria-label-done', '1')
  })

  it('translates visible SVG accessibility labels', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" aria-label="Quarterly revenue trend chart" width="120" height="60">
          <path d="M0 40 L40 20 L80 30 L120 10"></path>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 120,
      bottom: 60,
      width: 120,
      height: 60,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const chart = document.querySelector('svg')
    if (!chart) throw new Error('Missing chart')
    expect(chart).toHaveAttribute('aria-label', 'translated: Quarterly revenue trend chart')
  })

  it('translates image map area alt text based on the associated image visibility', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')
    expect(area).toHaveAttribute('href', '/reports')
  })

  it('translates image map area labels when any associated image is visible', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <img hidden src="/dashboard-hidden.png" usemap="#dashboard-map" alt="Hidden map copy">
        <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing shared image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')
    expect(area).toHaveAttribute('href', '/reports')
  })

  it('skips image map area labels unless one associated image is both visible and translatable', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <img class="notranslate" src="/dashboard-protected.png" usemap="#dashboard-map" alt="Protected map copy">
        <img src="/dashboard-hidden.png" usemap="#dashboard-map" alt="Hidden map copy">
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    const images = document.querySelectorAll('img')
    if (!area || images.length !== 2) throw new Error('Missing shared image map elements')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))
    images[1].getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(area).toHaveAttribute('alt', 'Open revenue reports')
    expect(area).not.toHaveAttribute('data-native-translate-original-alt')
    expect(area).not.toHaveAttribute('data-native-translate-alt-done')
  })

  it('translates image map area accessibility labels based on the associated image visibility', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
        <map name="dashboard-map">
          <area
            shape="rect"
            coords="0,0,100,100"
            href="/reports"
            aria-label="Open revenue reports"
            title="Revenue reports area"
          >
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(area).toHaveAttribute('aria-label', 'translated: Open revenue reports')
    expect(area).toHaveAttribute('title', 'translated: Revenue reports area')
    expect(area).toHaveAttribute('href', '/reports')
  })

  it('translates image map area alt text inside open shadow roots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <dashboard-widget></dashboard-widget>
      </main>
    `

    const host = document.querySelector('dashboard-widget')
    if (!host) throw new Error('Missing dashboard widget host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
      <map name="dashboard-map">
        <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
      </map>
    `

    const area = shadowRoot.querySelector('area')
    if (!area) throw new Error('Missing shadow image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')
  })

  it('translates image map area labels when an image usemap association is added dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <img src="/dashboard.png" alt="Dashboard navigation map">
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const image = document.querySelector('img')
    if (!image) throw new Error('Missing image map trigger')
    expect(area).toHaveAttribute('alt', 'Open revenue reports')

    image.setAttribute('usemap', '#dashboard-map')

    await waitFor(() => {
      expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')
    })
    expect(area).toHaveAttribute('href', '/reports')
  })

  it('translates image map area labels when associated images are inserted dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(area).toHaveAttribute('alt', 'Open revenue reports')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const image = document.createElement('img')
    image.src = '/dashboard.png'
    image.setAttribute('usemap', '#dashboard-map')
    image.alt = 'Dashboard navigation map'
    main.insertBefore(image, main.querySelector('map'))

    await waitFor(() => {
      expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')
    })
    expect(area).toHaveAttribute('href', '/reports')
  })

  it('translates image map area labels when containers with associated images are inserted dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(area).toHaveAttribute('alt', 'Open revenue reports')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const figure = document.createElement('figure')
    figure.innerHTML = `
      <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
    `
    main.insertBefore(figure, main.querySelector('map'))

    await waitFor(() => {
      expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')
    })
    expect(area).toHaveAttribute('href', '/reports')
  })

  it('translates image map area labels when associated image containers become visible through arbitrary class removal', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.collapsed-map { display: none; }</style>'
    document.body.innerHTML = `
      <header class="collapsed-map">
        <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
      </header>
      <main>
        <p>Initial paragraph for translation.</p>
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const header = document.querySelector('header')
    if (!header) throw new Error('Missing image map trigger container')
    expect(area).toHaveAttribute('alt', 'Open revenue reports')

    header.removeAttribute('class')

    await waitFor(() => {
      expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')
    })
    expect(area).toHaveAttribute('href', '/reports')
  })

  it('translates image map area labels when a map name association is added dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
        <map name="pending-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const map = document.querySelector('map')
    if (!map) throw new Error('Missing image map')
    expect(area).toHaveAttribute('alt', 'Open revenue reports')

    map.setAttribute('name', 'dashboard-map')

    await waitFor(() => {
      expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')
    })
    expect(area).toHaveAttribute('href', '/reports')
  })

  it('restores image map area labels when the associated image becomes hidden dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const image = document.querySelector('img')
    if (!image) throw new Error('Missing image map trigger')
    expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')

    image.setAttribute('hidden', '')

    await waitFor(() => {
      expect(area).toHaveAttribute('alt', 'Open revenue reports')
      expect(area).not.toHaveAttribute('data-native-translate-original-alt')
      expect(area).not.toHaveAttribute('data-native-translate-alt-done')
    })
  })

  it('restores image map area labels when an associated image container becomes notranslate dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <header>
        <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
      </header>
      <main>
        <p>Initial paragraph for translation.</p>
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const header = document.querySelector('header')
    if (!header) throw new Error('Missing image map trigger container')
    expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')

    header.className = 'notranslate'

    await waitFor(() => {
      expect(area).toHaveAttribute('alt', 'Open revenue reports')
      expect(area).not.toHaveAttribute('data-native-translate-original-alt')
      expect(area).not.toHaveAttribute('data-native-translate-alt-done')
    })
  })

  it('restores shared image map area labels when the last visible image becomes hidden', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <img hidden src="/dashboard-hidden.png" usemap="#dashboard-map" alt="Hidden map copy">
        <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing shared image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const visibleImage = Array.from(document.querySelectorAll('img')).find((image) => !image.hidden)
    if (!visibleImage) throw new Error('Missing visible shared image map trigger')
    expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')

    visibleImage.hidden = true

    await waitFor(() => {
      expect(area).toHaveAttribute('alt', 'Open revenue reports')
      expect(area).not.toHaveAttribute('data-native-translate-original-alt')
      expect(area).not.toHaveAttribute('data-native-translate-alt-done')
    })
  })

  it('restores image map area labels when associated images are removed from separate containers', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <header>
        <img src="/dashboard.png" usemap="#dashboard-map" alt="Dashboard navigation map">
      </header>
      <main>
        <p>Initial paragraph for translation.</p>
        <map name="dashboard-map">
          <area shape="rect" coords="0,0,100,100" href="/reports" alt="Open revenue reports">
        </map>
      </main>
    `
    const area = document.querySelector('area')
    if (!area) throw new Error('Missing image map area')
    area.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const image = document.querySelector('img')
    if (!image) throw new Error('Missing image map trigger')
    expect(area).toHaveAttribute('alt', 'translated: Open revenue reports')

    image.remove()

    await waitFor(() => {
      expect(area).toHaveAttribute('alt', 'Open revenue reports')
      expect(area).not.toHaveAttribute('data-native-translate-original-alt')
      expect(area).not.toHaveAttribute('data-native-translate-alt-done')
    })
  })

  it('translates visible SVG title and description text', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="120" height="60">
          <title>Quarterly revenue trend chart</title>
          <desc>Line chart comparing revenue across the last four quarters</desc>
          <path d="M0 40 L40 20 L80 30 L120 10"></path>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 120,
      bottom: 60,
      width: 120,
      height: 60,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const title = document.querySelector('svg title')
    const description = document.querySelector('svg desc')
    if (!title || !description) throw new Error('Missing SVG metadata')
    expect(title).toHaveTextContent('translated: Quarterly revenue trend chart')
    expect(description).toHaveTextContent(
      'translated: Line chart comparing revenue across the last four quarters',
    )
  })

  it('translates latest SVG metadata text changed while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="120" height="60">
          <title>Initial revenue chart title</title>
          <path d="M0 40 L40 20 L80 30 L120 10"></path>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 120,
      bottom: 60,
      width: 120,
      height: 60,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    const titleTranslation = createDeferred<string>()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) =>
          text === 'Initial revenue chart title' ? titleTranslation.promise : `translated: ${text}`,
      })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalled()
    })
    const title = document.querySelector('svg title')
    if (!title) throw new Error('Missing pending SVG title')
    title.textContent = 'Updated revenue chart title'
    titleTranslation.resolve('translated: Initial revenue chart title')
    await translationPromise

    expect(title).toHaveTextContent('translated: Updated revenue chart title')
    expect(title).toHaveAttribute(
      'data-native-translate-original-text-content',
      'Updated revenue chart title',
    )
    expect(title).toHaveAttribute('data-native-translate-text-content-done', '1')
  })

  it('translates visible SVG chart text labels in place', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <text x="10" y="20">Quarterly revenue</text>
          <text x="10" y="50">North America sales</text>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const labels = Array.from(document.querySelectorAll('svg text'))
    expect(labels.map((label) => label.textContent)).toEqual([
      'translated: Quarterly revenue',
      'translated: North America sales',
    ])
    expect(document.querySelector('svg .native-translate-translation')).toBeNull()
  })

  it('collects HTML labels inside SVG foreignObject chart regions', async () => {
    document.body.innerHTML = `
      <main>
        <svg width="400" height="200">
          <g>
            <title>Decorative series group title should stay on the SVG path.</title>
          </g>
          <foreignObject x="10" y="20" width="180" height="80">
            <div xmlns="http://www.w3.org/1999/xhtml">
              <p>Revenue annotation inside chart tooltip region.</p>
            </div>
          </foreignObject>
        </svg>
        <p>Visible page text should be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toContain(
      'Revenue annotation inside chart tooltip region.',
    )
    expect(blocks.map(({ text }) => text)).not.toContain(
      'Decorative series group title should stay on the SVG path.',
    )
  })

  it('collects HTML labels inside SVG switch foreignObject fallbacks', async () => {
    document.body.innerHTML = `
      <main>
        <svg width="400" height="200">
          <switch>
            <foreignObject x="10" y="20" width="180" height="80">
              <div xmlns="http://www.w3.org/1999/xhtml">
                <p>Revenue annotation inside switch fallback.</p>
              </div>
            </foreignObject>
            <text x="10" y="20">Decorative SVG fallback should stay on the SVG path.</text>
          </switch>
        </svg>
        <p>Visible page text should be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toContain('Revenue annotation inside switch fallback.')
    expect(blocks.map(({ text }) => text)).not.toContain(
      'Decorative SVG fallback should stay on the SVG path.',
    )
  })

  it('collects HTML labels inside linked SVG foreignObject regions', async () => {
    document.body.innerHTML = `
      <main>
        <svg width="400" height="200">
          <a href="/reports">
            <foreignObject x="10" y="20" width="180" height="80">
              <div xmlns="http://www.w3.org/1999/xhtml">
                <p>Revenue annotation inside linked chart region.</p>
              </div>
            </foreignObject>
            <text x="10" y="20">Decorative linked SVG label should stay on the SVG path.</text>
          </a>
        </svg>
        <p>Visible page text should be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toContain(
      'Revenue annotation inside linked chart region.',
    )
    expect(blocks.map(({ text }) => text)).not.toContain(
      'Decorative linked SVG label should stay on the SVG path.',
    )
  })

  it('translates latest SVG text changed while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <text x="10" y="20">Quarterly revenue</text>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    const labelTranslation = createDeferred<string>()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) =>
          text === 'Quarterly revenue' ? labelTranslation.promise : `translated: ${text}`,
      })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalled()
    })
    const label = document.querySelector('svg text')
    if (!label) throw new Error('Missing pending SVG label setup')
    label.textContent = 'Updated revenue forecast'
    labelTranslation.resolve('translated: Quarterly revenue')
    await translationPromise

    expect(label).toHaveTextContent('translated: Updated revenue forecast')
    expect(label).toHaveAttribute(
      'data-native-translate-original-text-content',
      'Updated revenue forecast',
    )
    expect(label).toHaveAttribute('data-native-translate-text-content-done', '1')
  })

  it('skips SVG chart text labels hidden by SVG style rules', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <text x="10" y="20">Visible revenue label</text>
          <text x="10" y="50" style="display: none">Hidden revenue note</text>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const labels = Array.from(document.querySelectorAll('svg text'))
    expect(labels.map((label) => label.textContent)).toEqual([
      'translated: Visible revenue label',
      'Hidden revenue note',
    ])
  })

  it('skips SVG chart text labels hidden by SVG presentation attributes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <text x="10" y="20">Visible margin label</text>
          <text x="10" y="50" visibility="hidden">Hidden axis label</text>
          <g display="none">
            <text x="10" y="70">Hidden group label</text>
          </g>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const labels = Array.from(document.querySelectorAll('svg text'))
    expect(labels.map((label) => label.textContent)).toEqual([
      'translated: Visible margin label',
      'Hidden axis label',
      'Hidden group label',
    ])
  })

  it('translates SVG tspan labels without flattening chart text layout', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <text x="10" y="20">
            <tspan x="10" dy="0">Quarterly revenue</tspan>
            <tspan x="10" dy="16">North America sales</tspan>
          </text>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const tspans = Array.from(document.querySelectorAll('svg text tspan'))
    expect(tspans).toHaveLength(2)
    expect(tspans.map((label) => label.textContent?.trim())).toEqual([
      'translated: Quarterly revenue',
      'translated: North America sales',
    ])
    expect(tspans[0]).toHaveAttribute('x', '10')
    expect(tspans[1]).toHaveAttribute('dy', '16')
    expect(document.querySelector('svg .native-translate-translation')).toBeNull()
  })

  it('translates SVG textPath labels without flattening path layout', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <defs>
            <path id="label-path" d="M10 40 C60 10 120 10 170 40"></path>
          </defs>
          <text>
            <textPath href="#label-path" startOffset="20%">Projected revenue curve</textPath>
          </text>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const textPath = document.querySelector('svg text textPath')
    expect(textPath).toHaveTextContent('translated: Projected revenue curve')
    expect(textPath).toHaveAttribute('href', '#label-path')
    expect(textPath).toHaveAttribute('startOffset', '20%')
    expect(document.querySelector('svg .native-translate-translation')).toBeNull()
  })

  it('translates linked SVG text labels without flattening chart links', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <text x="10" y="20">
            <a href="/reports">Open revenue report</a>
          </text>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const link = document.querySelector('svg text a')
    expect(link).toHaveTextContent('translated: Open revenue report')
    expect(link).toHaveAttribute('href', '/reports')
    expect(document.querySelector('svg .native-translate-translation')).toBeNull()
  })

  it('translates linked SVG tspan labels without flattening chart link layout', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <text x="10" y="20">
            <a href="/reports">
              <tspan x="10" dy="0">Open revenue report</tspan>
            </a>
          </text>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const link = document.querySelector('svg text a')
    const label = document.querySelector('svg text a tspan')
    expect(link).toHaveAttribute('href', '/reports')
    expect(label).toHaveTextContent('translated: Open revenue report')
    expect(label).toHaveAttribute('x', '10')
    expect(label).toHaveAttribute('dy', '0')
    expect(document.querySelector('svg .native-translate-translation')).toBeNull()
  })

  it('refreshes translated SVG tspan labels when chart text changes dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <text x="10" y="20">
            <tspan x="10" dy="0">Quarterly revenue</tspan>
          </text>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const label = document.querySelector('svg text tspan')
    if (!label || !label.firstChild) throw new Error('Missing SVG tspan label')
    expect(label).toHaveTextContent('translated: Quarterly revenue')

    label.firstChild.textContent = 'Updated revenue forecast'

    await waitFor(() => {
      expect(label).toHaveTextContent('translated: Updated revenue forecast')
    })
    expect(label).toHaveAttribute('x', '10')
    expect(label).toHaveAttribute('dy', '0')
  })

  it('removes translated SVG labels when presentation attributes hide them dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80">
          <text x="10" y="20">Quarterly revenue</text>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const label = document.querySelector('svg text')
    if (!label) throw new Error('Missing SVG label')
    expect(label).toHaveTextContent('translated: Quarterly revenue')

    label.setAttribute('visibility', 'hidden')

    await waitFor(() => {
      expect(label.textContent).toBe('Quarterly revenue')
      expect(label).not.toHaveAttribute('data-native-translate-text-content-done')
    })
  })

  it('translates SVG labels inserted after full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80"></svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const chart = document.querySelector('svg')
    if (!chart) throw new Error('Missing SVG chart')
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', '10')
    label.setAttribute('y', '20')
    label.textContent = 'Updated revenue forecast'
    chart.appendChild(label)

    await waitFor(() => {
      expect(label).toHaveTextContent('translated: Updated revenue forecast')
    })
    expect(label).toHaveAttribute('x', '10')
    expect(label).toHaveAttribute('y', '20')
  })

  it('uses the detected language for SVG labels inserted after full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80"></svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (text: string) => [
          {
            confidence: 0.9,
            detectedLanguage: text.startsWith('Ingresos ') ? 'es' : 'en',
          },
        ],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    await testables.translateFullPageAutoDetect('zh')

    const chart = document.querySelector('svg')
    if (!chart) throw new Error('Missing SVG chart')
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', '10')
    label.setAttribute('y', '20')
    label.textContent = 'Ingresos actualizados'
    chart.appendChild(label)

    await waitFor(() => {
      expect(label).toHaveTextContent('es->zh-CN: Ingresos actualizados')
    })
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'es', targetLanguage: 'zh-CN' }),
    )
  })

  it('does not translate dynamic SVG labels that become hidden while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80"></svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    window.__nativeTranslateAdapter = undefined
    window.__nativeTranslatePool = undefined
    window.__nativeLanguageDetector = undefined
    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const chart = document.querySelector('svg')
    if (!chart) throw new Error('Missing SVG chart')
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', '10')
    label.setAttribute('y', '20')
    label.textContent = 'Ingresos actualizados'
    chart.appendChild(label)

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Ingresos actualizados')
    })
    label.setAttribute('visibility', 'hidden')
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

    await new Promise((resolve) => setTimeout(resolve, 160))

    expect(translate).not.toHaveBeenCalledWith('Ingresos actualizados')
    expect(label.textContent).toBe('Ingresos actualizados')
    expect(label).not.toHaveAttribute('data-native-translate-original-text-content')
    expect(label).not.toHaveAttribute('data-native-translate-text-content-done')
  })

  it('translates only the latest dynamic SVG label changed while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <svg role="img" width="180" height="80"></svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 80,
      width: 180,
      height: 80,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    window.__nativeTranslateAdapter = undefined
    window.__nativeTranslatePool = undefined
    window.__nativeLanguageDetector = undefined
    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const chart = document.querySelector('svg')
    if (!chart) throw new Error('Missing SVG chart')
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', '10')
    label.setAttribute('y', '20')
    label.textContent = 'Ingresos actualizados'
    chart.appendChild(label)

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Ingresos actualizados')
    })
    label.textContent = 'Gastos actualizados'
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

    await waitFor(() => {
      expect(label).toHaveTextContent('translated: Gastos actualizados')
    })

    expect(translate).not.toHaveBeenCalledWith('Ingresos actualizados')
    expect(translate).toHaveBeenCalledWith('Gastos actualizados')
    expect(label).toHaveAttribute(
      'data-native-translate-original-text-content',
      'Gastos actualizados',
    )
  })

  it('does not translate ARIA id reference attributes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <span id="account-settings-label">Account settings label text.</span>
        <span id="account-settings-description">Account settings description text.</span>
        <button
          aria-labelledby="account-settings-label"
          aria-describedby="account-settings-description"
        ></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing button')
    expect(button).toHaveAttribute('aria-labelledby', 'account-settings-label')
    expect(button).toHaveAttribute('aria-describedby', 'account-settings-description')
    expect(button).not.toHaveAttribute('data-native-translate-original-aria-labelledby')
    expect(button).not.toHaveAttribute('data-native-translate-original-aria-describedby')
  })

  it('does not translate aria-errormessage references while translating the referenced error text', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input aria-invalid="true" aria-errormessage="billing-error">
        <span id="billing-error">Billing address is required before checkout.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const error = document.querySelector('#billing-error')
    if (!input || !error) throw new Error('Missing error message elements')
    expect(input).toHaveAttribute('aria-errormessage', 'billing-error')
    expect(input).not.toHaveAttribute('data-native-translate-original-aria-errormessage')
    expect(error.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Billing address is required before checkout.',
    )
  })

  it('keeps aria-describedby references intact while translating referenced descriptions in place', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button aria-describedby="billing-help">Open billing settings</button>
        <span id="billing-help">Only account administrators can change billing settings.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    const description = document.querySelector('#billing-help')
    if (!button || !description) throw new Error('Missing described elements')
    expect(button).toHaveAttribute('aria-describedby', 'billing-help')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )
  })

  it('translates visually hidden descriptions referenced by visible controls in place', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input aria-describedby="billing-help">
        <span id="billing-help" class="sr-only">Only account administrators can change billing settings.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const description = document.querySelector('#billing-help')
    if (!input || !description) throw new Error('Missing visually hidden description elements')
    expect(input).toHaveAttribute('aria-describedby', 'billing-help')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )
    expect(
      description.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('translates clipped descriptions referenced by visible controls in place', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input aria-describedby="billing-help">
        <span id="billing-help" style="clip-path: inset(50%); position: absolute;">Only account administrators can change billing settings.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const description = document.querySelector('#billing-help')
    if (!input || !description) throw new Error('Missing clipped description elements')
    expect(input).toHaveAttribute('aria-describedby', 'billing-help')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )
    expect(
      description.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('translates visually hidden descriptions when a visible control references them dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input>
        <span id="billing-help" class="sr-only">Only account administrators can change billing settings.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const description = document.querySelector('#billing-help')
    if (!input || !description) throw new Error('Missing dynamic visually hidden description')
    expect(description.querySelector('.native-translate-translation')).toBeNull()

    input.setAttribute('aria-describedby', 'billing-help')

    await waitFor(() => {
      expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Only account administrators can change billing settings.',
      )
    })
    expect(
      description.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('translates visually hidden descriptions when referencing controls are inserted dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <span id="billing-help" class="sr-only">Only account administrators can change billing settings.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    const description = document.querySelector('#billing-help')
    if (!main || !description) throw new Error('Missing dynamic visually hidden description')
    expect(description.querySelector('.native-translate-translation')).toBeNull()

    const input = document.createElement('input')
    input.setAttribute('aria-describedby', 'billing-help')
    main.insertBefore(input, description)

    await waitFor(() => {
      expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Only account administrators can change billing settings.',
      )
    })
    expect(input).toHaveAttribute('aria-describedby', 'billing-help')
    expect(
      description.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('does not translate aria-hidden descriptions even when a visible control references them', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input aria-describedby="billing-help">
        <span id="billing-help" class="sr-only" aria-hidden="true">Internal implementation note should stay hidden.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const description = document.querySelector('#billing-help')
    if (!description) throw new Error('Missing aria-hidden description')
    expect(description.querySelector('.native-translate-translation')).toBeNull()
    expect(
      description.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('keeps aria-details references intact while translating referenced details in place', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button aria-details="billing-details">Review billing policy</button>
        <span id="billing-details">Billing changes may affect every workspace member.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    const details = document.querySelector('#billing-details')
    if (!button || !details) throw new Error('Missing aria-details elements')
    expect(button).toHaveAttribute('aria-details', 'billing-details')
    expect(button).not.toHaveAttribute('data-native-translate-original-aria-details')
    expect(details.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Billing changes may affect every workspace member.',
    )
  })

  it('moves existing description translations in place when aria-describedby is added dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button>Open billing settings</button>
        <span id="billing-help">Only account administrators can change billing settings.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    const description = document.querySelector('#billing-help')
    if (!button || !description) throw new Error('Missing dynamic described elements')
    expect(description.nextElementSibling).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )

    button.setAttribute('aria-describedby', 'billing-help')

    await waitFor(() => {
      expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Only account administrators can change billing settings.',
      )
    })
    expect(
      description.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('moves existing description translations out when aria-describedby is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button aria-describedby="billing-help">Open billing settings</button>
        <span id="billing-help">Only account administrators can change billing settings.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    const description = document.querySelector('#billing-help')
    if (!button || !description) throw new Error('Missing dynamic described elements')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )

    button.removeAttribute('aria-describedby')

    await waitFor(() => {
      expect(description.nextElementSibling).toHaveTextContent(
        'translated: Only account administrators can change billing settings.',
      )
    })
    expect(description.querySelector('.native-translate-translation')).toBeNull()
  })

  it('clears visually hidden complementary descriptions when references are removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input aria-describedby="billing-help">
        <aside id="billing-help" class="sr-only">Only account administrators can change billing settings.</aside>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const description = document.querySelector('#billing-help')
    if (!input || !description) throw new Error('Missing dynamic described elements')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )

    input.removeAttribute('aria-describedby')

    await waitFor(() => {
      expect(description.querySelector('.native-translate-translation')).toBeNull()
      expect(description).not.toHaveAttribute('data-native-translate-done')
    })
  })

  it('clears visually hidden descriptions when referencing controls become hidden dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input aria-describedby="billing-help">
        <aside id="billing-help" class="sr-only">Only account administrators can change billing settings.</aside>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const description = document.querySelector('#billing-help')
    if (!input || !description) throw new Error('Missing dynamic described elements')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )

    input.hidden = true

    await waitFor(() => {
      expect(description.querySelector('.native-translate-translation')).toBeNull()
      expect(description).not.toHaveAttribute('data-native-translate-done')
    })
  })

  it('clears visually hidden descriptions when referencing controls are removed from separate containers', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <header>
        <input aria-describedby="billing-help">
      </header>
      <main>
        <p>Visible page text should be translated.</p>
        <aside id="billing-help" class="sr-only">Only account administrators can change billing settings.</aside>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const description = document.querySelector('#billing-help')
    if (!input || !description) throw new Error('Missing dynamic described elements')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )

    input.remove()

    await waitFor(() => {
      expect(description.querySelector('.native-translate-translation')).toBeNull()
      expect(description).not.toHaveAttribute('data-native-translate-done')
    })
  })

  it('clears visually hidden descriptions when referencing control containers become hidden dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <section>
          <input aria-describedby="billing-help">
        </section>
        <aside id="billing-help" class="sr-only">Only account administrators can change billing settings.</aside>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const section = document.querySelector('section')
    const description = document.querySelector('#billing-help')
    if (!section || !description) throw new Error('Missing dynamic described elements')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )

    section.hidden = true

    await waitFor(() => {
      expect(description.querySelector('.native-translate-translation')).toBeNull()
      expect(description).not.toHaveAttribute('data-native-translate-done')
    })
  })

  it('clears visually hidden descriptions when referencing control containers become notranslate dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <header>
        <input aria-describedby="billing-help">
      </header>
      <main>
        <p>Visible page text should be translated.</p>
        <aside id="billing-help" class="sr-only">Only account administrators can change billing settings.</aside>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const header = document.querySelector('header')
    const description = document.querySelector('#billing-help')
    if (!header || !description) throw new Error('Missing dynamic described elements')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )

    header.className = 'notranslate'

    await waitFor(() => {
      expect(description.querySelector('.native-translate-translation')).toBeNull()
      expect(description).not.toHaveAttribute('data-native-translate-done')
    })
  })

  it('translates visually hidden descriptions inside complementary containers when referenced by visible controls', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input aria-describedby="billing-help">
        <aside>
          <span id="billing-help" class="sr-only">Only account administrators can change billing settings.</span>
        </aside>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const description = document.querySelector('#billing-help')
    if (!description) throw new Error('Missing described element')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )
    expect(
      description.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('translates visually hidden complementary descriptions when referenced directly', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input aria-describedby="billing-help">
        <aside id="billing-help" class="sr-only">Only account administrators can change billing settings.</aside>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const description = document.querySelector('#billing-help')
    if (!description) throw new Error('Missing described element')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )
    expect(
      description.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('moves existing description translations in place when a referenced id is added dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button aria-describedby="billing-help">Open billing settings</button>
        <span>Only account administrators can change billing settings.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const description = document.querySelector('main > span')
    if (!description) throw new Error('Missing dynamic described element')
    expect(description.nextElementSibling).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )

    description.id = 'billing-help'

    await waitFor(() => {
      expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Only account administrators can change billing settings.',
      )
    })
    expect(
      description.nextElementSibling?.classList.contains('native-translate-translation'),
    ).not.toBe(true)
  })

  it('moves existing description translations out when a referenced id is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <button aria-describedby="billing-help">Open billing settings</button>
        <span id="billing-help">Only account administrators can change billing settings.</span>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const description = document.querySelector('#billing-help')
    if (!description) throw new Error('Missing dynamic described element')
    expect(description.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Only account administrators can change billing settings.',
    )

    description.removeAttribute('id')

    await waitFor(() => {
      expect(description.nextElementSibling).toHaveTextContent(
        'translated: Only account administrators can change billing settings.',
      )
    })
    expect(description.querySelector('.native-translate-translation')).toBeNull()
  })

  it('translates table summary attributes without translating arbitrary summary attributes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <table summary="Quarterly revenue by region and product line">
          <caption>Revenue table</caption>
          <tbody>
            <tr><td>North America</td></tr>
          </tbody>
        </table>
        <div summary="Custom component state should remain unchanged"></div>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const table = document.querySelector('table')
    const widget = document.querySelector('div[summary]')
    if (!table || !widget) throw new Error('Missing summary attributes')
    expect(table).toHaveAttribute(
      'summary',
      'translated: Quarterly revenue by region and product line',
    )
    expect(widget).toHaveAttribute('summary', 'Custom component state should remain unchanged')
  })

  it('translates button-like input values without translating user-entered input values', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input type="submit" value="Send billing request">
        <input type="button" value="Open account settings">
        <input type="reset" value="Clear selected filters">
        <input type="text" value="user@example.com">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const controls = Array.from(document.querySelectorAll('input'))
    expect(controls[0]).toHaveValue('translated: Send billing request')
    expect(controls[1]).toHaveValue('translated: Open account settings')
    expect(controls[2]).toHaveValue('translated: Clear selected filters')
    expect(controls[3]).toHaveValue('user@example.com')
  })

  it('translates button-like input values that only exist as element properties', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input type="button">
      </main>
    `

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing property-only button input')
    let visibleValue = 'Open account settings'
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => visibleValue,
      set: (value: string) => {
        visibleValue = value
      },
    })
    expect(input).not.toHaveAttribute('value')

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(input).toHaveValue('translated: Open account settings')
    expect(input).toHaveAttribute('value', 'translated: Open account settings')
    expect(input).toHaveAttribute('data-native-translate-original-value', 'Open account settings')
    expect(input).toHaveAttribute('data-native-translate-value-done', '1')
  })

  it('translates latest button-like input value property changed while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input type="button" value="Open account settings">
      </main>
    `

    const testables = await loadContentScriptTestables()
    const valueTranslation = createDeferred<string>()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) =>
          text === 'Open account settings' ? valueTranslation.promise : `translated: ${text}`,
      })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalled()
    })
    const input = document.querySelector('input')
    if (!input) throw new Error('Missing pending button-like input')
    input.value = 'Open billing preferences'
    valueTranslation.resolve('translated: Open account settings')
    await translationPromise

    expect(input).toHaveValue('translated: Open billing preferences')
    expect(input).toHaveAttribute('value', 'translated: Open billing preferences')
    expect(input).toHaveAttribute(
      'data-native-translate-original-value',
      'Open billing preferences',
    )
    expect(input).toHaveAttribute('data-native-translate-value-done', '1')
  })

  it('translates select option labels while preserving option values', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <select>
          <option value="enterprise">Enterprise billing plan</option>
          <option>Monthly invoice cycle</option>
        </select>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const options = Array.from(document.querySelectorAll('option'))
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('translated: Enterprise billing plan')
    expect(options[0]).toHaveValue('enterprise')
    expect(options[1]).toHaveTextContent('translated: Monthly invoice cycle')
    expect(options[1]).toHaveValue('Monthly invoice cycle')
  })

  it('preserves option values set dynamically after translating implicit option text', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <select>
          <option>Monthly invoice cycle</option>
        </select>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const option = document.querySelector('option')
    if (!option) throw new Error('Missing implicit value option')
    expect(option).toHaveTextContent('translated: Monthly invoice cycle')
    expect(option).toHaveValue('Monthly invoice cycle')

    option.setAttribute('value', 'monthly')

    await waitFor(() => {
      expect(option).toHaveTextContent('translated: Monthly invoice cycle')
      expect(option).toHaveValue('monthly')
    })
    expect(option).not.toHaveAttribute('data-native-translate-implicit-option-value')

    option.textContent = 'Quarterly invoice cycle'

    await waitFor(() => {
      expect(option).toHaveTextContent('translated: Quarterly invoice cycle')
      expect(option).toHaveValue('monthly')
    })
  })

  it('translates select options added dynamically while preserving explicit values', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <select></select>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const select = document.querySelector('select')
    if (!select) throw new Error('Missing select')
    const option = document.createElement('option')
    option.value = 'quarterly'
    option.textContent = 'Quarterly invoice cycle'
    select.appendChild(option)

    await waitFor(() => {
      expect(option).toHaveTextContent('translated: Quarterly invoice cycle')
    })
    expect(option).toHaveValue('quarterly')
  })

  it('translates select option and group label attributes while preserving values', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <select>
          <optgroup label="Billing plan choices">
            <option value="enterprise" label="Enterprise billing plan">enterprise</option>
          </optgroup>
        </select>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const group = document.querySelector('optgroup')
    const option = document.querySelector('option')
    if (!group || !option) throw new Error('Missing select labels')
    expect(group).toHaveAttribute('label', 'translated: Billing plan choices')
    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')
    expect(option).toHaveValue('enterprise')
  })

  it('translates select labels when option elements have no own layout box', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <select>
          <optgroup label="Billing plan choices">
            <option value="enterprise" label="Enterprise billing plan">enterprise</option>
          </optgroup>
        </select>
      </main>
    `

    const group = document.querySelector('optgroup')
    const option = document.querySelector('option')
    if (!group || !option) throw new Error('Missing select labels')
    group.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))
    option.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(group).toHaveAttribute('label', 'translated: Billing plan choices')
    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')
  })

  it('translates datalist option labels while preserving option values', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input list="billing-plans">
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const option = document.querySelector('datalist option')
    if (!option) throw new Error('Missing datalist option')
    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')
    expect(option).toHaveValue('enterprise')
  })

  it('translates datalist option text while preserving explicit option values', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input list="billing-plans">
        <datalist id="billing-plans">
          <option value="enterprise">Enterprise billing plan</option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const option = document.querySelector('datalist option')
    if (!option) throw new Error('Missing datalist option text')
    expect(option).toHaveTextContent('translated: Enterprise billing plan')
    expect(option).toHaveValue('enterprise')
  })

  it('translates datalist option text when associated inputs are inserted dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <datalist id="billing-plans">
          <option value="enterprise">Enterprise billing plan</option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    const option = document.querySelector('datalist option')
    if (!main || !option) throw new Error('Missing datalist text elements')
    expect(option).toHaveTextContent('Enterprise billing plan')

    const input = document.createElement('input')
    input.setAttribute('list', 'billing-plans')
    main.insertBefore(input, main.querySelector('datalist'))

    await waitFor(() => {
      expect(option).toHaveTextContent('translated: Enterprise billing plan')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('skips datalist option text when every associated input is not visible', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input list="billing-plans">
        <datalist id="billing-plans">
          <option value="enterprise">Enterprise billing plan</option>
        </datalist>
      </main>
    `

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing datalist input')
    input.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const option = document.querySelector('datalist option')
    if (!option) throw new Error('Missing datalist option text')
    expect(option).toHaveTextContent('Enterprise billing plan')
    expect(option).not.toHaveAttribute('data-native-translate-original-text-content')
    expect(option).not.toHaveAttribute('data-native-translate-text-content-done')
  })

  it('skips datalist option labels unless one associated input is both visible and translatable', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input class="notranslate" list="billing-plans">
        <input list="billing-plans">
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const inputs = document.querySelectorAll('input')
    if (inputs.length !== 2) throw new Error('Missing datalist inputs')
    inputs[1].getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const option = document.querySelector('datalist option')
    if (!option) throw new Error('Missing datalist option label')
    expect(option).toHaveAttribute('label', 'Enterprise billing plan')
    expect(option).not.toHaveAttribute('data-native-translate-original-label')
    expect(option).not.toHaveAttribute('data-native-translate-label-done')
  })

  it('translates datalist option labels when any associated input is visible', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <input hidden list="billing-plans">
        <input list="billing-plans">
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const option = document.querySelector('datalist option')
    if (!option) throw new Error('Missing shared datalist option')
    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')
    expect(option).toHaveValue('enterprise')
  })

  it('translates datalist option labels inside open shadow roots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <billing-plan-picker></billing-plan-picker>
      </main>
    `

    const host = document.querySelector('billing-plan-picker')
    if (!host) throw new Error('Missing billing plan picker host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <input list="billing-plans">
      <datalist id="billing-plans">
        <option value="enterprise" label="Enterprise billing plan"></option>
      </datalist>
    `

    const option = shadowRoot.querySelector('datalist option')
    if (!option) throw new Error('Missing shadow datalist option')

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')
    expect(option).toHaveValue('enterprise')
  })

  it('translates datalist option labels when an input list association is added dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input>
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const option = document.querySelector('datalist option')
    if (!input || !option) throw new Error('Missing datalist elements')
    expect(option).toHaveAttribute('label', 'Enterprise billing plan')

    input.setAttribute('list', 'billing-plans')

    await waitFor(() => {
      expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('translates datalist option labels when associated inputs are inserted dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    const option = document.querySelector('datalist option')
    if (!main || !option) throw new Error('Missing datalist elements')
    expect(option).toHaveAttribute('label', 'Enterprise billing plan')

    const input = document.createElement('input')
    input.setAttribute('list', 'billing-plans')
    main.insertBefore(input, main.querySelector('datalist'))

    await waitFor(() => {
      expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('translates datalist option labels when a datalist id association is added dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input list="billing-plans">
        <datalist id="pending-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const datalist = document.querySelector('datalist')
    const option = document.querySelector('datalist option')
    if (!datalist || !option) throw new Error('Missing datalist elements')
    expect(option).toHaveAttribute('label', 'Enterprise billing plan')

    datalist.setAttribute('id', 'billing-plans')

    await waitFor(() => {
      expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('translates datalist option labels added dynamically after input association', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input list="billing-plans">
        <datalist id="billing-plans"></datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const datalist = document.querySelector('datalist')
    if (!datalist) throw new Error('Missing datalist')
    const option = document.createElement('option')
    option.value = 'enterprise'
    option.setAttribute('label', 'Enterprise billing plan')
    datalist.appendChild(option)

    await waitFor(() => {
      expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('restores datalist option labels when the associated input becomes hidden dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input list="billing-plans">
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const option = document.querySelector('datalist option')
    if (!input || !option) throw new Error('Missing datalist elements')
    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')

    input.setAttribute('hidden', '')

    await waitFor(() => {
      expect(option).toHaveAttribute('label', 'Enterprise billing plan')
      expect(option).not.toHaveAttribute('data-native-translate-original-label')
      expect(option).not.toHaveAttribute('data-native-translate-label-done')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('restores datalist option text when the associated input becomes hidden dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input list="billing-plans">
        <datalist id="billing-plans">
          <option value="enterprise">Enterprise billing plan</option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const option = document.querySelector('datalist option')
    if (!input || !option) throw new Error('Missing datalist text elements')
    expect(option).toHaveTextContent('translated: Enterprise billing plan')

    input.hidden = true

    await waitFor(() => {
      expect(option).toHaveTextContent('Enterprise billing plan')
      expect(option).not.toHaveAttribute('data-native-translate-original-text-content')
      expect(option).not.toHaveAttribute('data-native-translate-text-content-done')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('restores datalist option labels when associated input containers become hidden dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <section>
          <input list="billing-plans">
        </section>
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const section = document.querySelector('section')
    const option = document.querySelector('datalist option')
    if (!section || !option) throw new Error('Missing datalist elements')
    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')

    section.hidden = true

    await waitFor(() => {
      expect(option).toHaveAttribute('label', 'Enterprise billing plan')
      expect(option).not.toHaveAttribute('data-native-translate-original-label')
      expect(option).not.toHaveAttribute('data-native-translate-label-done')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('restores datalist option labels when input list associations are removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input list="billing-plans">
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const option = document.querySelector('datalist option')
    if (!input || !option) throw new Error('Missing datalist elements')
    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')

    input.removeAttribute('list')

    await waitFor(() => {
      expect(option).toHaveAttribute('label', 'Enterprise billing plan')
      expect(option).not.toHaveAttribute('data-native-translate-original-label')
      expect(option).not.toHaveAttribute('data-native-translate-label-done')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('restores datalist option labels when associated inputs are removed from separate containers', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <header>
        <input list="billing-plans">
      </header>
      <main>
        <p>Initial paragraph for translation.</p>
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const option = document.querySelector('datalist option')
    if (!input || !option) throw new Error('Missing datalist elements')
    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')

    input.remove()

    await waitFor(() => {
      expect(option).toHaveAttribute('label', 'Enterprise billing plan')
      expect(option).not.toHaveAttribute('data-native-translate-original-label')
      expect(option).not.toHaveAttribute('data-native-translate-label-done')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('restores datalist option labels when datalist ids stop matching inputs dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input list="billing-plans">
        <datalist id="billing-plans">
          <option value="enterprise" label="Enterprise billing plan"></option>
        </datalist>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const datalist = document.querySelector('datalist')
    const option = document.querySelector('datalist option')
    if (!datalist || !option) throw new Error('Missing datalist elements')
    expect(option).toHaveAttribute('label', 'translated: Enterprise billing plan')

    datalist.id = 'archived-plans'

    await waitFor(() => {
      expect(option).toHaveAttribute('label', 'Enterprise billing plan')
      expect(option).not.toHaveAttribute('data-native-translate-original-label')
      expect(option).not.toHaveAttribute('data-native-translate-label-done')
    })
    expect(option).toHaveValue('enterprise')
  })

  it('translates media track label attributes based on the associated media visibility', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <video controls>
          <track kind="subtitles" srclang="en" label="English captions" src="/captions-en.vtt">
        </video>
      </main>
    `

    const track = document.querySelector('track')
    if (!track) throw new Error('Missing media track')
    track.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(track).toHaveAttribute('label', 'translated: English captions')
    expect(track).toHaveAttribute('srclang', 'en')
    expect(track).toHaveAttribute('src', '/captions-en.vtt')
  })

  it('restores media track labels when the associated media becomes hidden dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <video controls>
          <track kind="subtitles" srclang="en" label="English captions" src="/captions-en.vtt">
        </video>
      </main>
    `

    const track = document.querySelector('track')
    if (!track) throw new Error('Missing media track')
    track.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const video = document.querySelector('video')
    if (!video) throw new Error('Missing media element')
    expect(track).toHaveAttribute('label', 'translated: English captions')

    video.setAttribute('hidden', '')

    await waitFor(() => {
      expect(track).toHaveAttribute('label', 'English captions')
      expect(track).not.toHaveAttribute('data-native-translate-original-label')
      expect(track).not.toHaveAttribute('data-native-translate-label-done')
    })
    expect(track).toHaveAttribute('src', '/captions-en.vtt')
  })

  it('restores media track labels when associated media containers become notranslate dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <section>
          <video controls>
            <track kind="subtitles" srclang="en" label="English captions" src="/captions-en.vtt">
          </video>
        </section>
      </main>
    `

    const track = document.querySelector('track')
    if (!track) throw new Error('Missing media track')
    track.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const section = document.querySelector('section')
    if (!section) throw new Error('Missing media container')
    expect(track).toHaveAttribute('label', 'translated: English captions')

    section.className = 'notranslate'

    await waitFor(() => {
      expect(track).toHaveAttribute('label', 'English captions')
      expect(track).not.toHaveAttribute('data-native-translate-original-label')
      expect(track).not.toHaveAttribute('data-native-translate-label-done')
    })
    expect(track).toHaveAttribute('src', '/captions-en.vtt')
  })

  it('translates media track labels when associated media containers become visible through arbitrary class removal', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.collapsed-media { display: none; }</style>'
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <section class="collapsed-media">
          <video controls>
            <track kind="subtitles" srclang="en" label="English captions" src="/captions-en.vtt">
          </video>
        </section>
      </main>
    `

    const track = document.querySelector('track')
    if (!track) throw new Error('Missing media track')
    track.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const section = document.querySelector('section')
    if (!section) throw new Error('Missing media container')
    expect(track).toHaveAttribute('label', 'English captions')

    section.removeAttribute('class')

    await waitFor(() => {
      expect(track).toHaveAttribute('label', 'translated: English captions')
    })
    expect(track).toHaveAttribute('src', '/captions-en.vtt')
  })

  it('collects address blocks as translatable contact text', async () => {
    document.body.innerHTML = `
      <main>
        <p>Contact the regional office for account support.</p>
        <address>North America support desk, 101 Market Street, San Francisco.</address>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual(['p', 'address'])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Contact the regional office for account support.',
      'North America support desk, 101 Market Street, San Francisco.',
    ])
  })

  it('collects standalone semantic inline text such as time and cite', async () => {
    document.body.innerHTML = `
      <main>
        <time datetime="2026-05-05">Published on May fifth, twenty twenty six</time>
        <cite>Reference guide for browser translation behavior</cite>
        <q>Reliable translation starts with readable source blocks.</q>
        <small>Short disclosure text should be translated when visible.</small>
        <output>Total monthly cost is twenty nine dollars.</output>
        <dfn>Progressive web app translation glossary term</dfn>
        <p>Article body content remains a separate block.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual([
      'time',
      'cite',
      'q',
      'small',
      'output',
      'dfn',
      'p',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Published on May fifth, twenty twenty six',
      'Reference guide for browser translation behavior',
      'Reliable translation starts with readable source blocks.',
      'Short disclosure text should be translated when visible.',
      'Total monthly cost is twenty nine dollars.',
      'Progressive web app translation glossary term',
      'Article body content remains a separate block.',
    ])
  })

  it('collects standalone emphasis inline text used as readable page copy', async () => {
    document.body.innerHTML = `
      <main>
        <strong>Important account migration notice</strong>
        <em>Estimated reading time is three minutes.</em>
        <b>Fallback bold title from a legacy page.</b>
        <i>Italic helper copy from a legacy page.</i>
        <mark>Highlighted recommendation for this workflow</mark>
        <s>Deprecated plan name shown in archived notes.</s>
        <u>Underlined advisory copy from a legacy page.</u>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual([
      'strong',
      'em',
      'b',
      'i',
      'mark',
      's',
      'u',
    ])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Important account migration notice',
      'Estimated reading time is three minutes.',
      'Fallback bold title from a legacy page.',
      'Italic helper copy from a legacy page.',
      'Highlighted recommendation for this workflow',
      'Deprecated plan name shown in archived notes.',
      'Underlined advisory copy from a legacy page.',
    ])
  })

  it('collects short semantic and ARIA headings during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <h1>AI</h1>
        <div role="heading" aria-level="2">Go</div>
        <p>Long enough paragraph should still be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'AI',
      'Go',
      'Long enough paragraph should still be translated.',
    ])
  })

  it('collects standalone inserted and deleted edit annotations as readable text', async () => {
    document.body.innerHTML = `
      <main>
        <ins>New policy wording added to the agreement.</ins>
        <del>Old policy wording removed from the agreement.</del>
        <p>Revision notes remain a separate paragraph.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual(['ins', 'del', 'p'])
    expect(blocks.map(({ text }) => text)).toEqual([
      'New policy wording added to the agreement.',
      'Old policy wording removed from the agreement.',
      'Revision notes remain a separate paragraph.',
    ])
  })

  it('keeps mixed loose text and inline formatting as one readable text block', async () => {
    document.body.innerHTML = `
      <main>
        Introductory copy before the <strong>important account migration phrase</strong> continues here.
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual(['main'])
    expect(blocks.map(({ text }) => text.replace(/\[\[NT\d+_[SE]\]\]/g, ''))).toEqual([
      'Introductory copy before the important account migration phrase continues here.',
    ])
    expect(blocks[0].nodeMap?.size).toBe(1)
  })

  it('skips contenteditable regions during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Regular paragraph that should be translated.</p>
        <div contenteditable="true">
          Draft text in an editor should not be translated.
        </div>
        <div contenteditable="True">
          Mixed case editor draft text should not be translated.
        </div>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual(['Regular paragraph that should be translated.'])
  })

  it('skips interactive form controls during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Readable paragraph that should be translated.</p>
        <button>Submit order</button>
        <select>
          <option>English</option>
        </select>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Readable paragraph that should be translated.',
    ])
  })

  it('skips ARIA interactive controls during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Article body that should be translated.</p>
        <div role="button">Custom submit control</div>
        <div role="Button">Mixed case custom submit control</div>
        <div role="button presentation">Fallback role custom submit control</div>
        <div role="switch">Feature toggle text</div>
        <div role="combobox">Language picker text</div>
        <div role="toolbar">
          <p>Toolbar helper copy should not be translated.</p>
        </div>
        <div role="tablist">
          <p>Tab list helper copy should not be translated.</p>
        </div>
        <div role="tree">
          <p>Tree navigation helper copy should not be translated.</p>
        </div>
        <div role="treeitem">Tree item label should not be translated.</div>
        <div role="menuitemcheckbox">Menu checkbox label should not be translated.</div>
        <div role="menuitemradio">Menu radio label should not be translated.</div>
        <div role="progressbar">Upload progress 65 percent should not be translated.</div>
        <div role="scrollbar">Scroll position helper should not be translated.</div>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual(['Article body that should be translated.'])
  })

  it('collects explicitly opted-in interactive control text', async () => {
    document.body.innerHTML = `
      <main>
        <p>Article body that should be translated.</p>
        <button translate="yes">Submit order</button>
        <div role="button" data-translate="yes">Custom submit control</div>
        <button>Default button should still be skipped</button>
        <div role="button">Default ARIA button should still be skipped</div>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Article body that should be translated.',
      'Submit order',
      'Custom submit control',
    ])
  })

  it('skips native progress and meter controls during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Article body that should be translated.</p>
        <progress value="65" max="100">Upload progress 65 percent should not be translated.</progress>
        <meter value="0.72">Quality meter 72 percent should not be translated.</meter>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual(['Article body that should be translated.'])
  })

  it('skips live notification regions during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Article body that should be translated.</p>
        <p aria-live="polite">Saved notification should not be translated.</p>
        <div role="status">Upload progress should not be translated.</div>
        <div role="status presentation">Fallback status should not be translated.</div>
        <section role="alert">
          <p>Error toast should not be translated.</p>
        </section>
        <p aria-live="off">Static prose with aria-live off should still be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Article body that should be translated.',
      'Static prose with aria-live off should still be translated.',
    ])
  })

  it('collects text from open shadow roots during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Light DOM paragraph that should be translated.</p>
        <article-card></article-card>
      </main>
    `
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <article>
        <p>Shadow DOM article text should be translated.</p>
      </article>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Light DOM paragraph that should be translated.',
      'Shadow DOM article text should be translated.',
    ])
  })

  it('translates attributes inside open shadow roots during full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <settings-panel></settings-panel>
      </main>
    `
    const host = document.querySelector('settings-panel')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <button aria-label="Open account settings"></button>
      <input type="search" placeholder="Search account settings">
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const shadowButton = shadowRoot.querySelector('button')
    const shadowInput = shadowRoot.querySelector('input')
    if (!shadowButton || !shadowInput) throw new Error('Missing shadow controls')

    expect(shadowButton).toHaveAttribute('aria-label', 'translated: Open account settings')
    expect(shadowInput).toHaveAttribute('placeholder', 'translated: Search account settings')
  })

  it('restores translated attributes inside open shadow roots when clearing translations', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <settings-panel></settings-panel>
      </main>
    `
    const host = document.querySelector('settings-panel')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <button aria-label="Open account settings"></button>
      <input type="search" placeholder="Search account settings">
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const shadowButton = shadowRoot.querySelector('button')
    const shadowInput = shadowRoot.querySelector('input')
    if (!shadowButton || !shadowInput) throw new Error('Missing shadow controls')
    expect(shadowButton).toHaveAttribute('aria-label', 'translated: Open account settings')
    expect(shadowInput).toHaveAttribute('placeholder', 'translated: Search account settings')

    await testables.translateFullPageAutoDetect('en')

    expect(shadowButton).toHaveAttribute('aria-label', 'Open account settings')
    expect(shadowButton).not.toHaveAttribute('data-native-translate-original-aria-label')
    expect(shadowButton).not.toHaveAttribute('data-native-translate-aria-label-done')
    expect(shadowInput).toHaveAttribute('placeholder', 'Search account settings')
    expect(shadowInput).not.toHaveAttribute('data-native-translate-original-placeholder')
    expect(shadowInput).not.toHaveAttribute('data-native-translate-placeholder-done')
  })

  it('does not translate attributes inside opted-out open shadow hosts', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Visible page text should be translated.</p>
        <settings-panel class="notranslate"></settings-panel>
      </main>
    `
    const host = document.querySelector('settings-panel')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <button aria-label="Open protected account settings"></button>
      <input type="search" placeholder="Search protected account settings">
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const shadowButton = shadowRoot.querySelector('button')
    const shadowInput = shadowRoot.querySelector('input')
    if (!shadowButton || !shadowInput) throw new Error('Missing shadow controls')

    expect(shadowButton).toHaveAttribute('aria-label', 'Open protected account settings')
    expect(shadowInput).toHaveAttribute('placeholder', 'Search protected account settings')
  })

  it('skips shadow text inherited from navigation-like containers', async () => {
    document.body.innerHTML = `
      <nav><nav-card></nav-card></nav>
      <main><article-card></article-card></main>
    `
    const navHost = document.querySelector('nav-card')
    const articleHost = document.querySelector('article-card')
    if (!navHost || !articleHost) throw new Error('Missing shadow hosts')
    navHost.attachShadow({ mode: 'open' }).innerHTML = `
      <section>
        <p>Navigation shadow paragraph should not be translated.</p>
        <a>Navigation shadow link should not be translated.</a>
      </section>
    `
    articleHost.attachShadow({ mode: 'open' }).innerHTML = `
      <article>
        <p>Article shadow paragraph should still be translated.</p>
      </article>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Article shadow paragraph should still be translated.',
    ])
  })

  it('skips text inherited from ARIA navigation-like landmarks', async () => {
    document.body.innerHTML = `
      <div role="navigation">
        <p>ARIA navigation paragraph should not be translated.</p>
      </div>
      <div role="contentinfo">
        <p>ARIA footer paragraph should not be translated.</p>
      </div>
      <div role="search">
        <p>ARIA search paragraph should not be translated.</p>
      </div>
      <main>
        <p>Main article paragraph should still be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Main article paragraph should still be translated.',
    ])
  })

  it('collects text from open shadow roots when the light DOM container has no prose', async () => {
    document.body.innerHTML = '<main><article-card></article-card></main>'
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <article>
        <p>Shadow-only article text should still be translated.</p>
      </article>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Shadow-only article text should still be translated.',
    ])
  })

  it('translates open shadow prose when the light DOM container also has loose text', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        Introductory page copy before the component.
        <article-card></article-card>
      </main>
    `
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <article>
        <p>Shadow article body should not be missed.</p>
      </article>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(document.body).toHaveTextContent(
      'translated: Introductory page copy before the component.',
    )
    expect(shadowRoot.querySelector('p .native-translate-translation')).toHaveTextContent(
      'translated: Shadow article body should not be missed.',
    )
  })

  it('collects text when an open shadow root is used as the collection root', async () => {
    document.body.innerHTML = '<main><article-card></article-card></main>'
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <article>
        <p>Direct shadow root collection should find this paragraph.</p>
      </article>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(shadowRoot)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Direct shadow root collection should find this paragraph.',
    ])
  })

  it('translates loose text initially present directly inside open shadow roots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p><news-card /></main>'
    const host = document.querySelector('news-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(document.createTextNode('Initial shadow loose text for translation.'))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(shadowRoot.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
      'translated: Initial shadow loose text for translation.',
    )
  })

  it('translates loose text projected into open shadow slots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <article-card>Projected slot text from a web component should be translated.</article-card>
      </main>
    `
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    host.attachShadow({ mode: 'open' }).innerHTML = '<article><slot></slot></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(host.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
      'translated: Projected slot text from a web component should be translated.',
    )
  })

  it('translates loose text inside custom elements projected into open shadow slots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <article-card>
          <title-copy slot="title">Projected custom element text should be translated.</title-copy>
        </article-card>
      </main>
    `
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<article><h2><slot name="title"></slot></h2></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const projected = host.querySelector('title-copy')
    expect(projected?.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
      'translated: Projected custom element text should be translated.',
    )
  })

  it('translates custom elements projected into open shadow slots after full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <article-card></article-card>
      </main>
    `
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<article><h2><slot name="title"></slot></h2></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const projected = document.createElement('title-copy')
    projected.setAttribute('slot', 'title')
    projected.textContent = 'Late projected custom element text should be translated.'
    host.appendChild(projected)

    await waitFor(() => {
      expect(projected.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
        'translated: Late projected custom element text should be translated.',
      )
    })
  })

  it('translates text added later inside custom elements projected into open shadow slots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <article-card>
          <title-copy slot="title"></title-copy>
        </article-card>
      </main>
    `
    const host = document.querySelector('article-card')
    const projected = document.querySelector('title-copy')
    if (!host || !projected) throw new Error('Missing slotted custom element')
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<article><h2><slot name="title"></slot></h2></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    projected.appendChild(document.createTextNode('Late slotted custom element text.'))

    await waitFor(() => {
      expect(projected.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
        'translated: Late slotted custom element text.',
      )
    })
  })

  it('removes slotted custom element translation when its text becomes too short', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <article-card>
          <title-copy slot="title">Projected custom title should be translated.</title-copy>
        </article-card>
      </main>
    `
    const host = document.querySelector('article-card')
    const projected = document.querySelector('title-copy')
    if (!host || !projected) throw new Error('Missing slotted custom element')
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<article><h2><slot name="title"></slot></h2></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const wrapper = projected.querySelector('.native-translate-wrapped-segment')
    expect(wrapper).toHaveTextContent('translated: Projected custom title should be translated.')

    const sourceText = wrapper?.firstChild
    if (!sourceText) throw new Error('Missing slotted source text')
    sourceText.textContent = 'Ok'

    await waitFor(() => {
      expect(projected).not.toHaveTextContent(
        'translated: Projected custom title should be translated.',
      )
    })
    expect(projected.querySelector('.native-translate-translation')).toBeNull()
  })

  it('unwraps generated custom element text when it becomes too short to translate', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <summary-label>Projected custom title should be translated.</summary-label>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const label = document.querySelector('summary-label')
    if (!label) throw new Error('Missing custom label')
    const wrapper = label.querySelector('.native-translate-wrapped-segment')
    expect(wrapper).toHaveTextContent('translated: Projected custom title should be translated.')

    const sourceText = wrapper?.firstChild
    if (!sourceText) throw new Error('Missing custom source text')
    sourceText.textContent = 'Ok'

    await waitFor(() => {
      expect(label.querySelector('.native-translate-wrapped-segment')).toBeNull()
    })
    expect(label).toHaveTextContent('Ok')
    expect(label).not.toHaveTextContent('translated: Projected custom title should be translated.')
  })

  it('translates fallback text inside open shadow slots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <article-card></article-card>
      </main>
    `
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML =
      '<article><slot>Fallback slot text from a web component should be translated.</slot></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(shadowRoot.querySelector('slot .native-translate-wrapped-segment')).toHaveTextContent(
      'translated: Fallback slot text from a web component should be translated.',
    )
  })

  it('refreshes fallback text inside open shadow slots when it changes dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <article-card></article-card>
      </main>
    `
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML =
      '<article><slot>Initial fallback slot text for translation.</slot></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const slot = shadowRoot.querySelector('slot')
    if (!slot) throw new Error('Missing fallback slot')
    expect(slot.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
      'translated: Initial fallback slot text for translation.',
    )

    slot.textContent = 'Updated fallback slot text after client refresh.'

    await waitFor(() => {
      expect(slot.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
        'translated: Updated fallback slot text after client refresh.',
      )
    })
  })

  it('respects opt-out markers on open shadow hosts during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Light DOM paragraph that should be translated.</p>
        <article-card translate="no"></article-card>
        <widget-card data-no-translate></widget-card>
        <opt-in-card translate="no"></opt-in-card>
      </main>
    `
    const articleHost = document.querySelector('article-card')
    const widgetHost = document.querySelector('widget-card')
    const optInHost = document.querySelector('opt-in-card')
    if (!articleHost || !widgetHost || !optInHost) throw new Error('Missing shadow hosts')
    articleHost.attachShadow({ mode: 'open' }).innerHTML = `
      <article>
        <p>Shadow DOM article text should stay original.</p>
      </article>
    `
    widgetHost.attachShadow({ mode: 'open' }).innerHTML = `
      <article>
        <p>Shadow DOM widget text should stay original.</p>
      </article>
    `
    optInHost.attachShadow({ mode: 'open' }).innerHTML = `
      <article>
        <p translate="yes">Shadow DOM explicitly re-enabled text should be translated.</p>
      </article>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Light DOM paragraph that should be translated.',
      'Shadow DOM explicitly re-enabled text should be translated.',
    ])
  })

  it('respects page opt-out markers for non-translatable regions', async () => {
    document.body.innerHTML = `
      <main>
        <p>Regular paragraph that should be translated.</p>
        <p translate="no">Product name and protected wording should stay original.</p>
        <section class="notranslate">
          <p>Widget copy that the site explicitly opted out of translation.</p>
          <p translate="yes">Class opt-out child explicitly re-enabled copy should be translated.</p>
        </section>
        <p data-no-translate>Custom protected copy should stay original.</p>
        <section data-no-translate>
          <p>Data protected child copy should stay original.</p>
          <p translate="yes">Data opt-out child explicitly re-enabled copy should be translated.</p>
        </section>
        <p data-translate="no">Dataset label should stay original.</p>
        <p data-translate="False">Mixed case dataset label should stay original.</p>
        <p translate="No">Mixed case translate label should stay original.</p>
        <section class="skiptranslate">
          <p>Third party widget copy should stay original.</p>
        </section>
        <section translate="no">
          <p>Inherited protected copy should stay original.</p>
          <p translate="yes">Explicitly re-enabled copy should be translated.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual([
      'Regular paragraph that should be translated.',
      'Class opt-out child explicitly re-enabled copy should be translated.',
      'Data opt-out child explicitly re-enabled copy should be translated.',
      'Explicitly re-enabled copy should be translated.',
    ])
  })

  it('skips hidden and aria-hidden content during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Visible paragraph that should be translated.</p>
        <p hidden>Hidden attribute text should not be translated.</p>
        <p aria-hidden="true">Aria hidden text should not be translated.</p>
        <p aria-hidden="True">Mixed case aria hidden text should not be translated.</p>
        <div popover>
          <p>Closed popover content should not be translated.</p>
        </div>
        <section inert>
          <p>Inactive inert panel text should not be translated.</p>
        </section>
        <section style="opacity: 0">
          <p>Transparent ancestor text should not be translated.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual(['Visible paragraph that should be translated.'])
  })

  it('skips screen-reader-only clipped content during full page block collection', async () => {
    document.head.innerHTML = `
      <style>
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      </style>
    `
    document.body.innerHTML = `
      <main>
        <p>Visible paragraph that should be translated.</p>
        <p class="sr-only">Screen reader only text should not get a visible translation.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual(['Visible paragraph that should be translated.'])
  })

  it('skips screen-reader-only content using space-separated clip rect syntax', async () => {
    document.head.innerHTML = `
      <style>
        .visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
        }
      </style>
    `
    document.body.innerHTML = `
      <main>
        <p>Visible paragraph that should be translated.</p>
        <p class="visually-hidden">Space separated clipped text should stay hidden.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual(['Visible paragraph that should be translated.'])
  })

  it('skips content hidden by ancestor visibility styles during full page block collection', async () => {
    document.body.innerHTML = `
      <main>
        <p>Visible paragraph that should be translated.</p>
        <section style="display: none">
          <p>Display none ancestor text should not be translated.</p>
        </section>
        <section style="visibility: hidden">
          <p>Visibility hidden ancestor text should not be translated.</p>
        </section>
        <section style="visibility: collapse">
          <p>Visibility collapsed ancestor text should not be translated.</p>
        </section>
        <section style="content-visibility: hidden">
          <p>Content visibility hidden ancestor text should not be translated.</p>
        </section>
        <section style="opacity: 0">
          <p>Transparent ancestor text should not be translated.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ text }) => text)).toEqual(['Visible paragraph that should be translated.'])
  })

  it('skips direct dynamic roots hidden by ancestor visibility styles', async () => {
    document.body.innerHTML = `
      <main>
        <section style="display: none">
          <p>Display none dynamic root text should not be translated.</p>
        </section>
        <section style="opacity: 0">
          <p>Transparent dynamic root text should not be translated.</p>
        </section>
      </main>
    `

    const hiddenParagraph = document.querySelector('section[style*="display"] p')
    const transparentParagraph = document.querySelector('section[style*="opacity"] p')
    if (!hiddenParagraph || !transparentParagraph) throw new Error('Missing hidden paragraphs')

    const testables = await loadContentScriptTestables()

    expect(testables.collectTranslatableBlocks(hiddenParagraph)).toEqual([])
    expect(testables.collectTranslatableBlocks(transparentParagraph)).toEqual([])
  })

  it('collects visible child blocks inside display contents containers', async () => {
    document.body.innerHTML = `
      <main>
        <section style="display: contents">
          <p>Display contents child text should still be translated.</p>
        </section>
      </main>
    `

    const displayContentsSection = document.querySelector('section')
    if (!(displayContentsSection instanceof HTMLElement)) {
      throw new Error('Missing display contents section')
    }
    displayContentsSection.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks.map(({ element }) => element.tagName.toLowerCase())).toEqual(['p'])
    expect(blocks.map(({ text }) => text)).toEqual([
      'Display contents child text should still be translated.',
    ])
  })

  it('does not include code-like inline content in collected prose blocks', async () => {
    document.body.innerHTML = `
      <main>
        <p>Install the package with <code>pnpm add native-translate</code> before continuing.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toContain('Install the package with')
    expect(blocks[0].text).toContain('before continuing.')
    expect(blocks[0].text).not.toContain('pnpm add native-translate')
    expect(blocks[0].nodeMap?.size).toBe(1)
  })

  it('keeps inline line breaks as readable separators during translation', async () => {
    document.body.innerHTML = `
      <main>
        <p>First line for support.<br>Second line after break.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    expect(block.text).toBe('First line for support.\nSecond line after break.')

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text
            .replace('First line for support.', '第一行支持说明。')
            .replace('Second line after break.', '第二行换行后说明。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const translation = block.element.querySelector('.native-translate-translation')
    expect(translation?.textContent).toBe('第一行支持说明。\n第二行换行后说明。')
  })

  it('does not send ruby annotations for translation and preserves them when rendering', async () => {
    document.body.innerHTML = `
      <main>
        <p>Read the <ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby> before continuing.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    expect(block.text).toContain('Read the')
    expect(block.text).toContain('before continuing.')
    expect(block.text).not.toContain('漢字')
    expect(block.text).not.toContain('かんじ')
    expect(block.nodeMap?.size).toBe(1)

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text.replace('Read the', '阅读').replace('before continuing.', '然后继续。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const translation = block.element.querySelector('.native-translate-translation')
    expect(translation).toHaveTextContent('阅读')
    expect(translation).toHaveTextContent('然后继续。')
    expect(translation?.querySelector('ruby')).toHaveTextContent('漢字')
    expect(translation?.querySelector('rt')).toHaveTextContent('かんじ')
  })

  it('does not send superscript and subscript markers for translation and preserves them', async () => {
    document.body.innerHTML = `
      <main>
        <p>Review the cited result<sup>[1]</sup> and water formula H<sub>2</sub>O.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    expect(block.text).toContain('Review the cited result')
    expect(block.text).toContain('and water formula H')
    expect(block.text).toContain('O.')
    expect(block.text).not.toContain('[1]')
    expect(block.text).not.toContain('2')
    expect(block.nodeMap?.size).toBe(2)

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text
            .replace('Review the cited result', '查看引用结果')
            .replace('and water formula H', '以及水的化学式 H')
            .replace('O.', 'O。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const translation = block.element.querySelector('.native-translate-translation')
    expect(translation).toHaveTextContent('查看引用结果')
    expect(translation).toHaveTextContent('以及水的化学式 H')
    expect(translation?.querySelector('sup')).toHaveTextContent('[1]')
    expect(translation?.querySelector('sub')).toHaveTextContent('2')
  })

  it('does not send variable names for translation and preserves var elements', async () => {
    document.body.innerHTML = `
      <main>
        <p>Set <var>maxRetries</var> before starting the request loop.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    expect(block.text).toContain('Set')
    expect(block.text).toContain('before starting the request loop.')
    expect(block.text).not.toContain('maxRetries')
    expect(block.nodeMap?.size).toBe(1)

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text
            .replace('Set', '设置')
            .replace('before starting the request loop.', '然后启动请求循环。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const variable = block.element.querySelector('.native-translate-translation var')
    expect(variable).toHaveTextContent('maxRetries')
  })

  it('does not send abbreviation text for translation and preserves the abbreviation element', async () => {
    document.body.innerHTML = `
      <main>
        <p>The <abbr title="World Health Organization">WHO</abbr> published updated guidance.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    expect(block.text).toContain('The')
    expect(block.text).toContain('published updated guidance.')
    expect(block.text).not.toContain('WHO')
    expect(block.nodeMap?.size).toBe(1)

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text.replace('The', '该').replace('published updated guidance.', '发布了更新指南。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const abbreviation = block.element.querySelector('.native-translate-translation abbr')
    expect(abbreviation).toHaveTextContent('WHO')
    expect(abbreviation).toHaveAttribute('title', 'World Health Organization')
  })

  it('does not send data element text for translation and preserves machine-readable values', async () => {
    document.body.innerHTML = `
      <main>
        <p>Selected product code <data value="sku-42">NT-42</data> is ready for checkout.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    expect(block.text).toContain('Selected product code')
    expect(block.text).toContain('is ready for checkout.')
    expect(block.text).not.toContain('NT-42')
    expect(block.nodeMap?.size).toBe(1)

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text
            .replace('Selected product code', '已选择的产品代码')
            .replace('is ready for checkout.', '可以结账。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const data = block.element.querySelector('.native-translate-translation data')
    expect(data).toHaveTextContent('NT-42')
    expect(data).toHaveAttribute('value', 'sku-42')
  })

  it('does not include hidden inline descendants in collected prose blocks', async () => {
    document.body.innerHTML = `
      <main>
        <p>Visible prose <span style="opacity: 0">hidden inline text</span> should be translated.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const blocks = testables.collectTranslatableBlocks(document.body)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toContain('Visible prose')
    expect(blocks[0].text).toContain('should be translated.')
    expect(blocks[0].text).not.toContain('hidden inline text')
  })

  it('does not send inline opt-out descendants for translation and preserves them when rendering', async () => {
    document.body.innerHTML = `
      <main>
        <p>Use <span translate="no">NativeTranslate</span> and <span class="notranslate">BrandTerm</span> for this workflow.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    expect(block.text).toContain('Use')
    expect(block.text).toContain('for this workflow.')
    expect(block.text).not.toContain('NativeTranslate')
    expect(block.text).not.toContain('BrandTerm')

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text.replace('Use', '使用').replace('for this workflow.', '完成此流程。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const translation = block.element.querySelector('.native-translate-translation')
    expect(translation).toHaveTextContent('使用')
    expect(translation).toHaveTextContent('NativeTranslate')
    expect(translation).toHaveTextContent('BrandTerm')
    expect(translation).toHaveTextContent('完成此流程。')
    expect(translation?.querySelector('[translate="no"]')).toHaveTextContent('NativeTranslate')
    expect(translation?.querySelector('.notranslate')).toHaveTextContent('BrandTerm')
  })

  it('preserves code-like inline nodes when rendering translated prose', async () => {
    document.body.innerHTML = `
      <main>
        <p>Install with <code>pnpm add native-translate</code> now.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text.replace('Install with', '安装').replace('now.', '即可。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const translation = block.element.querySelector('.native-translate-translation')
    expect(translation).toHaveTextContent('安装')
    expect(translation).toHaveTextContent('即可。')
    expect(translation?.querySelector('code')).toHaveTextContent('pnpm add native-translate')
  })

  it('preserves semantic inline formatting when rendering translated prose', async () => {
    document.body.innerHTML = `
      <main>
        <p>Save <strong>important</strong> pages with <em>friendly</em> labels for <dfn>glossary terms</dfn>.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text
            .replace('Save', '保存')
            .replace('important', '重要')
            .replace('pages with', '页面并使用')
            .replace('friendly', '友好')
            .replace('labels for', '标签用于')
            .replace('glossary terms', '术语表条目')
            .replace('.', '。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const translation = block.element.querySelector('.native-translate-translation')
    expect(translation).toHaveTextContent('保存')
    expect(translation).toHaveTextContent('页面并使用')
    expect(translation?.querySelector('strong')).toHaveTextContent('重要')
    expect(translation?.querySelector('em')).toHaveTextContent('友好')
    expect(translation?.querySelector('dfn')).toHaveTextContent('术语表条目')
  })

  it('marks LTR translations explicitly inside RTL pages', async () => {
    document.documentElement.setAttribute('dir', 'rtl')
    document.body.innerHTML = `
      <main dir="rtl">
        <p>مرحبا بالعالم</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async () => 'Hello world',
      },
      block.text,
      'ar',
      'en',
      block.nodeMap,
    )

    const translation = block.element.querySelector('.native-translate-translation')
    expect(translation).toHaveTextContent('Hello world')
    expect(translation).toHaveAttribute('dir', 'ltr')
  })

  it('marks RTL translations for underscored regional target language codes', async () => {
    document.body.innerHTML = `
      <main>
        <p>Hello world</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async () => 'مرحبا بالعالم',
      },
      block.text,
      'en',
      'ar_EG',
      block.nodeMap,
    )

    const translation = block.element.querySelector('.native-translate-translation')
    expect(translation).toHaveTextContent('مرحبا بالعالم')
    expect(translation).toHaveAttribute('lang', 'ar-EG')
    expect(translation).toHaveAttribute('dir', 'rtl')
    expect(translation).toHaveStyle({ textAlign: 'right' })
  })

  it('does not send inline MathML content for translation and preserves it when rendering', async () => {
    document.body.innerHTML = `
      <main>
        <p>The equation <math><mi>x</mi><mo>=</mo><mn>1</mn></math> remains unchanged.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const [block] = testables.collectTranslatableBlocks(document.body)
    if (!block) throw new Error('Missing translatable block')

    expect(block.text).toContain('The equation')
    expect(block.text).toContain('remains unchanged.')
    expect(block.text).not.toContain('x')
    expect(block.text).not.toContain('=')
    expect(block.text).not.toContain('1')

    await testables.translateIntoElementPreservingNewlines(
      block.element,
      {
        translate: async (text: string) =>
          text.replace('The equation', '公式').replace('remains unchanged.', '保持不变。'),
      },
      block.text,
      'en',
      'zh',
      block.nodeMap,
    )

    const translation = block.element.querySelector('.native-translate-translation')
    expect(translation).toHaveTextContent('公式')
    expect(translation).toHaveTextContent('保持不变。')
    expect(translation?.querySelector('math')).toHaveTextContent('x=1')
  })

  it('positions inline hints with valid pixel values', async () => {
    document.body.innerHTML = '<textarea>hello</textarea>'
    const textarea = document.querySelector('textarea')
    if (!textarea) throw new Error('Missing textarea')
    textarea.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 80,
      width: 200,
      height: 60,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    const hint = testables.showInlineHintNearElement(textarea, 'Preparing')
    const hintElement = document.querySelector<HTMLElement>('.native-translate-inline-hint')

    expect(hintElement?.style.left).toBe('210px')
    expect(hintElement?.style.top).toBe('20px')

    hint.remove()
  })

  it('positions inline hints using the nearest inherited text direction', async () => {
    document.body.innerHTML = '<section dir="rtl"><textarea>مرحبا</textarea></section>'
    const textarea = document.querySelector('textarea')
    if (!textarea) throw new Error('Missing textarea')
    textarea.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 80,
      width: 200,
      height: 60,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    const hint = testables.showInlineHintNearElement(textarea, 'Preparing')
    const hintElement = document.querySelector<HTMLElement>('.native-translate-inline-hint')

    expect(hintElement?.dataset.dir).toBe('rtl')
    expect(hintElement?.style.left).toBe('10px')
    expect(hintElement?.style.transform).toBe('translate(6px, -110%)')

    hint.remove()
  })

  it('positions inline hints using inherited CSS text direction', async () => {
    document.body.innerHTML = '<section style="direction: rtl"><textarea>مرحبا</textarea></section>'
    const textarea = document.querySelector('textarea')
    if (!textarea) throw new Error('Missing textarea')
    textarea.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 80,
      width: 200,
      height: 60,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    const hint = testables.showInlineHintNearElement(textarea, 'Preparing')
    const hintElement = document.querySelector<HTMLElement>('.native-translate-inline-hint')

    expect(hintElement?.dataset.dir).toBe('rtl')
    expect(hintElement?.style.left).toBe('10px')

    hint.remove()
  })

  it('announces inline hint status politely without taking pointer events', async () => {
    document.body.innerHTML = '<textarea>hello</textarea>'
    const textarea = document.querySelector('textarea')
    if (!textarea) throw new Error('Missing textarea')

    const testables = await loadContentScriptTestables()
    const hint = testables.showInlineHintNearElement(textarea, 'Preparing')
    const hintElement = document.querySelector<HTMLElement>('.native-translate-inline-hint')

    expect(hintElement).toHaveAttribute('role', 'status')
    expect(hintElement).toHaveAttribute('aria-live', 'polite')
    expect(hintElement?.style.pointerEvents).toBe('none')

    hint.remove()
  })

  it('uses the modern translation API for full page translation when legacy Translator is absent', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Readable paragraph for translation coverage.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const translated = document.querySelector('.native-translate-translation')
    expect(translated).toHaveTextContent('translated: Readable paragraph for translation coverage.')
    expect(document.querySelector('p')).toHaveAttribute('data-native-translate-done', '1')
  })

  it('uses the page bridge for initial full page translation when isolated adapters are unavailable', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Bridge fallback paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const startedAt = Date.now()
    let bridgeRequestElapsed = Number.POSITIVE_INFINITY
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === '__NT_BRIDGE_REQ' &&
        'id' in message &&
        'text' in message
      ) {
        bridgeRequestElapsed = Date.now() - startedAt
        window.setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: {
                id: message.id,
                ok: true,
                result: `bridge: ${message.text}`,
                type: '__NT_BRIDGE_RES',
              },
            }),
          )
        }, 0)
      }
    })

    await testables.translateFullPageAutoDetect('zh')

    await waitFor(
      () => {
        expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
          'bridge: Bridge fallback paragraph for translation.',
        )
      },
      { timeout: 3000 },
    )
    expect(bridgeRequestElapsed).toBeLessThan(500)
  })

  it('stops retrying the page bridge after it reports translator unavailability', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>First bridge unavailable paragraph.</p>
        <p>Second bridge unavailable paragraph.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    let bridgeRequestCount = 0
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === '__NT_BRIDGE_REQ' &&
        'id' in message
      ) {
        bridgeRequestCount += 1
        window.setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: {
                error: 'Translator API unavailable',
                id: message.id,
                ok: false,
                type: '__NT_BRIDGE_RES',
              },
            }),
          )
        }, 0)
      }
    })

    await testables.translateFullPageAutoDetect('zh')
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(bridgeRequestCount).toBe(1)
    expect(document.querySelector('.native-translate-skeleton')).toBeNull()
    expect(document.querySelector('.native-translate-translation')).toBeNull()
  })

  it('retries the page bridge on a later explicit full page translation request', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Bridge retry paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    let shouldFailBridge = true
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === '__NT_BRIDGE_REQ' &&
        'id' in message &&
        'text' in message
      ) {
        window.setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: shouldFailBridge
                ? {
                    error: 'Translator API unavailable',
                    id: message.id,
                    ok: false,
                    type: '__NT_BRIDGE_RES',
                  }
                : {
                    id: message.id,
                    ok: true,
                    result: `bridge: ${message.text}`,
                    type: '__NT_BRIDGE_RES',
                  },
            }),
          )
        }, 0)
      }
    })

    await testables.translateFullPageAutoDetect('zh')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(document.querySelector('.native-translate-translation')).toBeNull()

    shouldFailBridge = false
    await testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
        'bridge: Bridge retry paragraph for translation.',
      )
    })
  })

  it('retries the page bridge for an explicit side panel text translation request', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Bridge unavailable marker source paragraph.</p></main>'

    const testables = await loadContentScriptTestables()
    let shouldFailBridge = true
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === '__NT_BRIDGE_REQ' &&
        'id' in message &&
        'text' in message
      ) {
        window.setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: shouldFailBridge
                ? {
                    error: 'Translator API unavailable',
                    id: message.id,
                    ok: false,
                    type: '__NT_BRIDGE_RES',
                  }
                : {
                    id: message.id,
                    ok: true,
                    result: `bridge: ${message.text}`,
                    type: '__NT_BRIDGE_RES',
                  },
            }),
          )
        }, 0)
      }
    })

    await testables.translateFullPageAutoDetect('zh')
    await new Promise((resolve) => setTimeout(resolve, 150))

    shouldFailBridge = false
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[2]?.[0]
    if (!listener) throw new Error('Missing translate text listener')
    const sendResponse = vi.fn()

    listener(
      {
        payload: {
          sourceLanguage: 'en',
          targetLanguage: 'zh',
          text: 'Side panel bridge retry text.',
        },
        type: 'NATIVE_TRANSLATE_TRANSLATE_TEXT',
      },
      {},
      sendResponse,
    )

    await waitFor(
      () => {
        expect(sendResponse).toHaveBeenCalledWith({
          detectedSource: 'en',
          ok: true,
          result: 'bridge: Side panel bridge retry text.',
        })
      },
      { timeout: 3000 },
    )
  })

  it('uses page Chinese variant hints for side panel auto text translation', async () => {
    document.documentElement.setAttribute('lang', 'zh-TW')

    await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async () => [{ confidence: 0.9, detectedLanguage: 'zh' }],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[2]?.[0]
    if (!listener) throw new Error('Missing translate text listener')
    const sendResponse = vi.fn()

    listener(
      {
        payload: {
          sourceLanguage: 'auto',
          targetLanguage: 'zh-CN',
          text: '繁體 中文 側邊欄 翻譯。',
        },
        type: 'NATIVE_TRANSLATE_TRANSLATE_TEXT',
      },
      {},
      sendResponse,
    )

    await waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        detectedSource: 'zh-TW',
        ok: true,
        result: 'zh-CN: 繁體 中文 側邊欄 翻譯。',
      })
    })
  })

  it('retries side panel language detection for the same text after detector becomes available', async () => {
    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[2]?.[0]
    if (!listener) throw new Error('Missing translate text listener')
    const firstResponse = vi.fn()
    const text = 'Texto del panel lateral que se repite despues.'

    listener(
      {
        payload: {
          sourceLanguage: 'auto',
          targetLanguage: 'zh',
          text,
        },
        type: 'NATIVE_TRANSLATE_TRANSLATE_TEXT',
      },
      {},
      firstResponse,
    )

    await waitFor(() => {
      expect(firstResponse).toHaveBeenCalledWith({
        detectedSource: 'en',
        ok: true,
        result: `en->zh-CN: ${text}`,
      })
    })

    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async () => [{ confidence: 0.9, detectedLanguage: 'es' }],
      })),
    })
    window.__nativeLanguageDetector = undefined
    const secondResponse = vi.fn()

    listener(
      {
        payload: {
          sourceLanguage: 'auto',
          targetLanguage: 'zh',
          text,
        },
        type: 'NATIVE_TRANSLATE_TRANSLATE_TEXT',
      },
      {},
      secondResponse,
    )

    await waitFor(() => {
      expect(secondResponse).toHaveBeenCalledWith({
        detectedSource: 'es',
        ok: true,
        result: `es->zh-CN: ${text}`,
      })
    })
  })

  it('deduplicates concurrent side panel language detection for identical text', async () => {
    const detection = createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => detection.promise)
    await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[2]?.[0]
    if (!listener) throw new Error('Missing translate text listener')
    const firstResponse = vi.fn()
    const secondResponse = vi.fn()
    const text = 'Texto concurrente del panel lateral.'
    const message = {
      payload: {
        sourceLanguage: 'auto',
        targetLanguage: 'zh',
        text,
      },
      type: 'NATIVE_TRANSLATE_TRANSLATE_TEXT',
    }

    listener(message, {}, firstResponse)
    listener(message, {}, secondResponse)

    await waitFor(() => {
      expect(detect).toHaveBeenCalledTimes(1)
    })
    detection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

    await waitFor(() => {
      expect(firstResponse).toHaveBeenCalledWith({
        detectedSource: 'es',
        ok: true,
        result: `es->zh-CN: ${text}`,
      })
      expect(secondResponse).toHaveBeenCalledWith({
        detectedSource: 'es',
        ok: true,
        result: `es->zh-CN: ${text}`,
      })
    })
  })

  it('does not reuse side panel language detection for different long texts sharing a prefix', async () => {
    await loadContentScriptTestables()
    let callIndex = 0
    const detect = vi.fn(async () => [
      {
        confidence: 0.9,
        detectedLanguage: callIndex++ === 0 ? 'en' : 'es',
      },
    ])
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })

    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[2]?.[0]
    if (!listener) throw new Error('Missing detect language listener')
    const commonPrefix = 'Shared prefix for long editor text. '.repeat(80)
    const firstResponse = vi.fn()
    const secondResponse = vi.fn()

    listener(
      {
        payload: { text: `${commonPrefix}First English ending.` },
        type: 'NATIVE_TRANSLATE_DETECT_LANGUAGE',
      },
      {},
      firstResponse,
    )
    await waitFor(() => {
      expect(firstResponse).toHaveBeenCalledWith({ lang: 'en', ok: true })
    })

    listener(
      {
        payload: { text: `${commonPrefix}Segundo final en español.` },
        type: 'NATIVE_TRANSLATE_DETECT_LANGUAGE',
      },
      {},
      secondResponse,
    )
    await waitFor(() => {
      expect(secondResponse).toHaveBeenCalledWith({ lang: 'es', ok: true })
    })
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it('canonicalizes explicit side panel text source language before translating', async () => {
    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[2]?.[0]
    if (!listener) throw new Error('Missing translate text listener')
    const sendResponse = vi.fn()

    listener(
      {
        payload: {
          sourceLanguage: 'zh_Hant',
          targetLanguage: 'zh-CN',
          text: '繁體 中文 顯式 來源。',
        },
        type: 'NATIVE_TRANSLATE_TRANSLATE_TEXT',
      },
      {},
      sendResponse,
    )

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguage: 'zh-TW',
          targetLanguage: 'zh-CN',
        }),
      )
      expect(sendResponse).toHaveBeenCalledWith({
        detectedSource: 'zh-TW',
        ok: true,
        result: 'zh-CN: 繁體 中文 顯式 來源。',
      })
    })
  })

  it('canonicalizes explicit side panel text target language before translating', async () => {
    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[2]?.[0]
    if (!listener) throw new Error('Missing translate text listener')
    const sendResponse = vi.fn()

    listener(
      {
        payload: {
          sourceLanguage: 'zh-CN',
          targetLanguage: 'zh_Hant',
          text: '简体 中文 显式 目标。',
        },
        type: 'NATIVE_TRANSLATE_TRANSLATE_TEXT',
      },
      {},
      sendResponse,
    )

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguage: 'zh-CN',
          targetLanguage: 'zh-TW',
        }),
      )
      expect(sendResponse).toHaveBeenCalledWith({
        detectedSource: 'zh-CN',
        ok: true,
        result: 'zh-TW: 简体 中文 显式 目标。',
      })
    })
  })

  it('retries the page bridge for an explicit triple-space input translation request', async () => {
    document.documentElement.setAttribute('lang', 'zh')
    document.body.innerHTML =
      '<main><p>Bridge unavailable marker paragraph.</p><input type="text" /></main>'

    const testables = await loadContentScriptTestables()
    let shouldFailBridge = true
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === '__NT_BRIDGE_REQ' &&
        'id' in message &&
        'text' in message
      ) {
        window.setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: shouldFailBridge
                ? {
                    error: 'Translator API unavailable',
                    id: message.id,
                    ok: false,
                    type: '__NT_BRIDGE_RES',
                  }
                : {
                    id: message.id,
                    ok: true,
                    result: `bridge: ${message.text}`,
                    type: '__NT_BRIDGE_RES',
                  },
            }),
          )
        }, 0)
      }
    })

    await testables.translateFullPageAutoDetect('en')
    await new Promise((resolve) => setTimeout(resolve, 150))

    shouldFailBridge = false
    const input = document.querySelector('input')
    if (!input) throw new Error('Missing text input')
    input.focus()
    input.value = 'Input bridge retry text.  '
    input.selectionStart = input.value.length
    input.selectionEnd = input.value.length
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Space',
        key: ' ',
      }),
    )

    await waitFor(
      () => {
        expect(input).toHaveValue('bridge: Input bridge retry text.')
      },
      { timeout: 3000 },
    )
  })

  it('uses the preferred input target language for triple-space bridge translation', async () => {
    document.documentElement.setAttribute('lang', 'zh')
    document.body.innerHTML = '<main><input type="text" /></main>'
    window.__nativeTripleSpaceInit = undefined

    await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async () => [{ confidence: 0.9, detectedLanguage: 'zh' }],
      })),
    })
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === '__NT_BRIDGE_REQ' &&
        'id' in message &&
        'target' in message &&
        'text' in message
      ) {
        window.setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: {
                id: message.id,
                ok: true,
                result: `${message.target}: ${String(message.text).trim()}`,
                type: '__NT_BRIDGE_RES',
              },
            }),
          )
        }, 0)
      }
    })

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing text input')
    input.focus()
    input.value = '需要 翻译  '
    input.selectionStart = input.value.length
    input.selectionEnd = input.value.length
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Space',
        key: ' ',
      }),
    )

    await waitFor(
      () => {
        expect(input).toHaveValue('en: 需要 翻译')
      },
      { timeout: 3000 },
    )
  })

  it('removes trigger spaces before translating contenteditable text', async () => {
    document.documentElement.setAttribute('lang', 'zh')
    document.body.innerHTML =
      '<main><div contenteditable="true" tabindex="0">Editable bridge text.  </div></main>'
    window.__nativeTripleSpaceInit = undefined

    await loadContentScriptTestables()
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === '__NT_BRIDGE_REQ' &&
        'id' in message &&
        'text' in message
      ) {
        window.setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: {
                id: message.id,
                ok: true,
                result: `bridge: ${message.text}`,
                type: '__NT_BRIDGE_RES',
              },
            }),
          )
        }, 0)
      }
    })

    const editor = document.querySelector<HTMLElement>('[contenteditable]')
    if (!editor) throw new Error('Missing editable host')
    editor.focus()
    const selection = window.getSelection()
    if (!selection) throw new Error('Missing selection')
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Space',
        key: ' ',
      }),
    )

    await waitFor(
      () => {
        expect(editor.textContent).toBe('bridge: Editable bridge text.')
      },
      { timeout: 3000 },
    )
  })

  it('uses page Chinese variant hints for triple-space translation with generic zh detection', async () => {
    document.documentElement.setAttribute('lang', 'zh-TW')
    window.__nativeTranslatePopupSettingsSubscribed = undefined

    const testables = await loadContentScriptTestables({
      'nativeTranslate.settings': {
        inputTargetLanguage: 'zh-CN',
        targetLanguage: 'zh-CN',
      },
    })
    const settingsListener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]?.[0]
    if (!settingsListener) throw new Error('Missing storage settings listener')
    settingsListener(
      {
        'nativeTranslate.settings': {
          newValue: {
            inputTargetLanguage: 'zh-CN',
            targetLanguage: 'zh-CN',
          },
        },
      },
      'local',
    )
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async () => [{ confidence: 0.9, detectedLanguage: 'zh' }],
      })),
    })
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === '__NT_BRIDGE_REQ' &&
        'id' in message &&
        'target' in message &&
        'text' in message
      ) {
        window.setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: {
                id: message.id,
                ok: true,
                result: `${message.target}: ${String(message.text).trim()}`,
                type: '__NT_BRIDGE_RES',
              },
            }),
          )
        }, 0)
      }
    })

    await expect(testables.translateFreeTextToPreferred('繁體 中文')).resolves.toEqual({
      source: 'zh-TW',
      target: 'zh-CN',
      translated: 'zh-CN: 繁體 中文',
    })
  })

  it('continues translating eligible blocks added after full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Later paragraph from client side rendering.'
    main.appendChild(laterParagraph)

    await waitFor(() => {
      expect(laterParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Later paragraph from client side rendering.',
      )
    })
  })

  it('uses the detected language for dynamic blocks added after full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (text: string) => [
          {
            confidence: 0.9,
            detectedLanguage: text.startsWith('Texto ') ? 'es' : 'en',
          },
        ],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Texto dinamico despues de renderizar la pagina.'
    main.appendChild(laterParagraph)

    await waitFor(() => {
      expect(laterParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'es->zh-CN: Texto dinamico despues de renderizar la pagina.',
      )
    })
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'es', targetLanguage: 'zh-CN' }),
    )
  })

  it('does not translate dynamic blocks that become hidden while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    window.__nativeTranslateAdapter = undefined
    window.__nativeTranslatePool = undefined
    window.__nativeLanguageDetector = undefined
    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Texto dinamico despues de renderizar la pagina.'
    main.appendChild(laterParagraph)

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Texto dinamico despues de renderizar la pagina.')
    })
    laterParagraph.hidden = true
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

    await new Promise((resolve) => setTimeout(resolve, 160))

    expect(translate).not.toHaveBeenCalledWith('Texto dinamico despues de renderizar la pagina.')
    expect(laterParagraph).not.toHaveAttribute('data-native-translate-done')
    expect(laterParagraph.querySelector('.native-translate-translation')).toBeNull()
    expect(document.querySelector('.native-translate-skeleton')).toBeNull()
  })

  it('does not translate stale dynamic block text that becomes too short while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    window.__nativeTranslateAdapter = undefined
    window.__nativeTranslatePool = undefined
    window.__nativeLanguageDetector = undefined
    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Texto dinamico despues de renderizar la pagina.'
    main.appendChild(laterParagraph)

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Texto dinamico despues de renderizar la pagina.')
    })
    laterParagraph.textContent = 'Yo'
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

    await new Promise((resolve) => setTimeout(resolve, 160))

    expect(translate).not.toHaveBeenCalledWith('Texto dinamico despues de renderizar la pagina.')
    expect(laterParagraph).toHaveTextContent('Yo')
    expect(laterParagraph).not.toHaveAttribute('data-native-translate-done')
    expect(laterParagraph.querySelector('.native-translate-translation')).toBeNull()
    expect(document.querySelector('.native-translate-skeleton')).toBeNull()
  })

  it('continues translating custom elements with direct text added after full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const laterLabel = document.createElement('summary-label')
    laterLabel.textContent = 'Later custom element text from client side rendering.'
    main.appendChild(laterLabel)

    await waitFor(() => {
      expect(laterLabel.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
        'translated: Later custom element text from client side rendering.',
      )
    })
  })

  it('continues translating loose text and child blocks inside custom elements added later', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const card = document.createElement('article-card')
    card.append(
      document.createTextNode('Late custom element intro text should be translated.'),
      Object.assign(document.createElement('p'), {
        textContent: 'Late custom element paragraph should also be translated.',
      }),
    )
    main.appendChild(card)

    await waitFor(() => {
      expect(card.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
        'translated: Late custom element intro text should be translated.',
      )
      expect(card.querySelector('p .native-translate-translation')).toHaveTextContent(
        'translated: Late custom element paragraph should also be translated.',
      )
    })
  })

  it('continues translating text added later inside custom elements', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph for translation.</p><summary-label></summary-label></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const label = document.querySelector('summary-label')
    if (!label) throw new Error('Missing custom label')
    label.appendChild(document.createTextNode('Late custom element text from client hydration.'))

    await waitFor(() => {
      expect(label.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
        'translated: Late custom element text from client hydration.',
      )
    })
  })

  it('continues translating description list terms added dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p><dl></dl></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const list = document.querySelector('dl')
    if (!list) throw new Error('Missing description list')
    list.innerHTML = `
      <dt>Keyboard shortcut setting</dt>
      <dd>Choose the modifier key used for quick translation.</dd>
    `

    await waitFor(() => {
      expect(list.querySelector('dt .native-translate-translation')).toHaveTextContent(
        'translated: Keyboard shortcut setting',
      )
      expect(list.querySelector('dd .native-translate-translation')).toHaveTextContent(
        'translated: Choose the modifier key used for quick translation.',
      )
    })
  })

  it('continues translating placeholder attributes added dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const input = document.createElement('input')
    input.type = 'search'
    input.placeholder = 'Search account settings'
    main.appendChild(input)

    await waitFor(() => {
      expect(input).toHaveAttribute('placeholder', 'translated: Search account settings')
    })
    expect(input.nextElementSibling?.classList.contains('native-translate-translation')).not.toBe(
      true,
    )
  })

  it('uses the detected language for dynamic placeholders added after full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (text: string) => [
          {
            confidence: 0.9,
            detectedLanguage: text.startsWith('Buscar ') ? 'es' : 'en',
          },
        ],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const input = document.createElement('input')
    input.type = 'search'
    input.placeholder = 'Buscar configuracion de cuenta'
    main.appendChild(input)

    await waitFor(() => {
      expect(input).toHaveAttribute('placeholder', 'es->zh-CN: Buscar configuracion de cuenta')
    })
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'es', targetLanguage: 'zh-CN' }),
    )
  })

  it('continues translating placeholder attributes changed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input type="search">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing input')
    input.setAttribute('placeholder', 'Search account settings')

    await waitFor(() => {
      expect(input).toHaveAttribute('placeholder', 'translated: Search account settings')
    })
  })

  it('translates input placeholders when a scripted value clear makes them visible', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input type="search" value="invoice" placeholder="Search billing records">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing valued input')
    expect(input).toHaveAttribute('placeholder', 'Search billing records')

    input.value = ''

    await waitFor(() => {
      expect(input).toHaveAttribute('placeholder', 'translated: Search billing records')
    })
  })

  it('translates textarea placeholders when a scripted value clear makes them visible', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <textarea placeholder="Write a support request">Draft billing question</textarea>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const textarea = document.querySelector('textarea')
    if (!textarea) throw new Error('Missing valued textarea')
    expect(textarea).toHaveAttribute('placeholder', 'Write a support request')

    textarea.value = ''

    await waitFor(() => {
      expect(textarea).toHaveAttribute('placeholder', 'translated: Write a support request')
    })
  })

  it('restores translated placeholders when scripted values make them hidden', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input type="search" placeholder="Search billing records">
        <textarea placeholder="Write a support request"></textarea>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    const textarea = document.querySelector('textarea')
    if (!input || !textarea) throw new Error('Missing placeholder fields')
    expect(input).toHaveAttribute('placeholder', 'translated: Search billing records')
    expect(textarea).toHaveAttribute('placeholder', 'translated: Write a support request')

    input.value = 'invoice'
    textarea.value = 'Draft billing question'

    await waitFor(() => {
      expect(input).toHaveAttribute('placeholder', 'Search billing records')
      expect(textarea).toHaveAttribute('placeholder', 'Write a support request')
    })
    expect(input).not.toHaveAttribute('data-native-translate-original-placeholder')
    expect(input).not.toHaveAttribute('data-native-translate-placeholder-done')
    expect(textarea).not.toHaveAttribute('data-native-translate-original-placeholder')
    expect(textarea).not.toHaveAttribute('data-native-translate-placeholder-done')
  })

  it('restores translated placeholders when fields become hidden dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input type="search" placeholder="Search billing records">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing placeholder input')
    expect(input).toHaveAttribute('placeholder', 'translated: Search billing records')

    input.hidden = true

    await waitFor(() => {
      expect(input).toHaveAttribute('placeholder', 'Search billing records')
    })
    expect(input).not.toHaveAttribute('data-native-translate-original-placeholder')
    expect(input).not.toHaveAttribute('data-native-translate-placeholder-done')
  })

  it('continues translating accessibility attributes changed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <button></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing button')
    button.setAttribute('aria-label', 'Open account settings')

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-label', 'translated: Open account settings')
    })
  })

  it('uses the detected language for dynamic accessibility attributes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <button></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (text: string) => [
          {
            confidence: 0.9,
            detectedLanguage: text.startsWith('Abrir ') ? 'es' : 'en',
          },
        ],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing button')
    button.setAttribute('aria-label', 'Abrir configuracion de cuenta')

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-label', 'es->zh-CN: Abrir configuracion de cuenta')
    })
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'es', targetLanguage: 'zh-CN' }),
    )
  })

  it('does not translate dynamic accessibility attributes that become hidden while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <button></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    window.__nativeTranslateAdapter = undefined
    window.__nativeTranslatePool = undefined
    window.__nativeLanguageDetector = undefined
    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing button')
    button.setAttribute('aria-label', 'Abrir configuracion de cuenta')

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Abrir configuracion de cuenta')
    })
    button.hidden = true
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

    await new Promise((resolve) => setTimeout(resolve, 160))

    expect(translate).not.toHaveBeenCalledWith('Abrir configuracion de cuenta')
    expect(button).toHaveAttribute('aria-label', 'Abrir configuracion de cuenta')
    expect(button).not.toHaveAttribute('data-native-translate-original-aria-label')
    expect(button).not.toHaveAttribute('data-native-translate-aria-label-done')
  })

  it('translates only the latest dynamic accessibility attribute changed while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <button></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    window.__nativeTranslateAdapter = undefined
    window.__nativeTranslatePool = undefined
    window.__nativeLanguageDetector = undefined
    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing button')
    button.setAttribute('aria-label', 'Abrir configuracion de cuenta')

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Abrir configuracion de cuenta')
    })
    button.setAttribute('aria-label', 'Abrir facturas recientes')
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-label', 'translated: Abrir facturas recientes')
    })

    expect(translate).not.toHaveBeenCalledWith('Abrir configuracion de cuenta')
    expect(translate).toHaveBeenCalledWith('Abrir facturas recientes')
    expect(button).toHaveAttribute(
      'data-native-translate-original-aria-label',
      'Abrir facturas recientes',
    )
  })

  it('continues translating braille accessibility attributes changed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <button></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing button')
    button.setAttribute('aria-braillelabel', 'acct settings')
    button.setAttribute('aria-brailleroledescription', 'settings launcher')

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-braillelabel', 'translated: acct settings')
      expect(button).toHaveAttribute('aria-brailleroledescription', 'translated: settings launcher')
    })
  })

  it('translates popover data content when an element becomes a popover trigger dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <button data-content="Dynamic popover body text"></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing dynamic popover trigger')
    expect(button).toHaveAttribute('data-content', 'Dynamic popover body text')

    button.setAttribute('data-toggle', 'popover')

    await waitFor(() => {
      expect(button).toHaveAttribute('data-content', 'translated: Dynamic popover body text')
    })
    expect(button.nextElementSibling?.classList.contains('native-translate-translation')).not.toBe(
      true,
    )
  })

  it('restores translated popover data content when an element stops being a popover trigger', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <button data-toggle="popover" data-content="Popover body text that can become plain data"></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing popover trigger')
    expect(button).toHaveAttribute(
      'data-content',
      'translated: Popover body text that can become plain data',
    )

    button.removeAttribute('data-toggle')

    await waitFor(() => {
      expect(button).toHaveAttribute('data-content', 'Popover body text that can become plain data')
    })
    expect(button).not.toHaveAttribute('data-native-translate-original-data-content')
    expect(button).not.toHaveAttribute('data-native-translate-data-content-done')
  })

  it('retranslates translated accessibility attributes when the page updates them dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <button aria-label="Open account settings"></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing button')
    expect(button).toHaveAttribute('aria-label', 'translated: Open account settings')

    button.setAttribute('aria-label', 'Open billing preferences')

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-label', 'translated: Open billing preferences')
    })
  })

  it('keeps translated accessibility attributes removed by the page removed', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <button aria-label="Open account settings"></button>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const button = document.querySelector('button')
    if (!button) throw new Error('Missing button')
    expect(button).toHaveAttribute('aria-label', 'translated: Open account settings')

    button.removeAttribute('aria-label')

    await waitFor(() => {
      expect(button).not.toHaveAttribute('aria-label')
    })
    expect(button).not.toHaveAttribute('data-native-translate-original-aria-label')
    expect(button).not.toHaveAttribute('data-native-translate-aria-label-done')
  })

  it('continues translating button-like input values changed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input type="submit">
        <input type="text">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const controls = Array.from(document.querySelectorAll('input'))
    controls[0].setAttribute('value', 'Send billing request')
    controls[1].setAttribute('value', 'user@example.com')

    await waitFor(() => {
      expect(controls[0]).toHaveValue('translated: Send billing request')
    })
    expect(controls[1]).toHaveValue('user@example.com')
  })

  it('continues translating button-like input value properties changed dynamically', async () => {
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )
    if (!originalValueDescriptor) throw new Error('Missing input value descriptor')

    const values = new WeakMap<HTMLInputElement, string>()
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      configurable: true,
      get() {
        return values.get(this) ?? ''
      },
      set(value: string) {
        values.set(this, value)
      },
    })

    try {
      document.documentElement.setAttribute('lang', 'en')
      document.body.innerHTML = `
        <main>
          <p>Initial paragraph for translation.</p>
          <input type="button">
        </main>
      `

      const input = document.querySelector('input')
      if (!input) throw new Error('Missing dynamic property button input')
      input.value = 'Open account settings'

      const testables = await loadContentScriptTestables()
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(async () => ({
          translate: async (text: string) => `translated: ${text}`,
        })),
      })

      await testables.translateFullPageAutoDetect('zh')

      expect(input).toHaveValue('translated: Open account settings')

      input.value = 'Open billing preferences'

      await waitFor(() => {
        expect(input).toHaveValue('translated: Open billing preferences')
      })
      expect(input).toHaveAttribute(
        'data-native-translate-original-value',
        'Open billing preferences',
      )
    } finally {
      latestTestables?.stopFullPageTranslationObserver()
      Object.defineProperty(HTMLInputElement.prototype, 'value', originalValueDescriptor)
    }
  })

  it('translates only the latest dynamic button-like input value property changed while language detection is pending', async () => {
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )
    if (!originalValueDescriptor) throw new Error('Missing input value descriptor')

    const values = new WeakMap<HTMLInputElement, string>()
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      configurable: true,
      get() {
        return values.get(this) ?? ''
      },
      set(value: string) {
        values.set(this, value)
      },
    })

    try {
      document.documentElement.setAttribute('lang', 'en')
      document.body.innerHTML = `
        <main>
          <p>Initial paragraph for translation.</p>
          <input type="button">
        </main>
      `

      const input = document.querySelector('input')
      if (!input) throw new Error('Missing dynamic property button input')
      input.value = 'Open account settings'

      const testables = await loadContentScriptTestables()
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(async () => ({
          translate: async (text: string) => `translated: ${text}`,
        })),
      })

      await testables.translateFullPageAutoDetect('zh')
      expect(input).toHaveValue('translated: Open account settings')

      window.__nativeTranslateAdapter = undefined
      window.__nativeTranslatePool = undefined
      window.__nativeLanguageDetector = undefined
      const languageDetection =
        createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
      const detect = vi.fn(async () => languageDetection.promise)
      vi.stubGlobal('LanguageDetector', {
        availability: vi.fn(async () => 'available'),
        create: vi.fn(async () => ({ detect })),
      })
      const translate = vi.fn(async (text: string) => `translated: ${text}`)
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(async () => ({ translate })),
      })

      input.value = 'Abrir configuracion de cuenta'

      await waitFor(() => {
        expect(detect).toHaveBeenCalledWith('Abrir configuracion de cuenta')
      })
      input.value = 'Abrir facturas recientes'
      languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'es' }])

      await waitFor(() => {
        expect(input).toHaveValue('translated: Abrir facturas recientes')
      })

      expect(translate).not.toHaveBeenCalledWith('Abrir configuracion de cuenta')
      expect(translate).toHaveBeenCalledWith('Abrir facturas recientes')
      expect(input).toHaveAttribute(
        'data-native-translate-original-value',
        'Abrir facturas recientes',
      )
    } finally {
      latestTestables?.stopFullPageTranslationObserver()
      Object.defineProperty(HTMLInputElement.prototype, 'value', originalValueDescriptor)
    }
  })

  it('clears translated button-like input value attributes when value property is cleared', async () => {
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )
    if (!originalValueDescriptor) throw new Error('Missing input value descriptor')

    const values = new WeakMap<HTMLInputElement, string>()
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      configurable: true,
      get() {
        return values.get(this) ?? ''
      },
      set(value: string) {
        values.set(this, value)
      },
    })

    try {
      document.documentElement.setAttribute('lang', 'en')
      document.body.innerHTML = `
        <main>
          <p>Initial paragraph for translation.</p>
          <input type="button">
        </main>
      `

      const input = document.querySelector('input')
      if (!input) throw new Error('Missing property-cleared button input')
      input.value = 'Open account settings'

      const testables = await loadContentScriptTestables()
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(async () => ({
          translate: async (text: string) => `translated: ${text}`,
        })),
      })

      await testables.translateFullPageAutoDetect('zh')

      expect(input).toHaveValue('translated: Open account settings')
      expect(input).toHaveAttribute('value', 'translated: Open account settings')

      input.value = ''

      await waitFor(() => {
        expect(input).toHaveValue('')
        expect(input).not.toHaveAttribute('value')
      })
      expect(input).not.toHaveAttribute('data-native-translate-original-value')
      expect(input).not.toHaveAttribute('data-native-translate-value-done')
    } finally {
      latestTestables?.stopFullPageTranslationObserver()
      Object.defineProperty(HTMLInputElement.prototype, 'value', originalValueDescriptor)
    }
  })

  it('translates input values when controls become button-like dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input type="text" value="Open account settings">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing input')
    expect(input).toHaveValue('Open account settings')

    input.setAttribute('type', 'button')

    await waitFor(() => {
      expect(input).toHaveValue('translated: Open account settings')
    })
  })

  it('restores input values when button-like controls become editable dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input type="button" value="Open account settings">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing input')
    expect(input).toHaveValue('translated: Open account settings')

    await new Promise((resolve) => setTimeout(resolve, 120))
    input.setAttribute('type', 'text')

    await waitFor(() => {
      expect(input).toHaveValue('Open account settings')
      expect(input).not.toHaveAttribute('data-native-translate-original-value')
      expect(input).not.toHaveAttribute('data-native-translate-value-done')
    })
  })

  it('clears translated button-like input value properties when the page removes value attributes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <input type="button" value="Open account settings">
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const input = document.querySelector('input')
    if (!input) throw new Error('Missing button input')
    expect(input).toHaveValue('translated: Open account settings')

    input.removeAttribute('value')

    await waitFor(() => {
      expect(input).not.toHaveAttribute('value')
      expect(input).toHaveValue('')
    })
    expect(input).not.toHaveAttribute('data-native-translate-original-value')
    expect(input).not.toHaveAttribute('data-native-translate-value-done')
  })

  it('normalizes dynamic translation roots to avoid rescanning nested subtrees', async () => {
    document.body.innerHTML = `
      <main>
        <article>
          <section>
            <p>Nested paragraph that should be covered by the article root.</p>
          </section>
        </article>
        <aside>
          <p>Separate root should remain independent.</p>
        </aside>
      </main>
    `

    const testables = await loadContentScriptTestables()
    const article = document.querySelector('article')
    const section = document.querySelector('section')
    const paragraph = document.querySelector('section p')
    const aside = document.querySelector('aside')
    if (!article || !section || !paragraph || !aside) throw new Error('Missing roots')

    expect(
      testables.normalizeDynamicTranslationRoots([paragraph, section, aside, article]),
    ).toEqual([aside, article])
  })

  it('continues translating dynamic opt-in blocks inside translate-no containers', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <section translate="no"></section>
        <section class="notranslate"></section>
        <section data-no-translate></section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const protectedSections = Array.from(document.querySelectorAll('section'))
    if (protectedSections.length !== 3) throw new Error('Missing protected sections')
    const [translateNoSection, classProtectedSection, dataProtectedSection] = protectedSections
    const laterParagraph = document.createElement('p')
    laterParagraph.setAttribute('translate', 'yes')
    laterParagraph.textContent = 'Later opt in paragraph from client side rendering.'
    translateNoSection.appendChild(laterParagraph)

    const classOptInParagraph = document.createElement('p')
    classOptInParagraph.setAttribute('translate', 'yes')
    classOptInParagraph.textContent = 'Later class opt in paragraph from client side rendering.'
    classProtectedSection.appendChild(classOptInParagraph)

    const dataOptInParagraph = document.createElement('p')
    dataOptInParagraph.setAttribute('translate', 'yes')
    dataOptInParagraph.textContent = 'Later data opt in paragraph from client side rendering.'
    dataProtectedSection.appendChild(dataOptInParagraph)

    await waitFor(() => {
      expect(laterParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Later opt in paragraph from client side rendering.',
      )
      expect(classOptInParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Later class opt in paragraph from client side rendering.',
      )
      expect(dataOptInParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Later data opt in paragraph from client side rendering.',
      )
    })
  })

  it('continues translating loose text nodes added to already segmented containers', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    main.appendChild(
      document.createTextNode('Later loose article text from client side rendering.'),
    )

    await waitFor(() => {
      expect(main.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
        'translated: Later loose article text from client side rendering.',
      )
    })
  })

  it('continues translating eligible blocks added inside open shadow roots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p><news-card /></main>'
    const host = document.querySelector('news-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Shadow article paragraph from client side rendering.'
    shadowRoot.appendChild(laterParagraph)

    await waitFor(() => {
      expect(laterParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Shadow article paragraph from client side rendering.',
      )
    })
  })

  it('continues translating blocks inside open shadow roots attached after full page translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p><news-card /></main>'
    const host = document.querySelector('news-card')
    if (!host) throw new Error('Missing shadow host')

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const shadowRoot = host.attachShadow({ mode: 'open' })
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Late attached shadow article paragraph.'
    shadowRoot.appendChild(laterParagraph)

    await waitFor(() => {
      expect(laterParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Late attached shadow article paragraph.',
      )
    })
  })

  it('does not translate dynamic blocks added inside opted-out open shadow hosts', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph for translation.</p><protected-card translate="no" /></main>'
    const host = document.querySelector('protected-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const protectedParagraph = document.createElement('p')
    protectedParagraph.textContent = 'Protected shadow paragraph from client side rendering.'
    shadowRoot.appendChild(protectedParagraph)

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(protectedParagraph.querySelector('.native-translate-translation')).toBeNull()
  })

  it('does not create translators for full page or dynamic changes with no translatable blocks', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><section translate="no"></section></main>'

    const testables = await loadContentScriptTestables()
    const createTranslator = vi.fn(async () => ({
      translate: async (text: string) => `translated: ${text}`,
    }))
    vi.stubGlobal('translation', {
      createTranslator,
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(createTranslator).not.toHaveBeenCalled()

    const protectedSection = document.querySelector('section')
    if (!protectedSection) throw new Error('Missing protected section')
    const protectedParagraph = document.createElement('p')
    protectedParagraph.textContent = 'Protected dynamic paragraph should not need a translator.'
    protectedSection.appendChild(protectedParagraph)

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(createTranslator).not.toHaveBeenCalled()
    expect(protectedParagraph.querySelector('.native-translate-translation')).toBeNull()
  })

  it('observes dynamic page content when initial empty pages have no translator adapter yet', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main></main>'

    const testables = await loadContentScriptTestables()

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Late SPA paragraph should be translated after render.'
    main.appendChild(laterParagraph)

    await waitFor(() => {
      expect(laterParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Late SPA paragraph should be translated after render.',
      )
    })
  })

  it('does not precreate a page-language translator before detecting dynamic item language', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main></main>'

    const testables = await loadContentScriptTestables()

    await testables.translateFullPageAutoDetect('zh')

    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (text: string) => [
          {
            confidence: 0.9,
            detectedLanguage: text.startsWith('Texto ') ? 'es' : 'en',
          },
        ],
      })),
    })
    const createTranslator = vi.fn(
      async (options: { sourceLanguage: string; targetLanguage: string }) => ({
        translate: async (text: string) =>
          `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
      }),
    )
    vi.stubGlobal('translation', { createTranslator })

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Texto dinamico despues de renderizar la pagina.'
    main.appendChild(laterParagraph)

    await waitFor(() => {
      expect(laterParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'es->zh-CN: Texto dinamico despues de renderizar la pagina.',
      )
    })
    expect(createTranslator).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'zh-CN' }),
    )
    expect(createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'es', targetLanguage: 'zh-CN' }),
    )
  })

  it('does not translate dynamic content that already matches the target language', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (text: string) => [
          {
            confidence: 0.9,
            detectedLanguage: /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en',
          },
        ],
      })),
    })
    const createTranslator = vi.fn(
      async (options: { sourceLanguage: string; targetLanguage: string }) => ({
        translate: async (text: string) =>
          `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
      }),
    )
    vi.stubGlobal('translation', { createTranslator })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const translatorCallsAfterInitialPage = createTranslator.mock.calls.length
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = '这段动态内容已经是中文，不应该重复翻译。'
    main.appendChild(laterParagraph)

    await new Promise((resolve) => setTimeout(resolve, 180))

    expect(laterParagraph.querySelector('.native-translate-translation')).toBeNull()
    expect(laterParagraph).not.toHaveAttribute('data-native-translate-done')
    expect(createTranslator).toHaveBeenCalledTimes(translatorCallsAfterInitialPage)
  })

  it('reuses language detection results for repeated dynamic text', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main></main>'

    const testables = await loadContentScriptTestables()
    await testables.translateFullPageAutoDetect('zh')

    const detect = vi.fn(async (text: string) => [
      {
        confidence: 0.9,
        detectedLanguage: text.startsWith('Texto ') ? 'es' : 'en',
      },
    ])
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const first = document.createElement('p')
    const second = document.createElement('p')
    first.textContent = 'Texto repetido despues de renderizar la pagina.'
    second.textContent = 'Texto repetido despues de renderizar la pagina.'
    main.append(first, second)

    await waitFor(() => {
      expect(first.querySelector('.native-translate-translation')).toHaveTextContent(
        'es->zh-CN: Texto repetido despues de renderizar la pagina.',
      )
      expect(second.querySelector('.native-translate-translation')).toHaveTextContent(
        'es->zh-CN: Texto repetido despues de renderizar la pagina.',
      )
    })

    expect(detect).toHaveBeenCalledTimes(1)
    expect(detect).toHaveBeenCalledWith('Texto repetido despues de renderizar la pagina.')
  })

  it('keeps observing dynamic content when initial blocks have no translator adapter yet', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph waits for translator availability.</p></main>'

    const testables = await loadContentScriptTestables()

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Late paragraph after translator availability should translate.'
    main.appendChild(laterParagraph)

    await waitFor(() => {
      expect(laterParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Late paragraph after translator availability should translate.',
      )
    })
  })

  it('retries initial page blocks when translator adapter becomes available after observer start', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph should retry after translator availability.</p></main>'

    const testables = await loadContentScriptTestables()

    await testables.translateFullPageAutoDetect('zh')

    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })
    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Initial paragraph should retry after translator availability.',
      )
    })
  })

  it('removes existing shadow translations when an open shadow host becomes opted out', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph for translation.</p><article-card /></main>'
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML =
      '<article><p>Shadow paragraph should be cleared after host opt out.</p></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = shadowRoot.querySelector('p')
    if (!paragraph) throw new Error('Missing shadow paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Shadow paragraph should be cleared after host opt out.',
    )

    host.setAttribute('translate', 'no')

    await waitFor(() => {
      const translations = Array.from(paragraph.querySelectorAll('.native-translate-translation'))
      expect(
        translations.some(
          (translation) =>
            translation.textContent === 'translated: Initial hover paragraph after translation.',
        ),
      ).toBe(false)
    })
  })

  it('unwraps generated shadow loose text containers when an open shadow host becomes opted out', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph for translation.</p><article-card /></main>'
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(
      document.createTextNode('Shadow loose text wrapper should be removed after host opt out.'),
    )

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(shadowRoot.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
      'translated: Shadow loose text wrapper should be removed after host opt out.',
    )

    host.setAttribute('translate', 'no')

    await waitFor(() => {
      expect(shadowRoot.querySelector('.native-translate-wrapped-segment')).toBeNull()
    })
    expect(shadowRoot).toHaveTextContent(
      'Shadow loose text wrapper should be removed after host opt out.',
    )
    expect(shadowRoot).not.toHaveTextContent(
      'translated: Shadow loose text wrapper should be removed after host opt out.',
    )
  })

  it('removes generated segmentation marks when a loose text container becomes opted out', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        Loose text container marker should be removed after opt out.
        <p>Initial paragraph for translation.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    expect(main).toHaveAttribute('data-nt-segmented', '1')
    expect(main.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
      'translated: Loose text container marker should be removed after opt out.',
    )

    main.setAttribute('translate', 'no')

    await waitFor(() => {
      expect(main.querySelector('.native-translate-wrapped-segment')).toBeNull()
    })
    expect(main).not.toHaveAttribute('data-nt-segmented')
    expect(main).toHaveTextContent('Loose text container marker should be removed after opt out.')
    expect(main).not.toHaveTextContent(
      'translated: Loose text container marker should be removed after opt out.',
    )
  })

  it('does not translate dynamic blocks added inside inert open shadow hosts', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph for translation.</p><inactive-card inert /></main>'
    const host = document.querySelector('inactive-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const inactiveParagraph = document.createElement('p')
    inactiveParagraph.textContent = 'Inactive shadow paragraph from client side rendering.'
    shadowRoot.appendChild(inactiveParagraph)

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(inactiveParagraph.querySelector('.native-translate-translation')).toBeNull()
  })

  it('translates light DOM content after inert is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <section inert>
          <p>Inactive light DOM paragraph can become readable later.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const section = document.querySelector('section')
    const paragraph = document.querySelector('section p')
    if (!section || !paragraph) throw new Error('Missing inert section')
    expect(paragraph.querySelector('.native-translate-translation')).toBeNull()

    section.removeAttribute('inert')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Inactive light DOM paragraph can become readable later.',
      )
    })
  })

  it('removes light DOM translations when a parent becomes inert dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <section>
          <p>Readable light DOM paragraph should be cleared after inert.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const section = document.querySelector('section')
    const paragraph = document.querySelector('section p')
    if (!section || !paragraph) throw new Error('Missing readable section')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Readable light DOM paragraph should be cleared after inert.',
    )

    section.setAttribute('inert', '')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('removes existing shadow translations when an open shadow host becomes inert', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph for translation.</p><article-card /></main>'
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML =
      '<article><p>Shadow paragraph should be cleared after host becomes inert.</p></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = shadowRoot.querySelector('p')
    if (!paragraph) throw new Error('Missing shadow paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Shadow paragraph should be cleared after host becomes inert.',
    )

    host.setAttribute('inert', '')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('does not translate dynamic blocks added inside open shadow hosts inherited from navigation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<nav><nav-card /></nav><main><p>Initial paragraph for translation.</p></main>'
    const host = document.querySelector('nav-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const navParagraph = document.createElement('p')
    navParagraph.textContent = 'Dynamic navigation shadow paragraph should not be translated.'
    shadowRoot.appendChild(navParagraph)

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(navParagraph.querySelector('.native-translate-translation')).toBeNull()
  })

  it('continues translating loose text nodes added directly inside open shadow roots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p><news-card /></main>'
    const host = document.querySelector('news-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    shadowRoot.appendChild(document.createTextNode('Shadow loose text from client side rendering.'))

    await waitFor(() => {
      expect(shadowRoot.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
        'translated: Shadow loose text from client side rendering.',
      )
    })
  })

  it('does not wrap loose text added directly inside opted-out open shadow hosts', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph for translation.</p><protected-card translate="no" /></main>'
    const host = document.querySelector('protected-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    shadowRoot.appendChild(
      document.createTextNode('Protected shadow loose text from client side rendering.'),
    )

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(shadowRoot.querySelector('.native-translate-wrapped-segment')).toBeNull()
    expect(shadowRoot).toHaveTextContent('Protected shadow loose text from client side rendering.')
  })

  it('refreshes stale translation when an already translated block changes text', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing paragraph')
    paragraph.firstChild.textContent = 'Updated paragraph after client side refresh.'

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Updated paragraph after client side refresh.',
      )
    })
    expect(paragraph.querySelectorAll('.native-translate-translation')).toHaveLength(1)
  })

  it('translates the latest block text when source text changes while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const initialTranslation = createDeferred<string>()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) =>
          text === 'Initial paragraph for translation.'
            ? initialTranslation.promise
            : `translated: ${text}`,
      })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalled()
    })
    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing pending paragraph')
    paragraph.firstChild.textContent = 'Updated paragraph during client hydration.'
    initialTranslation.resolve('translated: Initial paragraph for translation.')
    await translationPromise

    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Updated paragraph during client hydration.',
    )
    expect(paragraph.querySelectorAll('.native-translate-translation')).toHaveLength(1)
    expect(paragraph).toHaveAttribute('data-native-translate-done', '1')
  })

  it('uses the latest block source language when text changes while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const pendingTranslation = createDeferred<string>()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (text: string) => [
          {
            confidence: 0.9,
            detectedLanguage: text.startsWith('Texto ') ? 'es' : 'en',
          },
        ],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            text === 'Initial paragraph for translation.'
              ? pendingTranslation.promise
              : `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'zh-CN' }),
      )
    })
    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing pending paragraph')
    paragraph.firstChild.textContent = 'Texto actualizado despues de hidratar la pagina.'
    pendingTranslation.resolve('en->zh-CN: Initial paragraph for translation.')
    await translationPromise

    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'es->zh-CN: Texto actualizado despues de hidratar la pagina.',
    )
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'es', targetLanguage: 'zh-CN' }),
    )
  })

  it('translates the latest long block text when source text changes while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    const initialText = 'Initial long paragraph for translation. '.repeat(20)
    const updatedText = 'Updated long paragraph during client hydration. '.repeat(20)
    document.body.innerHTML = `<main><p>${initialText}</p></main>`

    const testables = await loadContentScriptTestables()
    const initialTranslation = createDeferred<string>()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) =>
          text === initialText.trim() ? initialTranslation.promise : `translated: ${text}`,
      })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(document.querySelector('.native-translate-translation')).toBeTruthy()
    })
    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing pending long paragraph')
    paragraph.firstChild.textContent = updatedText
    initialTranslation.resolve(`translated: ${initialText.trim()}`)
    await translationPromise

    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      `translated: ${updatedText.trim()}`,
    )
    expect(paragraph.querySelectorAll('.native-translate-translation')).toHaveLength(1)
    expect(paragraph).toHaveAttribute('data-native-translate-done', '1')
  })

  it('removes stale streaming partials when long block text changes while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    const initialText = 'Initial streaming paragraph for translation. '.repeat(20)
    const updatedText = 'Updated streaming paragraph during client hydration. '.repeat(20)
    document.body.innerHTML = `<main><p>${initialText}</p></main>`

    const testables = await loadContentScriptTestables()
    const continueInitialStream = createDeferred<void>()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
        translateStreaming: async function* (text: string) {
          if (text === initialText.trim()) {
            yield `stale partial: ${text.slice(0, 32)}`
            await continueInitialStream.promise
            yield ' stale final'
            return
          }
          yield `translated: ${text}`
        },
      })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
        'stale partial:',
      )
    })
    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing streaming paragraph')

    try {
      paragraph.firstChild.textContent = updatedText
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    } finally {
      continueInitialStream.resolve()
      await translationPromise
    }

    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      `translated: ${updatedText.trim()}`,
    )
  })

  it('removes streaming partials when a long block becomes hidden while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    const initialText = 'Initial streaming paragraph that becomes hidden. '.repeat(20)
    document.body.innerHTML = `<main><p>${initialText}</p></main>`

    const testables = await loadContentScriptTestables()
    const continueInitialStream = createDeferred<void>()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
        translateStreaming: async function* (text: string) {
          yield `stale partial: ${text.slice(0, 32)}`
          await continueInitialStream.promise
          yield ' stale final'
        },
      })),
    })

    const translationPromise = testables.translateFullPageAutoDetect('zh')

    await waitFor(() => {
      expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
        'stale partial:',
      )
    })
    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing pending hidden paragraph')

    try {
      paragraph.setAttribute('hidden', '')
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    } finally {
      continueInitialStream.resolve()
      await translationPromise
    }

    expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('refreshes the translated parent block when nested inline text changes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph with <span>inline detail</span> for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    const inline = document.querySelector('p span')
    if (!paragraph || !inline || !inline.firstChild) throw new Error('Missing inline paragraph')
    inline.firstChild.textContent = 'updated inline detail'

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Initial paragraph with updated inline detail for translation.',
      )
    })
    expect(paragraph.querySelectorAll('.native-translate-translation')).toHaveLength(1)
    expect(inline).not.toHaveAttribute('data-native-translate-done')
  })

  it('refreshes a translated parent block once when multiple nested inline nodes change together', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial <span>first detail</span> and <span>second detail</span> for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')
    translate.mockClear()

    const paragraph = document.querySelector('p')
    const [firstInline, secondInline] = Array.from(document.querySelectorAll('p span'))
    if (!paragraph || !firstInline?.firstChild || !secondInline?.firstChild) {
      throw new Error('Missing inline paragraph')
    }

    firstInline.firstChild.textContent = 'updated first detail'
    secondInline.firstChild.textContent = 'updated second detail'

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Initial updated first detail and updated second detail for translation.',
      )
    })
    expect(paragraph.querySelectorAll('.native-translate-translation')).toHaveLength(1)
    expect(firstInline).not.toHaveAttribute('data-native-translate-done')
    expect(secondInline).not.toHaveAttribute('data-native-translate-done')
    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate).toHaveBeenCalledWith(
      'Initial [[NT0_S]]updated first detail[[NT0_E]] and [[NT1_S]]updated second detail[[NT1_E]] for translation.',
    )
  })

  it('refreshes the translated parent block when a nested inline node is removed', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Initial paragraph with <span>removable inline detail</span> for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    const inline = document.querySelector('p span')
    if (!paragraph || !inline) throw new Error('Missing removable inline paragraph')
    inline.remove()

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Initial paragraph with for translation.',
      )
    })
    expect(paragraph.querySelectorAll('.native-translate-translation')).toHaveLength(1)
  })

  it('refreshes the translated parent block when a nested inline node is inserted', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')
    translate.mockClear()

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    const inline = document.createElement('span')
    inline.textContent = 'inserted inline detail'
    paragraph.append(document.createTextNode(' '), inline)

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Initial paragraph for translation. inserted inline detail',
      )
    })
    expect(paragraph.querySelectorAll('.native-translate-translation')).toHaveLength(1)
    expect(inline).not.toHaveAttribute('data-native-translate-done')
    expect(translate).toHaveBeenCalledWith(
      'Initial paragraph for translation. [[NT0_S]]inserted inline detail[[NT0_E]]',
    )
  })

  it('removes stale adjacent translations when dynamic inline text changes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const inline = document.createElement('span')
    inline.textContent = 'Dynamic inline chip text for translation.'
    main.appendChild(inline)

    await waitFor(() => {
      expect(inline.nextElementSibling).toHaveTextContent(
        'translated: Dynamic inline chip text for translation.',
      )
    })

    if (!inline.firstChild) throw new Error('Missing inline text')
    inline.firstChild.textContent = 'Updated inline chip text after client refresh.'

    await waitFor(() => {
      expect(inline.nextElementSibling).toHaveTextContent(
        'translated: Updated inline chip text after client refresh.',
      )
    })
    expect(main.querySelectorAll('.native-translate-translation')).toHaveLength(2)
  })

  it('keeps dynamic translations when a child root is queued before its ancestor', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Queued child paragraph should keep its translation.'
    main.appendChild(laterParagraph)
    main.className = 'hydrated-render-pass'

    await waitFor(() => {
      expect(laterParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Queued child paragraph should keep its translation.',
      )
    })
  })

  it('removes adjacent translation siblings when dynamic inline source text is removed', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const inline = document.createElement('span')
    inline.textContent = 'Temporary inline chip text for translation.'
    main.appendChild(inline)

    await waitFor(() => {
      expect(inline.nextElementSibling).toHaveTextContent(
        'translated: Temporary inline chip text for translation.',
      )
    })

    inline.remove()

    await waitFor(() => {
      expect(main).not.toHaveTextContent('translated: Temporary inline chip text for translation.')
    })
    expect(main.querySelectorAll('.native-translate-translation')).toHaveLength(1)
  })

  it('removes adjacent translations after whitespace when dynamic inline source text is removed', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const inline = document.createElement('span')
    inline.textContent = 'Temporary inline chip separated by whitespace.'
    main.append(inline, document.createTextNode('   '))

    await waitFor(() => {
      expect(inline.nextElementSibling).toHaveTextContent(
        'translated: Temporary inline chip separated by whitespace.',
      )
    })

    inline.remove()

    await waitFor(() => {
      expect(main).not.toHaveTextContent(
        'translated: Temporary inline chip separated by whitespace.',
      )
    })
    expect(main.querySelectorAll('.native-translate-translation')).toHaveLength(1)
  })

  it('removes adjacent translations after inserted whitespace when dynamic inline source text is removed', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const inline = document.createElement('span')
    inline.textContent = 'Temporary inline chip with inserted whitespace.'
    main.appendChild(inline)

    await waitFor(() => {
      expect(inline.nextElementSibling).toHaveTextContent(
        'translated: Temporary inline chip with inserted whitespace.',
      )
    })

    const translation = inline.nextElementSibling
    if (!translation) throw new Error('Missing inline translation')
    main.insertBefore(document.createTextNode('   '), translation)
    inline.remove()

    await waitFor(() => {
      expect(main).not.toHaveTextContent(
        'translated: Temporary inline chip with inserted whitespace.',
      )
    })
    expect(main.querySelectorAll('.native-translate-translation')).toHaveLength(1)
  })

  it('removes adjacent translation siblings when dynamic shadow inline source text is removed', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p><news-card /></main>'
    const host = document.querySelector('news-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const inline = document.createElement('span')
    inline.textContent = 'Temporary shadow inline chip text for translation.'
    shadowRoot.appendChild(inline)

    await waitFor(() => {
      expect(inline.nextElementSibling).toHaveTextContent(
        'translated: Temporary shadow inline chip text for translation.',
      )
    })

    inline.remove()

    await waitFor(() => {
      expect(shadowRoot).not.toHaveTextContent(
        'translated: Temporary shadow inline chip text for translation.',
      )
    })
    expect(shadowRoot.querySelector('.native-translate-translation')).toBeNull()
  })

  it('removes stale skeleton placeholders before refreshing dynamic translations', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing paragraph')
    const staleSkeleton = document.createElement('div')
    staleSkeleton.className = 'native-translate-skeleton'
    staleSkeleton.textContent = 'Loading stale translation'
    paragraph.appendChild(staleSkeleton)

    paragraph.firstChild.textContent = 'Updated paragraph after client side refresh.'

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Updated paragraph after client side refresh.',
      )
    })
    expect(paragraph.querySelector('.native-translate-skeleton')).toBeNull()
  })

  it('removes stale translations when a translated block becomes hidden dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Initial paragraph for translation.',
    )

    paragraph.setAttribute('hidden', '')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('removes stale translations when a translated block becomes a closed popover dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><section><p>Popover body should be cleared after becoming hidden.</p></section></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const section = document.querySelector('section')
    const paragraph = document.querySelector('section p')
    if (!section || !paragraph) throw new Error('Missing popover candidate')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Popover body should be cleared after becoming hidden.',
    )

    section.setAttribute('popover', '')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('translates closed popover content after showPopover opens it dynamically', async () => {
    const openedPopovers = new WeakSet<Element>()
    const originalMatches = Element.prototype.matches
    const originalShowPopover = HTMLElement.prototype.showPopover
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ':popover-open') return openedPopovers.has(this)
      return originalMatches.call(this, selector)
    })
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value(this: HTMLElement) {
        openedPopovers.add(this)
      },
    })

    try {
      document.documentElement.setAttribute('lang', 'en')
      document.body.innerHTML =
        '<main><section popover><p>Popover panel should translate after opening.</p></section></main>'

      const testables = await loadContentScriptTestables()
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(async () => ({
          translate: async (text: string) => `translated: ${text}`,
        })),
      })

      await testables.translateFullPageAutoDetect('zh')

      const section = document.querySelector('section')
      const paragraph = document.querySelector('section p')
      if (!section || !paragraph) throw new Error('Missing popover candidate')
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()

      section.showPopover()

      await waitFor(() => {
        expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
          'translated: Popover panel should translate after opening.',
        )
      })
    } finally {
      if (originalShowPopover) {
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
          configurable: true,
          value: originalShowPopover,
        })
      } else {
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
          configurable: true,
          value: undefined,
        })
      }
    }
  })

  it('removes stale popover translations after hidePopover closes it dynamically', async () => {
    const openedPopovers = new WeakSet<Element>()
    const originalMatches = Element.prototype.matches
    const originalShowPopover = HTMLElement.prototype.showPopover
    const originalHidePopover = HTMLElement.prototype.hidePopover
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ':popover-open') return openedPopovers.has(this)
      return originalMatches.call(this, selector)
    })
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value(this: HTMLElement) {
        openedPopovers.add(this)
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
      configurable: true,
      value(this: HTMLElement) {
        openedPopovers.delete(this)
      },
    })

    try {
      document.documentElement.setAttribute('lang', 'en')
      document.body.innerHTML =
        '<main><section popover><p>Popover panel should clear after closing.</p></section></main>'

      const testables = await loadContentScriptTestables()
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(async () => ({
          translate: async (text: string) => `translated: ${text}`,
        })),
      })

      await testables.translateFullPageAutoDetect('zh')

      const section = document.querySelector('section')
      const paragraph = document.querySelector('section p')
      if (!section || !paragraph) throw new Error('Missing popover candidate')

      section.showPopover()
      await waitFor(() => {
        expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
          'translated: Popover panel should clear after closing.',
        )
      })

      section.hidePopover()

      await waitFor(() => {
        expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
      })
      expect(paragraph).not.toHaveAttribute('data-native-translate-done')
    } finally {
      if (originalShowPopover) {
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
          configurable: true,
          value: originalShowPopover,
        })
      } else {
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
          configurable: true,
          value: undefined,
        })
      }
      if (originalHidePopover) {
        Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
          configurable: true,
          value: originalHidePopover,
        })
      } else {
        Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
          configurable: true,
          value: undefined,
        })
      }
    }
  })

  it('translates and clears popover content when togglePopover changes visibility', async () => {
    const openedPopovers = new WeakSet<Element>()
    const originalMatches = Element.prototype.matches
    const originalTogglePopover = HTMLElement.prototype.togglePopover
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ':popover-open') return openedPopovers.has(this)
      return originalMatches.call(this, selector)
    })
    Object.defineProperty(HTMLElement.prototype, 'togglePopover', {
      configurable: true,
      value(this: HTMLElement, force?: boolean) {
        const shouldOpen = force ?? !openedPopovers.has(this)
        if (shouldOpen) {
          openedPopovers.add(this)
        } else {
          openedPopovers.delete(this)
        }
        return shouldOpen
      },
    })

    try {
      document.documentElement.setAttribute('lang', 'en')
      document.body.innerHTML =
        '<main><section popover><p>Toggle popover panel should track visibility.</p></section></main>'

      const testables = await loadContentScriptTestables()
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(async () => ({
          translate: async (text: string) => `translated: ${text}`,
        })),
      })

      await testables.translateFullPageAutoDetect('zh')

      const section = document.querySelector('section')
      const paragraph = document.querySelector('section p')
      if (!section || !paragraph) throw new Error('Missing popover candidate')

      section.togglePopover()
      await waitFor(() => {
        expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
          'translated: Toggle popover panel should track visibility.',
        )
      })

      section.togglePopover()

      await waitFor(() => {
        expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
      })
      expect(paragraph).not.toHaveAttribute('data-native-translate-done')
    } finally {
      if (originalTogglePopover) {
        Object.defineProperty(HTMLElement.prototype, 'togglePopover', {
          configurable: true,
          value: originalTogglePopover,
        })
      } else {
        Object.defineProperty(HTMLElement.prototype, 'togglePopover', {
          configurable: true,
          value: undefined,
        })
      }
    }
  })

  it('restores patched popover methods when the full page observer stops', async () => {
    const originalShowPopover = HTMLElement.prototype.showPopover
    const originalHidePopover = HTMLElement.prototype.hidePopover
    const originalTogglePopover = HTMLElement.prototype.togglePopover
    const showPopover = vi.fn(function (this: HTMLElement) {
      return this
    })
    const hidePopover = vi.fn(function (this: HTMLElement) {
      return this
    })
    const togglePopover = vi.fn(function (this: HTMLElement) {
      return true
    })

    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: showPopover,
    })
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
      configurable: true,
      value: hidePopover,
    })
    Object.defineProperty(HTMLElement.prototype, 'togglePopover', {
      configurable: true,
      value: togglePopover,
    })

    try {
      document.documentElement.setAttribute('lang', 'en')
      document.body.innerHTML = '<main><p>Observer lifecycle paragraph for translation.</p></main>'

      const testables = await loadContentScriptTestables()
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(async () => ({
          translate: async (text: string) => `translated: ${text}`,
        })),
      })

      await testables.translateFullPageAutoDetect('zh')

      expect(HTMLElement.prototype.showPopover).not.toBe(showPopover)
      expect(HTMLElement.prototype.hidePopover).not.toBe(hidePopover)
      expect(HTMLElement.prototype.togglePopover).not.toBe(togglePopover)

      testables.stopFullPageTranslationObserver()

      expect(HTMLElement.prototype.showPopover).toBe(showPopover)
      expect(HTMLElement.prototype.hidePopover).toBe(hidePopover)
      expect(HTMLElement.prototype.togglePopover).toBe(togglePopover)
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'showPopover', {
        configurable: true,
        value: originalShowPopover,
      })
      Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
        configurable: true,
        value: originalHidePopover,
      })
      Object.defineProperty(HTMLElement.prototype, 'togglePopover', {
        configurable: true,
        value: originalTogglePopover,
      })
    }
  })

  it('restores the patched input value setter when the full page observer stops', async () => {
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )
    if (!originalValueDescriptor) throw new Error('Missing input value descriptor')

    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Observer lifecycle paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const patchedValueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )
    expect(patchedValueDescriptor?.set).not.toBe(originalValueDescriptor.set)

    testables.stopFullPageTranslationObserver()

    expect(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')).toEqual(
      originalValueDescriptor,
    )
  })

  it('restores the patched textarea value setter when the full page observer stops', async () => {
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )
    if (!originalValueDescriptor) throw new Error('Missing textarea value descriptor')

    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Observer lifecycle paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const patchedValueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )
    expect(patchedValueDescriptor?.set).not.toBe(originalValueDescriptor.set)

    testables.stopFullPageTranslationObserver()

    expect(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')).toEqual(
      originalValueDescriptor,
    )
  })

  it('removes stale translations when a translated block becomes editable dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Editable paragraph after client side mode switch.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Editable paragraph after client side mode switch.',
    )

    paragraph.setAttribute('contenteditable', 'true')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('translates a block when contenteditable is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p contenteditable="true">Editable paragraph can become readable content later.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing editable paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toBeNull()

    paragraph.removeAttribute('contenteditable')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Editable paragraph can become readable content later.',
      )
    })
  })

  it('does not refresh translations for style changes unrelated to visibility', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(translate).toHaveBeenCalledTimes(1)
    const initialTranslation = paragraph.querySelector('.native-translate-translation')
    expect(initialTranslation).toHaveTextContent('translated: Initial paragraph for translation.')

    paragraph.setAttribute('style', 'color: rgb(255, 0, 0)')
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.querySelector('.native-translate-translation')).toBe(initialTranslation)
  })

  it('does not refresh translations for class changes unrelated to visibility or opt-out state', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(translate).toHaveBeenCalledTimes(1)
    const initialTranslation = paragraph.querySelector('.native-translate-translation')
    expect(initialTranslation).toHaveTextContent('translated: Initial paragraph for translation.')

    paragraph.className = 'hydrated render-pass'
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.querySelector('.native-translate-translation')).toBe(initialTranslation)
  })

  it('does not refresh translations for non-interactive role changes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(translate).toHaveBeenCalledTimes(1)
    const initialTranslation = paragraph.querySelector('.native-translate-translation')
    expect(initialTranslation).toHaveTextContent('translated: Initial paragraph for translation.')

    paragraph.setAttribute('role', 'presentation')
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.querySelector('.native-translate-translation')).toBe(initialTranslation)
  })

  it('refreshes a translated wrapper when ARIA article paragraph roles are added dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p id="article"><span>First hydrated paragraph should become its own translation unit.</span><span>Second hydrated paragraph should also be translated separately.</span></p></main>'

    const article = document.querySelector('#article')
    const paragraphs = Array.from(article?.querySelectorAll('span') ?? [])
    if (!article || paragraphs.length !== 2) throw new Error('Missing hydrated article content')

    const testables = await loadContentScriptTestables()
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(translate).toHaveBeenCalledTimes(1)
    expect(article.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: First hydrated paragraph should become its own translation unit.Second hydrated paragraph should also be translated separately.',
    )

    article.setAttribute('role', 'article')
    paragraphs[0]?.setAttribute('role', 'paragraph')
    paragraphs[1]?.setAttribute('role', 'paragraph')

    await waitFor(() => {
      expect(translate).toHaveBeenCalledTimes(3)
    })
    expect(article).not.toHaveAttribute('data-native-translate-done')
    expect(
      paragraphs.map((paragraph) =>
        paragraph.nextElementSibling?.classList.contains('native-translate-translation')
          ? paragraph.nextElementSibling.textContent
          : undefined,
      ),
    ).toEqual([
      'translated: First hydrated paragraph should become its own translation unit.',
      'translated: Second hydrated paragraph should also be translated separately.',
    ])
  })

  it('removes stale translations when a translated block becomes an interactive role dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Initial paragraph for translation.',
    )

    paragraph.setAttribute('role', 'button')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('removes child translations when a parent becomes an ARIA toolbar dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <section>
          <p>Translated child paragraph should be cleared after parent becomes toolbar.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const toolbarCandidate = document.querySelector('section')
    const childParagraph = document.querySelector('section p')
    if (!toolbarCandidate || !childParagraph) throw new Error('Missing toolbar candidate')
    expect(childParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Translated child paragraph should be cleared after parent becomes toolbar.',
    )

    toolbarCandidate.setAttribute('role', 'toolbar')

    await waitFor(() => {
      expect(childParagraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(childParagraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('removes child translations when a parent becomes an ARIA navigation landmark dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <section>
          <p>Translated child paragraph should be cleared after parent becomes navigation.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const landmarkCandidate = document.querySelector('section')
    const childParagraph = document.querySelector('section p')
    if (!landmarkCandidate || !childParagraph) throw new Error('Missing landmark candidate')
    expect(childParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Translated child paragraph should be cleared after parent becomes navigation.',
    )

    landmarkCandidate.setAttribute('role', 'navigation')

    await waitFor(() => {
      expect(childParagraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(childParagraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('translates a short dynamic block when it becomes an ARIA heading', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <div id="candidate">AI</div>
        <p>Existing paragraph starts full page observation.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const candidate = document.querySelector('#candidate')
    if (!candidate) throw new Error('Missing heading candidate')
    expect(candidate.querySelector('.native-translate-translation')).toBeNull()

    candidate.setAttribute('role', 'heading')

    await waitFor(() => {
      expect(candidate.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: AI',
      )
    })
  })

  it('removes a short ARIA heading translation when heading role is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <div id="candidate" role="heading">AI</div>
        <p>Existing paragraph keeps full page observation active.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const candidate = document.querySelector('#candidate')
    if (!candidate) throw new Error('Missing heading candidate')
    expect(candidate.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: AI',
    )

    candidate.removeAttribute('role')

    await waitFor(() => {
      expect(candidate.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(candidate).not.toHaveAttribute('data-native-translate-done')
  })

  it('does not refresh translations when aria-live is set to off', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(translate).toHaveBeenCalledTimes(1)
    const initialTranslation = paragraph.querySelector('.native-translate-translation')
    expect(initialTranslation).toHaveTextContent('translated: Initial paragraph for translation.')

    paragraph.setAttribute('aria-live', 'off')
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.querySelector('.native-translate-translation')).toBe(initialTranslation)
  })

  it('translates a dynamic block when aria-live changes to off', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p aria-live="polite">Live region copy can become static content later.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing aria-live paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toBeNull()

    paragraph.setAttribute('aria-live', 'off')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Live region copy can become static content later.',
      )
    })
  })

  it('does not refresh translations when aria-hidden is set to false', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(translate).toHaveBeenCalledTimes(1)
    const initialTranslation = paragraph.querySelector('.native-translate-translation')
    expect(initialTranslation).toHaveTextContent('translated: Initial paragraph for translation.')

    paragraph.setAttribute('aria-hidden', 'false')
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.querySelector('.native-translate-translation')).toBe(initialTranslation)
  })

  it('translates a dynamic block when aria-hidden changes to false', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p aria-hidden="true">Aria hidden paragraph can become visible later.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing aria-hidden paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toBeNull()

    paragraph.setAttribute('aria-hidden', 'false')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Aria hidden paragraph can become visible later.',
      )
    })
  })

  it('removes stale translations when inline visibility style changes dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Initial paragraph for translation.',
    )

    paragraph.setAttribute('style', 'visibility: hidden')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('removes stale translations when inline clipping style hides content dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Paragraph can become visually hidden later.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Paragraph can become visually hidden later.',
    )

    paragraph.setAttribute('style', 'clip-path: inset(50%)')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('removes stale translations when a screen-reader-only class hides content dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = '<main><p>Paragraph can become screen reader only later.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Paragraph can become screen reader only later.',
    )

    paragraph.className = 'sr-only'

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('removes stale translations when a visually-hidden class hides content dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><p>Paragraph can become visually hidden by class later.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Paragraph can become visually hidden by class later.',
    )

    paragraph.className = 'visually-hidden'

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('translates a block when inline visibility style is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p style="visibility: hidden">Initially hidden paragraph can become visible later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const hiddenParagraph = document.querySelector('p[style]')
    if (!hiddenParagraph) throw new Error('Missing hidden paragraph')
    expect(hiddenParagraph.querySelector('.native-translate-translation')).toBeNull()

    hiddenParagraph.removeAttribute('style')

    await waitFor(() => {
      expect(hiddenParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Initially hidden paragraph can become visible later.',
      )
    })
  })

  it('translates a block when inline clipping style is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p style="clip-path: inset(50%)">Clipped paragraph can become visible later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const hiddenParagraph = document.querySelector('p[style]')
    if (!hiddenParagraph) throw new Error('Missing clipped paragraph')
    expect(hiddenParagraph.querySelector('.native-translate-translation')).toBeNull()

    hiddenParagraph.removeAttribute('style')

    await waitFor(() => {
      expect(hiddenParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Clipped paragraph can become visible later.',
      )
    })
  })

  it('translates a block when a screen-reader-only class is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.sr-only { clip-path: inset(50%); }</style>'
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p class="sr-only">Screen reader only paragraph can become visible later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const hiddenParagraph = document.querySelector('p.sr-only')
    if (!hiddenParagraph) throw new Error('Missing clipped paragraph')
    expect(hiddenParagraph.querySelector('.native-translate-translation')).toBeNull()

    hiddenParagraph.removeAttribute('class')

    await waitFor(() => {
      expect(hiddenParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Screen reader only paragraph can become visible later.',
      )
    })
  })

  it('translates a block when a screen-reader-only alias class is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p class="screen-reader-only">Screen reader alias paragraph can become visible later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const hiddenParagraph = document.querySelector('p.screen-reader-only')
    if (!hiddenParagraph) throw new Error('Missing screen reader only paragraph')
    expect(hiddenParagraph.querySelector('.native-translate-translation')).toBeNull()

    hiddenParagraph.removeAttribute('class')

    await waitFor(() => {
      expect(hiddenParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Screen reader alias paragraph can become visible later.',
      )
    })
  })

  it('translates child blocks when a hidden container becomes display contents dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <section style="display: none">
          <p>Display contents child can become visible later.</p>
        </section>
      </main>
    `

    const section = document.querySelector('section')
    if (!(section instanceof HTMLElement)) throw new Error('Missing hidden section')
    section.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => undefined,
    }))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const childParagraph = section.querySelector('p')
    if (!childParagraph) throw new Error('Missing display contents child')
    expect(childParagraph.querySelector('.native-translate-translation')).toBeNull()

    section.setAttribute('style', 'display: contents')

    await waitFor(() => {
      expect(childParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Display contents child can become visible later.',
      )
    })
  })

  it('translates a block when the hidden attribute is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p hidden>Hidden attribute paragraph can become visible later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const hiddenParagraph = document.querySelector('p[hidden]')
    if (!hiddenParagraph) throw new Error('Missing hidden paragraph')
    expect(hiddenParagraph.querySelector('.native-translate-translation')).toBeNull()

    hiddenParagraph.removeAttribute('hidden')

    await waitFor(() => {
      expect(hiddenParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Hidden attribute paragraph can become visible later.',
      )
    })
  })

  it('translates a block when an arbitrary CSS-hidden class is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.collapsed-copy { display: none; }</style>'
    document.body.innerHTML = `
      <main>
        <p class="collapsed-copy">Class-hidden paragraph can become visible later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const hiddenParagraph = document.querySelector('p')
    if (!hiddenParagraph) throw new Error('Missing class-hidden paragraph')
    expect(hiddenParagraph.querySelector('.native-translate-translation')).toBeNull()

    hiddenParagraph.removeAttribute('class')

    await waitFor(() => {
      expect(hiddenParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Class-hidden paragraph can become visible later.',
      )
    })
  })

  it('translates child blocks when an arbitrary CSS-hidden parent class is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.collapsed-panel { display: none; }</style>'
    document.body.innerHTML = `
      <main>
        <section class="collapsed-panel">
          <p>Nested paragraph inside a class-hidden panel can become visible later.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const panel = document.querySelector('section')
    const nestedParagraph = document.querySelector('section p')
    if (!panel || !nestedParagraph) throw new Error('Missing class-hidden panel')
    expect(nestedParagraph.querySelector('.native-translate-translation')).toBeNull()

    panel.removeAttribute('class')

    await waitFor(() => {
      expect(nestedParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Nested paragraph inside a class-hidden panel can become visible later.',
      )
    })
  })

  it('translates a dynamic block when translate-no changes to translate-yes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p translate="no">Protected paragraph can become translatable later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const protectedParagraph = document.querySelector('p[translate="no"]')
    if (!protectedParagraph) throw new Error('Missing protected paragraph')
    expect(protectedParagraph.querySelector('.native-translate-translation')).toBeNull()

    protectedParagraph.setAttribute('translate', 'yes')

    await waitFor(() => {
      expect(protectedParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Protected paragraph can become translatable later.',
      )
    })
  })

  it('translates a dynamic block when translate-no is removed', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p translate="no">Protected paragraph can become readable after opt-out removal.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const protectedParagraph = document.querySelector('p[translate="no"]')
    if (!protectedParagraph) throw new Error('Missing protected paragraph')
    expect(protectedParagraph.querySelector('.native-translate-translation')).toBeNull()

    protectedParagraph.removeAttribute('translate')

    await waitFor(() => {
      expect(protectedParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Protected paragraph can become readable after opt-out removal.',
      )
    })
  })

  it('translates a dynamic block when data-no-translate is removed', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p data-no-translate>Data protected paragraph can become translatable later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const protectedParagraph = document.querySelector('p[data-no-translate]')
    if (!protectedParagraph) throw new Error('Missing data protected paragraph')
    expect(protectedParagraph.querySelector('.native-translate-translation')).toBeNull()

    protectedParagraph.removeAttribute('data-no-translate')

    await waitFor(() => {
      expect(protectedParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Data protected paragraph can become translatable later.',
      )
    })
  })

  it('translates a dynamic block when data-notranslate is removed', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p data-notranslate>Data notranslate paragraph can become translatable later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const protectedParagraph = document.querySelector('p[data-notranslate]')
    if (!protectedParagraph) throw new Error('Missing data-notranslate paragraph')
    expect(protectedParagraph.querySelector('.native-translate-translation')).toBeNull()

    protectedParagraph.removeAttribute('data-notranslate')

    await waitFor(() => {
      expect(protectedParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Data notranslate paragraph can become translatable later.',
      )
    })
  })

  it('translates child blocks when a notranslate class is removed dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <section class="notranslate">
          <p>Class protected paragraph can become translatable later.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const protectedSection = document.querySelector('section.notranslate')
    const protectedParagraph = document.querySelector('section.notranslate p')
    if (!protectedSection || !protectedParagraph) throw new Error('Missing class protected block')
    expect(protectedParagraph.querySelector('.native-translate-translation')).toBeNull()

    protectedSection.removeAttribute('class')

    await waitFor(() => {
      expect(protectedParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Class protected paragraph can become translatable later.',
      )
    })
  })

  it('removes child translations when a parent becomes notranslate dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <section>
          <p>Translated child paragraph should be cleared after parent opt-out.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const protectedSection = document.querySelector('section')
    const childParagraph = document.querySelector('section p')
    if (!protectedSection || !childParagraph) throw new Error('Missing opt-out candidate')
    expect(childParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Translated child paragraph should be cleared after parent opt-out.',
    )

    protectedSection.className = 'notranslate'

    await waitFor(() => {
      expect(childParagraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(childParagraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('removes child translations when a parent becomes hidden by an arbitrary CSS class', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.head.innerHTML = '<style>.collapsed-panel { display: none; }</style>'
    document.body.innerHTML = `
      <main>
        <section>
          <p>Translated child paragraph should be cleared after parent collapses.</p>
        </section>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const panel = document.querySelector('section')
    const childParagraph = document.querySelector('section p')
    if (!panel || !childParagraph) throw new Error('Missing collapsible panel')
    expect(childParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
      'translated: Translated child paragraph should be cleared after parent collapses.',
    )

    panel.className = 'collapsed-panel'

    await waitFor(() => {
      expect(childParagraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(childParagraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('translates a dynamic block when data-translate-no changes to yes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <p data-translate="no">Data translate protected paragraph can become translatable later.</p>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const protectedParagraph = document.querySelector('p[data-translate="no"]')
    if (!protectedParagraph) throw new Error('Missing data-translate protected paragraph')
    expect(protectedParagraph.querySelector('.native-translate-translation')).toBeNull()

    protectedParagraph.setAttribute('data-translate', 'yes')

    await waitFor(() => {
      expect(protectedParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Data translate protected paragraph can become translatable later.',
      )
    })
  })

  it('refreshes stale translation inside open shadow roots when translated text changes', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial paragraph for translation.</p><news-card /></main>'
    const host = document.querySelector('news-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = '<article><p>Initial shadow paragraph for translation.</p></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const paragraph = shadowRoot.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing shadow paragraph')
    paragraph.firstChild.textContent = 'Updated shadow paragraph after client side refresh.'

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Updated shadow paragraph after client side refresh.',
      )
    })
    expect(paragraph.querySelectorAll('.native-translate-translation')).toHaveLength(1)
  })

  it('refreshes translated SVG metadata when chart text changes dynamically', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Initial paragraph for translation.</p>
        <svg role="img" width="120" height="60">
          <title>Initial revenue chart title</title>
          <desc>Initial revenue chart description text</desc>
        </svg>
      </main>
    `
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 120,
      bottom: 60,
      width: 120,
      height: 60,
      toJSON: () => undefined,
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    const title = document.querySelector('svg title')
    const description = document.querySelector('svg desc')
    if (!title || !description) throw new Error('Missing SVG metadata')

    title.textContent = 'Updated revenue chart title'
    description.textContent = 'Updated revenue chart description text'

    await waitFor(() => {
      expect(title).toHaveTextContent('translated: Updated revenue chart title')
      expect(description).toHaveTextContent('translated: Updated revenue chart description text')
    })
    expect(title).not.toHaveTextContent('translated: translated:')
    expect(description).not.toHaveTextContent('translated: translated:')
  })

  it('clears previous full page translations when the active page language already matches target', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Paragraph that was previously translated.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')
    expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
      'zh-CN: Paragraph that was previously translated.',
    )

    document.documentElement.setAttribute('lang', 'zh')
    await testables.translateFullPageAutoDetect('zh')

    expect(document.querySelector('.native-translate-translation')).toBeNull()
    expect(document.querySelector('p')).not.toHaveAttribute('data-native-translate-done')
  })

  it('translates between Traditional and Simplified Chinese variants', async () => {
    document.documentElement.setAttribute('lang', 'zh-TW')
    document.body.innerHTML = '<main><p>繁體中文段落應該翻譯成簡體中文。</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh-CN')

    expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
      'zh-CN: 繁體中文段落應該翻譯成簡體中文。',
    )
  })

  it('uses page Chinese variant hints when language detection returns generic zh', async () => {
    document.documentElement.setAttribute('lang', 'zh-TW')
    document.body.innerHTML = '<main><p>繁體 中文 偵測 結果 可能 只有 泛化 語言碼。</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async () => [{ confidence: 0.9, detectedLanguage: 'zh' }],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh-CN')

    expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
      'zh-CN: 繁體 中文 偵測 結果 可能 只有 泛化 語言碼。',
    )
  })

  it('uses page Chinese variant hints with underscore language tags', async () => {
    document.documentElement.setAttribute('lang', 'zh_Hant')
    document.body.innerHTML = '<main><p>繁體 中文 下劃線 語言 標籤 也 應該 翻譯。</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async () => [{ confidence: 0.9, detectedLanguage: 'zh' }],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh-CN')

    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'zh-TW',
        targetLanguage: 'zh-CN',
      }),
    )
    expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
      'zh-CN: 繁體 中文 下劃線 語言 標籤 也 應該 翻譯。',
    )
  })

  it('canonicalizes underscore html language fallbacks before creating translators', async () => {
    document.documentElement.setAttribute('lang', 'zh_Hant')
    document.body.innerHTML = '<main><p>繁體中文短句。</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh-CN')

    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'zh-TW',
        targetLanguage: 'zh-CN',
      }),
    )
  })

  it('canonicalizes full page target language before creating translators', async () => {
    document.documentElement.setAttribute('lang', 'zh-CN')
    document.body.innerHTML = '<main><p>简体中文页面应该能翻成繁体。</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh_Hant')

    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'zh-CN',
        targetLanguage: 'zh-TW',
      }),
    )
    expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
      'zh-TW: 简体中文页面应该能翻成繁体。',
    )
  })

  it('canonicalizes underscore html language fallbacks for warm translator requests', async () => {
    document.documentElement.setAttribute('lang', 'zh_Hant')

    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => text,
      })),
    })

    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0]
    if (!listener) throw new Error('Missing warm translator listener')
    listener(
      {
        payload: {
          sourceLanguage: 'auto',
          targetLanguage: 'zh-CN',
        },
        type: 'NATIVE_TRANSLATE_WARM_TRANSLATOR',
      },
      {},
      vi.fn(),
    )

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguage: 'zh-TW',
          targetLanguage: 'zh-CN',
        }),
      )
    })
  })

  it('canonicalizes warm translator target language before creating translators', async () => {
    document.documentElement.setAttribute('lang', 'zh-CN')

    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => text,
      })),
    })

    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0]
    if (!listener) throw new Error('Missing warm translator listener')
    listener(
      {
        payload: {
          sourceLanguage: 'auto',
          targetLanguage: 'zh_Hant',
        },
        type: 'NATIVE_TRANSLATE_WARM_TRANSLATOR',
      },
      {},
      vi.fn(),
    )

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguage: 'zh-CN',
          targetLanguage: 'zh-TW',
        }),
      )
    })
  })

  it('falls back to the page bridge when warm translator creation throws a DOMException', async () => {
    document.documentElement.setAttribute('lang', 'en')

    await loadContentScriptTestables()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => {
        throw new DOMException(
          'Translator creation is blocked in this context.',
          'InvalidStateError',
        )
      }),
    })
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      const payload = message as {
        action?: string
        id?: string
        source?: string
        target?: string
        type?: string
      }
      if (payload.type !== '__NT_BRIDGE_REQ' || payload.action !== 'warm' || !payload.id) return
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            id: payload.id,
            ok: true,
            type: '__NT_BRIDGE_RES',
          },
        }),
      )
    })

    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0]
    if (!listener) throw new Error('Missing warm translator listener')
    listener(
      {
        payload: {
          sourceLanguage: 'auto',
          targetLanguage: 'zh-CN',
        },
        type: 'NATIVE_TRANSLATE_WARM_TRANSLATOR',
      },
      {},
      vi.fn(),
    )

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'warm',
          source: 'en',
          target: 'zh-CN',
          type: '__NT_BRIDGE_REQ',
        }),
        '*',
      )
    })
    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        'nativeTranslate.firstRunStatus': expect.objectContaining({
          sourceLanguage: 'en',
          status: 'ready',
          targetLanguage: 'zh-CN',
        }),
      })
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('uses page Chinese variant hints for hover translations with generic zh detection', async () => {
    document.documentElement.setAttribute('lang', 'zh-TW')
    document.body.innerHTML = '<main><p>繁體 中文 懸停 翻譯 應該 轉成 簡體。</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async () => [{ confidence: 0.9, detectedLanguage: 'zh' }],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'zh-CN: 繁體 中文 懸停 翻譯 應該 轉成 簡體。',
      )
    })
  })

  it('canonicalizes underscore html language fallbacks for hover translations', async () => {
    document.documentElement.setAttribute('lang', 'zh_Hant')
    document.body.innerHTML = '<main><p>繁體 中文 懸停 回退 語言 應該 標準化。</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguage: 'zh-TW',
          targetLanguage: 'zh-CN',
        }),
      )
    })
  })

  it('translates the latest hover block text when source text changes while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial hover paragraph for translation.</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    const pendingTranslation = createDeferred<string>()
    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) =>
          text === 'Initial hover paragraph for translation.'
            ? pendingTranslation.promise
            : `translated: ${text}`,
      })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalled()
    })
    paragraph.firstChild.textContent = 'Updated hover paragraph during client hydration.'
    pendingTranslation.resolve('translated: Initial hover paragraph for translation.')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Updated hover paragraph during client hydration.',
      )
    })
    const translations = Array.from(paragraph.querySelectorAll('.native-translate-translation'))
    expect(translations.length).toBeGreaterThan(0)
    expect(
      translations.every(
        (translation) =>
          translation.textContent ===
          'translated: Updated hover paragraph during client hydration.',
      ),
    ).toBe(true)
  })

  it('uses the latest hover source language when text changes while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial hover paragraph for translation.</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    const pendingTranslation = createDeferred<string>()
    await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (text: string) => [
          {
            confidence: 0.9,
            detectedLanguage: text.startsWith('Texto ') ? 'es' : 'en',
          },
        ],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            text === 'Initial hover paragraph for translation.'
              ? pendingTranslation.promise
              : `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'zh-CN' }),
      )
    })
    paragraph.firstChild.textContent = 'Texto actualizado despues de hidratar la pagina.'
    pendingTranslation.resolve('en->zh-CN: Initial hover paragraph for translation.')

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'es->zh-CN: Texto actualizado despues de hidratar la pagina.',
      )
    })
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'es', targetLanguage: 'zh-CN' }),
    )
  })

  it('translates only the latest hover block text changed while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial hover paragraph for translation.</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Initial hover paragraph for translation.')
    })
    paragraph.firstChild.textContent = 'Updated hover paragraph during client hydration.'
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'en' }])

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Updated hover paragraph during client hydration.',
      )
    })

    expect(translate).not.toHaveBeenCalledWith('Initial hover paragraph for translation.')
    expect(translate).toHaveBeenCalledWith('Updated hover paragraph during client hydration.')
  })

  it('does not translate stale hover text that becomes too short while language detection is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial hover paragraph for translation.</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Initial hover paragraph for translation.')
    })
    paragraph.firstChild.textContent = 'Yo'
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'en' }])

    await new Promise((resolve) => setTimeout(resolve, 160))

    expect(translate).not.toHaveBeenCalledWith('Initial hover paragraph for translation.')
    expect(translate).not.toHaveBeenCalledWith('Yo')
    expect(paragraph).toHaveTextContent('Yo')
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
    expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    expect(document.querySelector('.native-translate-skeleton')).toBeNull()
  })

  it('translates latest hover text changed after the delayed skeleton appears', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial hover paragraph for translation.</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    const languageDetection =
      createDeferred<Array<{ confidence: number; detectedLanguage: string }>>()
    const detect = vi.fn(async () => languageDetection.promise)
    await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ detect })),
    })
    const translate = vi.fn(async (text: string) => `translated: ${text}`)
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({ translate })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(detect).toHaveBeenCalledWith('Initial hover paragraph for translation.')
    })
    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-skeleton')).not.toBeNull()
    })
    paragraph.firstChild.textContent = 'Updated hover paragraph after skeleton appears.'
    languageDetection.resolve([{ confidence: 0.9, detectedLanguage: 'en' }])

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Updated hover paragraph after skeleton appears.',
      )
    })

    expect(translate).not.toHaveBeenCalledWith('Initial hover paragraph for translation.')
    expect(translate).toHaveBeenCalledWith('Updated hover paragraph after skeleton appears.')
    expect(paragraph.querySelector('.native-translate-skeleton')).toBeNull()
  })

  it('uses the latest long hover source language when text changes while translation is pending', async () => {
    document.documentElement.setAttribute('lang', 'en')
    const initialText = 'Initial long hover paragraph for translation. '.repeat(20).trim()
    const updatedText = 'Texto largo actualizado despues de hidratar la pagina. '.repeat(20).trim()
    document.body.innerHTML = `<main><p>${initialText}</p></main>`
    window.__nativeTranslateHoverAltInit = undefined

    const pendingTranslation = createDeferred<string>()
    await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (text: string) => [
          {
            confidence: 0.9,
            detectedLanguage: text.startsWith('Texto ') ? 'es' : 'en',
          },
        ],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(
        async (options: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async (text: string) =>
            text === initialText
              ? pendingTranslation.promise
              : `${options.sourceLanguage}->${options.targetLanguage}: ${text}`,
        }),
      ),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing long hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(window.translation?.createTranslator).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'zh-CN' }),
      )
    })
    paragraph.firstChild.textContent = updatedText
    pendingTranslation.resolve(`en->zh-CN: ${initialText}`)

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        `es->zh-CN: ${updatedText}`,
      )
    })
    expect(window.translation?.createTranslator).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'es', targetLanguage: 'zh-CN' }),
    )
  })

  it('removes stale hover translations when source text changes after on-demand translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial hover paragraph after translation.</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Initial hover paragraph after translation.',
      )
    })

    paragraph.firstChild.textContent = 'Updated hover paragraph after client refresh.'

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('removes stale long hover translations when source text changes after translation', async () => {
    document.documentElement.setAttribute('lang', 'en')
    const initialText = 'Initial long hover paragraph after translation. '.repeat(20)
    const updatedText = 'Updated long hover paragraph after client refresh. '.repeat(20)
    document.body.innerHTML = `<main><p>${initialText}</p></main>`
    window.__nativeTranslateHoverAltInit = undefined

    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing long hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        `translated: ${initialText.trim()}`,
      )
    })

    paragraph.firstChild.textContent = updatedText

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('retranslates the same hovered block after stale on-demand translation is cleared', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial hover paragraph before live update.</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph || !paragraph.firstChild) throw new Error('Missing hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Initial hover paragraph before live update.',
      )
    })

    paragraph.firstChild.textContent = 'Updated hover paragraph after live refresh.'
    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    })

    paragraph.dispatchEvent(new MouseEvent('mousemove', { altKey: true, bubbles: true }))

    await waitFor(() => {
      expect(paragraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Updated hover paragraph after live refresh.',
      )
    })
  })

  it('does not trigger hover translation while editing inside an open shadow root', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><search-box></search-box><p>Hover paragraph should wait while editing.</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    const host = document.querySelector('search-box')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = '<input value="draft search query">'
    const input = shadowRoot.querySelector('input')
    if (!input) throw new Error('Missing shadow input')

    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing hover paragraph')
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent ?? '',
    })
    input.focus()
    paragraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    expect(window.translation?.createTranslator).not.toHaveBeenCalled()
  })

  it('translates the shadow block under the pointer instead of the light DOM host', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML =
      '<main><article-card></article-card><p>Light DOM paragraph should not be selected.</p></main>'
    window.__nativeTranslateHoverAltInit = undefined

    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = '<article><p>Shadow paragraph selected by hover.</p></article>'
    const shadowParagraph = shadowRoot.querySelector('p')
    if (!shadowParagraph) throw new Error('Missing shadow paragraph')

    await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    Object.defineProperty(shadowParagraph, 'innerText', {
      configurable: true,
      get: () => shadowParagraph.textContent ?? '',
    })
    shadowParagraph.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'Alt' }),
    )

    await waitFor(() => {
      expect(shadowParagraph.querySelector('.native-translate-translation')).toHaveTextContent(
        'translated: Shadow paragraph selected by hover.',
      )
    })
    expect(document.querySelector('main > .native-translate-translation')).toBeNull()
  })

  it('treats extended Simplified Chinese language tags as the same target variant', async () => {
    document.documentElement.setAttribute('lang', 'zh-Hans-CN')
    document.body.innerHTML = '<main><p>简体中文段落不应该重复翻译。</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh-CN')

    expect(document.querySelector('.native-translate-translation')).toBeNull()
    expect(window.translation?.createTranslator).not.toHaveBeenCalled()
  })

  it('uses Chinese script subtags before region subtags when comparing variants', async () => {
    document.documentElement.setAttribute('lang', 'zh-Hant-CN')
    document.body.innerHTML = '<main><p>繁體中文腳本標籤不應該被地區碼誤判。</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh-TW')

    expect(document.querySelector('.native-translate-translation')).toBeNull()
    expect(window.translation?.createTranslator).not.toHaveBeenCalled()
  })

  it('preserves Chinese variants when inferring document language from BCP-47 tags', async () => {
    document.documentElement.setAttribute('lang', 'zh-Hant-HK')

    const testables = await loadContentScriptTestables()
    const inferDocumentLanguage = (testables as unknown as { inferDocumentLanguage?: () => string })
      .inferDocumentLanguage

    expect(inferDocumentLanguage?.()).toBe('zh-Hant-HK')
  })

  it('ignores previous generated translations when detecting source language for a rerun', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p data-native-translate-done="1">
          Original English paragraph should be translated again.
          <span class="native-translate-translation" data-native-translate-done="1" lang="zh">
            zh: Original English paragraph should be translated again.
          </span>
        </p>
      </main>
    `
    Object.defineProperty(document.body, 'innerText', {
      configurable: true,
      get: () => document.body.textContent ?? '',
    })

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        detect: async (sample: string) => [
          {
            confidence: 0.9,
            detectedLanguage: sample.includes('zh:') ? 'zh' : 'en',
          },
        ],
      })),
    })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')

    expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
      'zh-CN: Original English paragraph should be translated again.',
    )
    expect(document.querySelector('p')).toHaveAttribute('data-native-translate-done', '1')
  })

  it('removes generated skeleton placeholders when clearing previous full page translations', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = `
      <main>
        <p>Paragraph that should remain original.</p>
        <div class="native-translate-skeleton">Loading translation</div>
      </main>
    `

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('en')

    expect(document.querySelector('.native-translate-skeleton')).toBeNull()
    expect(window.translation?.createTranslator).not.toHaveBeenCalled()
  })

  it('removes generated loose text wrappers when clearing previous full page translations', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main>Loose article text that was previously translated.</main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')
    expect(document.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
      'Loose article text that was previously translated.',
    )
    expect(document.querySelector('.native-translate-translation')).toHaveTextContent(
      'zh-CN: Loose article text that was previously translated.',
    )

    document.documentElement.setAttribute('lang', 'zh')
    await testables.translateFullPageAutoDetect('zh')

    expect(document.querySelector('.native-translate-wrapped-segment')).toBeNull()
    expect(document.querySelector('main')).toHaveTextContent(
      'Loose article text that was previously translated.',
    )
    expect(document.querySelector('main')).not.toHaveAttribute('data-nt-segmented')
  })

  it('removes generated loose text wrappers inside open shadow roots when clearing translations', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><news-card /></main>'
    const host = document.querySelector('news-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(document.createTextNode('Shadow loose text that was translated.'))

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')
    expect(shadowRoot.querySelector('.native-translate-wrapped-segment')).toHaveTextContent(
      'Shadow loose text that was translated.',
    )
    expect(shadowRoot.querySelector('.native-translate-translation')).toHaveTextContent(
      'zh-CN: Shadow loose text that was translated.',
    )

    document.documentElement.setAttribute('lang', 'zh')
    await testables.translateFullPageAutoDetect('zh')

    expect(shadowRoot.querySelector('.native-translate-wrapped-segment')).toBeNull()
    expect(shadowRoot).toHaveTextContent('Shadow loose text that was translated.')
  })

  it('clears previous full page translations inside open shadow roots', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><article-card></article-card></main>'
    const host = document.querySelector('article-card')
    if (!host) throw new Error('Missing shadow host')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML =
      '<article><p>Shadow paragraph that was previously translated.</p></article>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async (options: { targetLanguage: string }) => ({
        translate: async (text: string) => `${options.targetLanguage}: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('zh')
    expect(shadowRoot.querySelector('.native-translate-translation')).toHaveTextContent(
      'zh-CN: Shadow paragraph that was previously translated.',
    )

    document.documentElement.setAttribute('lang', 'zh')
    await testables.translateFullPageAutoDetect('zh')

    expect(shadowRoot.querySelector('.native-translate-translation')).toBeNull()
    expect(shadowRoot.querySelector('p')).not.toHaveAttribute('data-native-translate-done')
  })

  it('does not start dynamic translation observer for same-language full page requests', async () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.innerHTML = '<main><p>Initial English paragraph.</p></main>'

    const testables = await loadContentScriptTestables()
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `translated: ${text}`,
      })),
    })

    await testables.translateFullPageAutoDetect('en')

    const main = document.querySelector('main')
    if (!main) throw new Error('Missing main')
    const laterParagraph = document.createElement('p')
    laterParagraph.textContent = 'Later English paragraph.'
    main.appendChild(laterParagraph)

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(laterParagraph.querySelector('.native-translate-translation')).toBeNull()
    expect(window.translation?.createTranslator).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent translator creation for the same language pair', async () => {
    const testables = await loadContentScriptTestables()
    const releaseCreateCallbacks: Array<() => void> = []
    const createStarted = new Promise<void>((resolve) => {
      vi.stubGlobal('translation', {
        createTranslator: vi.fn(
          () =>
            new Promise((resolveTranslator) => {
              releaseCreateCallbacks.push(() => {
                resolveTranslator({
                  translate: async (text: string) => `zh: ${text}`,
                })
              })
              resolve()
            }),
        ),
      })
    })

    const first = testables.getOrCreateTranslator('en', 'zh')
    await createStarted
    const second = testables.getOrCreateTranslator('en', 'zh')
    await new Promise((resolve) => setTimeout(resolve, 0))
    for (const releaseCreate of releaseCreateCallbacks) {
      releaseCreate()
    }

    const [firstTranslator, secondTranslator] = await Promise.all([first, second])

    expect(window.translation?.createTranslator).toHaveBeenCalledTimes(1)
    expect(firstTranslator).toBe(secondTranslator)
  })

  it('bounds the translator pool and evicts the oldest language pairs', async () => {
    const testables = await loadContentScriptTestables()
    const maxEntries = 12
    const createTranslator = vi.fn(async (options: { sourceLanguage: string }) => ({
      translate: async (text: string) => `${options.sourceLanguage}: ${text}`,
    }))
    vi.stubGlobal('translation', { createTranslator })

    for (let i = 0; i < maxEntries + 3; i++) {
      await testables.getOrCreateTranslator(`source-${i}`, 'zh')
    }

    expect(window.__nativeTranslatePool?.size).toBe(maxEntries)

    await testables.getOrCreateTranslator('source-0', 'zh')

    expect(createTranslator).toHaveBeenCalledTimes(maxEntries + 4)
  })

  it('bounds stored ready language pairs when translators are marked ready', async () => {
    const testables = await loadContentScriptTestables()
    const maxEntries = 24
    const readyPairsKey = 'nativeTranslate:readyPairs'
    type ReadyPairsStorageWrite = Record<typeof readyPairsKey, Record<string, number>>
    const readyPairs = Object.fromEntries(
      Array.from({ length: maxEntries }, (_, index) => [`old-source-${index} -> zh `, index + 1]),
    )
    const get = vi.fn(
      async (): Promise<ReadyPairsStorageWrite> => ({
        [readyPairsKey]: readyPairs,
      }),
    )
    const set = vi.fn(async (_value: ReadyPairsStorageWrite): Promise<void> => undefined)
    Object.assign(chrome.storage.session, { get, set })
    vi.stubGlobal('translation', {
      createTranslator: vi.fn(async () => ({
        translate: async (text: string) => `zh: ${text}`,
      })),
    })

    await testables.getOrCreateTranslator('new-source', 'zh')

    const storedMap = set.mock.calls[0]?.[0]?.['nativeTranslate:readyPairs'] as
      | Record<string, number>
      | undefined
    expect(Object.keys(storedMap ?? {})).toHaveLength(maxEntries)
    expect(storedMap).not.toHaveProperty('old-source-0 -> zh ')
    expect(storedMap).toHaveProperty('new-source -> zh ')
  })

  it('bounds the translation cache and evicts the oldest entries', async () => {
    const testables = await loadContentScriptTestables()
    const maxEntries = testables.MAX_TRANSLATION_CACHE_ENTRIES

    for (let i = 0; i < maxEntries + 5; i++) {
      const key = testables.buildCacheKey(`source ${i}`, 'en', 'zh')
      testables.setCachedTranslation(key, `translated ${i}`)
    }

    expect(testables.getTranslationCacheSize()).toBe(maxEntries)
    expect(testables.getCachedTranslation(testables.buildCacheKey('source 0', 'en', 'zh'))).toBe(
      undefined,
    )
    expect(
      testables.getCachedTranslation(
        testables.buildCacheKey(`source ${maxEntries + 4}`, 'en', 'zh'),
      ),
    ).toBe(`translated ${maxEntries + 4}`)
  })

  it('deduplicates concurrent plain text translations for identical lines', async () => {
    const testables = await loadContentScriptTestables()
    const translation = createDeferred<string>()
    const translate = vi.fn(async () => translation.promise)
    const text = 'Repeated side panel text waiting for translation.'

    const first = testables.translateTextPreservingNewlines({ translate }, text, 'en', 'zh')
    const second = testables.translateTextPreservingNewlines({ translate }, text, 'en', 'zh')

    await waitFor(() => {
      expect(translate).toHaveBeenCalledTimes(1)
      expect(translate).toHaveBeenCalledWith(text)
    })
    translation.resolve('zh: Repeated side panel text waiting for translation.')

    await expect(Promise.all([first, second])).resolves.toEqual([
      'zh: Repeated side panel text waiting for translation.',
      'zh: Repeated side panel text waiting for translation.',
    ])
  })

  it('cleans up streaming placeholder and mark when long block translation fails', async () => {
    document.body.innerHTML = '<main><p></p></main>'
    const paragraph = document.querySelector('p')
    if (!paragraph) throw new Error('Missing paragraph')
    const longText = 'Long paragraph for streaming failure cleanup. '.repeat(20)
    paragraph.textContent = longText

    const testables = await loadContentScriptTestables()

    await expect(
      testables.translateIntoElementPreservingNewlines(
        paragraph,
        {
          translate: async () => {
            throw new Error('translator_failed')
          },
          translateStreaming: () => {
            throw new Error('stream_failed')
          },
        },
        longText,
        'en',
        'zh',
      ),
    ).rejects.toThrow()

    expect(paragraph.querySelector('.native-translate-translation')).toBeNull()
    expect(paragraph).not.toHaveAttribute('data-native-translate-done')
  })

  it('throws instead of returning blank text when plain text translation fails', async () => {
    const testables = await loadContentScriptTestables()

    await expect(
      testables.translateTextPreservingNewlines(
        {
          translate: async () => {
            throw new Error('translator_failed')
          },
        },
        'Plain text that should not disappear.',
        'en',
        'zh',
      ),
    ).rejects.toThrow()
  })
})
