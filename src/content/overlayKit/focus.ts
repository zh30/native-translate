export function trapOverlayFocus(
  element: HTMLElement,
  onClose: () => void,
  options?: { allowOutsideClick?: () => boolean },
): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }
  const onPointer = (event: PointerEvent) => {
    if (options?.allowOutsideClick?.()) return
    const path = event.composedPath()
    if (!path.includes(element)) onClose()
  }
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('pointerdown', onPointer, true)
  return () => {
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('pointerdown', onPointer, true)
  }
}
