export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  }
  return node
}

export function button(
  label: string,
  className = 'nt-btn',
  onClick?: () => void,
): HTMLButtonElement {
  const node = el('button', className)
  node.type = 'button'
  node.textContent = label
  if (onClick) node.addEventListener('click', onClick)
  return node
}

export function streamingNode(): {
  root: HTMLElement
  set: (text: string, done?: boolean) => void
} {
  const root = el('div', 'nt-stream')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('role', 'status')
  const caret = el('span', 'nt-caret')
  const set = (text: string, done = false) => {
    root.textContent = text
    if (!done) root.appendChild(caret)
  }
  set('')
  return { root, set }
}

export function skeletonLines(): HTMLElement {
  const wrap = el('div')
  for (const width of ['100%', '83%', '61%']) {
    const line = el('div', 'nt-skel')
    line.style.width = width
    wrap.appendChild(line)
  }
  return wrap
}

export function glassCard(): HTMLElement {
  const card = el('div', 'nt-card nt-interactive')
  card.setAttribute('role', 'dialog')
  return card
}

export function pillToolbar(): HTMLElement {
  const bar = el('div', 'nt-pill nt-interactive')
  bar.setAttribute('role', 'toolbar')
  return bar
}
