import { computePosition, flip, offset, shift } from '@floating-ui/dom'

export type OverlayAnchor =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'element'; element: Element }
  | { kind: 'selection' }

function virtualEl(rect: { x: number; y: number; width: number; height: number }) {
  return {
    getBoundingClientRect: () => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
    }),
  }
}

export async function positionOverlay(floating: HTMLElement, anchor: OverlayAnchor): Promise<void> {
  let reference: {
    getBoundingClientRect: () =>
      | DOMRect
      | {
          x: number
          y: number
          width: number
          height: number
          top: number
          left: number
          right: number
          bottom: number
        }
  }
  if (anchor.kind === 'element') {
    reference = anchor.element
  } else if (anchor.kind === 'rect') {
    reference = virtualEl(anchor)
  } else {
    const sel = window.getSelection()
    const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      reference = virtualEl({ x: 16, y: 16, width: 1, height: 1 })
    } else {
      reference = virtualEl(rect)
    }
  }
  const { x, y } = await computePosition(reference as Element, floating, {
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  })
  floating.style.position = 'fixed'
  floating.style.left = `${Math.round(x)}px`
  floating.style.top = `${Math.round(y)}px`
}

export function selectionRect(): DOMRect | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return rect
}
