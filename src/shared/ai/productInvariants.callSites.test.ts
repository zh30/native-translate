import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

describe('product invariant call sites', () => {
  it('ensureSummarizer uses summarizerTypeForFormat', () => {
    const text = source('src/shared/ai/execute.ts')
    expect(text).toMatch(/function ensureSummarizer/)
    expect(text).toMatch(/summarizerTypeForFormat\(/)
    expect(text).not.toMatch(/options\.format === 'key-points' \? 'key-points' : 'tldr'/)
  })

  it('executeExtract calls applyLanguageChainFields and extractFieldsToChain', () => {
    const text = source('src/shared/ai/execute.ts')
    expect(text).toMatch(/async function executeExtract/)
    expect(text).toMatch(/extractFieldsToChain\(/)
    expect(text).toMatch(/applyLanguageChainFields\(/)
  })

  it('EPUB digest uses digestChapterFromSummarize / pointsOriginal', () => {
    const text = source('src/sidePanel/sidePanel.tsx')
    expect(text).toMatch(/digestChapterFromSummarize\(/)
    expect(text).toMatch(/pointsOriginal/)
  })

  it('learning custom element registration guards a missing customElements registry', () => {
    const text = source('src/content/learningMode.ts')
    expect(text).toMatch(/hasCustomElementsRegistry\(/)
    expect(text).toMatch(/function defineWordElement/)
  })

  it('content script skips page assistants on chrome new-tab frames', () => {
    const text = source('src/scripts/contentScript.ts')
    expect(text).toMatch(/shouldInitPageAssistants\(/)
    expect(text).toMatch(/initLearningMode\(\)/)
  })

  it('setLearningMode resets processed via nextLearningProcessed', () => {
    const text = source('src/content/learningMode.ts')
    expect(text).toMatch(/export async function setLearningMode/)
    expect(text).toMatch(/processed = nextLearningProcessed\('disable'\)/)
    expect(text).toMatch(/processed = nextLearningProcessed\('restore'\)/)
  })

  it('translateFullPageAutoDetect disables learning mode', () => {
    const text = source('src/scripts/contentScript.ts')
    expect(text).toMatch(/async function translateFullPageAutoDetect/)
    expect(text).toMatch(/learningMutexOnPageTranslate\(\)/)
    expect(text).toMatch(/setLearningMode\(false, \{ persist: false \}\)/)
  })

  it('writing init uses writingSurface', () => {
    const text = source('src/content/writingAssistant.ts')
    expect(text).toMatch(/export function initWritingAssistant/)
    expect(text).toMatch(/writingSurface\(/)
  })

  it('selection toolbar and selectionchange use selectionAfterChange', () => {
    const text = source('src/content/selectionAssistant.ts')
    expect(text).toMatch(/function showToolbar/)
    expect(text).toMatch(/selectionchange/)
    expect(text.match(/selectionAfterChange\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('region finish and mouseup unbind keydown', () => {
    const text = source('src/content/regionSelector.ts')
    expect(text).toMatch(/const finish = async/)
    expect(text).toMatch(/addEventListener\('mouseup'/)
    expect(text).toMatch(/hudMustUnbindKeydown\('enter'\)/)
    expect(text).toMatch(/hudMustUnbindKeydown\('mouseup'\)/)
    const unbinds = text.match(/removeEventListener\('keydown'/g) ?? []
    expect(unbinds.length).toBeGreaterThanOrEqual(2)
  })

  it('content script ignores iframe broadcasts except owned screenshot images', () => {
    const text = source('src/scripts/contentScript.ts')
    expect(text).toMatch(/shouldHandleContentBroadcast\(/)
    expect(text).toMatch(/isTopContentFrame\(/)
    expect(text).toMatch(/frameHasMatchingImage\(/)
    expect(text.match(/shouldHandleContentBroadcast\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  it('offscreen only accepts targeted AI messages', () => {
    const text = source('src/offscreen/offscreen.ts')
    expect(text).toMatch(/shouldAcceptOffscreenMessage\(/)
  })

  it('AI client refuses to run Nano in the page world', () => {
    const text = source('src/shared/ai/client.ts')
    expect(text).toMatch(/canExecuteAiLocally\(/)
    expect(text).not.toMatch(/w\.LanguageModel \|\| w\.Summarizer/)
  })

  it('execute uses a bounded availability probe before create', () => {
    const text = source('src/shared/ai/execute.ts')
    expect(text).toMatch(/readAvailabilityStatus\(/)
    expect(text).toMatch(/shouldCreateDespiteAvailability\(/)
  })

  it('summary tab ignores aborted supersessions', () => {
    const text = source('src/sidePanel/tabs/SummaryTab.tsx')
    expect(text).toMatch(/isAiAbortError\(/)
    expect(text).toMatch(/runGen\.current/)
  })

  it('selection toolbar remembers the last rect and configured modifier', () => {
    const text = source('src/content/selectionAssistant.ts')
    expect(text).toMatch(/resolveOverlayRect\(/)
    expect(text).toMatch(/selectionModifierPressed\(/)
    expect(text).toMatch(/showToolbar\(toolbarText, true\)/)
  })

  it('writing assistant appears while typing and follows input language', () => {
    const text = source('src/content/writingAssistant.ts')
    expect(text).toMatch(/addEventListener\('input'/)
    expect(text).toMatch(/POPUP_SETTINGS_KEY/)
    expect(text).toMatch(/inputTargetLanguage/)
  })
})
