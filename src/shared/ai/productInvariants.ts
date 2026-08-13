import type { ExtractEntity, GateState, SummaryFormat } from '@/shared/ai/types'

export function summarizerTypeForFormat(format: SummaryFormat | string): SummaryFormat {
  if (
    format === 'tldr' ||
    format === 'teaser' ||
    format === 'key-points' ||
    format === 'headline'
  ) {
    return format
  }
  return 'key-points'
}

export function extractFieldsToChain(entity: Exclude<ExtractEntity, 'auto'> | string): string[] {
  if (entity === 'event') return ['title', 'location', 'notes']
  if (entity === 'contact') return ['name', 'org', 'address']
  if (entity === 'product') return ['name', 'specs', 'highlights']
  return []
}

export function splitDigestPoints(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5)
}

export function digestChapterFromSummarize(
  result: { text?: string; sourceText?: string },
  chapter: { id: string; title: string },
): { id: string; title: string; points: string[]; pointsOriginal: string[] } {
  return {
    id: chapter.id,
    title: chapter.title,
    points: splitDigestPoints(result.text ?? ''),
    pointsOriginal: splitDigestPoints(result.sourceText ?? ''),
  }
}

export function nextLearningProcessed(_event: 'disable' | 'restore'): WeakSet<Element> {
  return new WeakSet<Element>()
}

export function learningMutexOnPageTranslate(): 'disable' {
  return 'disable'
}

export function writingSurface(
  gate: GateState | string,
  writingEnabled: boolean,
): 'hidden' | 'translate-only' | 'full' {
  if (!writingEnabled) return 'hidden'
  if (gate === 'ready') return 'full'
  return 'translate-only'
}

export function selectionAfterChange(input: {
  cardPinned: boolean
  selectionLen: number
  minChars: number
  isEditable?: boolean
  toolbarVisible?: boolean
  sameSelection?: boolean
}): 'keep-card' | 'keep-toolbar' | 'close' | 'show-toolbar' {
  if (input.cardPinned) return 'keep-card'
  if (input.isEditable) return 'close'
  if (input.selectionLen < input.minChars) {
    return input.toolbarVisible ? 'keep-toolbar' : 'close'
  }
  if (input.toolbarVisible && input.sameSelection) return 'keep-toolbar'
  return 'show-toolbar'
}

export function hudMustUnbindKeydown(exit: 'enter' | 'esc' | 'mouseup' | 'remove'): boolean {
  return exit === 'enter' || exit === 'esc' || exit === 'mouseup' || exit === 'remove'
}

export function hasCustomElementsRegistry(registry: { get?: unknown } | null | undefined): boolean {
  return typeof registry?.get === 'function'
}

export function shouldInitPageAssistants(input: {
  protocol?: string
  customElements?: { get?: unknown } | null
}): boolean {
  const protocol = input.protocol ?? ''
  if (
    /^(chrome|chrome-untrusted|chrome-search|edge|brave|opera|vivaldi|devtools):/i.test(protocol)
  ) {
    return false
  }
  if (input.customElements !== undefined && !hasCustomElementsRegistry(input.customElements)) {
    return false
  }
  return true
}

export function isTopContentFrame(win: { top?: unknown }): boolean {
  try {
    return win === win.top
  } catch {
    return true
  }
}

export function frameHasMatchingImage(
  images: Array<{ src?: string; currentSrc?: string }>,
  srcUrl?: string,
): boolean {
  if (!srcUrl) return false
  return images.some((img) => img.currentSrc === srcUrl || img.src === srcUrl)
}

export function shouldHandleContentBroadcast(input: {
  isTopFrame: boolean
  message: 'page-content' | 'region-select' | 'learning' | 'translate-text' | 'extract'
  hasMatchingImage?: boolean
  hasSrcUrl?: boolean
}): boolean {
  if (input.message === 'region-select') {
    if (input.hasMatchingImage) return true
    if (input.hasSrcUrl) return false
    return input.isTopFrame
  }
  return input.isTopFrame
}

export function canExecuteAiLocally(protocol?: string): boolean {
  return protocol === 'chrome-extension:'
}

export function shouldAcceptOffscreenMessage(target?: string): boolean {
  return target === 'offscreen'
}

export function isAiAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { name?: string; code?: string }
  return err.name === 'AbortError' || err.code === 'aborted'
}

export function selectionModifierPressed(
  keys: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
  modifier: 'alt' | 'control' | 'shift' = 'alt',
): boolean {
  if (modifier === 'control') return Boolean(keys.ctrlKey || keys.metaKey)
  if (modifier === 'shift') return Boolean(keys.shiftKey)
  return Boolean(keys.altKey)
}

export function resolveOverlayRect(input: {
  live?: { x: number; y: number; width: number; height: number } | null
  remembered?: { x: number; y: number; width: number; height: number } | null
}): { x: number; y: number; width: number; height: number } {
  const live = input.live
  if (live && (live.width > 0 || live.height > 0)) return live
  if (input.remembered) return input.remembered
  return { x: 16, y: 16, width: 1, height: 1 }
}
