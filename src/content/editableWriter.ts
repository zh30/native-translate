export function dispatchInputSequence(target: HTMLElement, data: string): void {
  try {
    target.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertReplacementText',
        data,
      }),
    )
  } catch {
    // ignore
  }
  try {
    target.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data }),
    )
  } catch {
    target.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

export function writeToTextControl(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (descriptor?.set) descriptor.set.call(element, value)
  else element.value = value
  try {
    const end = element.value.length
    element.selectionStart = end
    element.selectionEnd = end
  } catch {
    // ignore
  }
  dispatchInputSequence(element, value)
}

export function writeToContentEditable(host: HTMLElement, value: string): void {
  host.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(host)
  selection?.removeAllRanges()
  selection?.addRange(range)
  let inserted = false
  try {
    inserted = document.execCommand('insertText', false, value)
  } catch {
    inserted = false
  }
  if (!inserted) {
    host.textContent = value
    dispatchInputSequence(host, value)
  }
  try {
    const sel = window.getSelection()
    if (sel) {
      const end = document.createRange()
      end.selectNodeContents(host)
      end.collapse(false)
      sel.removeAllRanges()
      sel.addRange(end)
    }
  } catch {
    // ignore
  }
}

export function isTextLikeInput(
  element: Element | null,
): element is HTMLInputElement | HTMLTextAreaElement {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase()
    return ['text', 'search', 'url', 'email', 'tel'].includes(type)
  }
  return false
}

export function getContentEditableHost(
  start: Element | null = document.activeElement,
): HTMLElement | null {
  let current: Element | null = start
  while (current) {
    if ((current as HTMLElement).isContentEditable) return current as HTMLElement
    current = current.parentElement
  }
  return null
}
