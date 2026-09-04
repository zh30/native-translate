import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom 30 still has no Popover API. The content script patches these methods
// and queries :popover-open, so tests need a prototype-level polyfill.
if (typeof HTMLElement.prototype.showPopover !== 'function') {
  const openPopovers = new WeakSet<Element>()
  const originalMatches = Element.prototype.matches
  Element.prototype.matches = function (this: Element, selectors: string): boolean {
    if (selectors === ':popover-open') return openPopovers.has(this)
    return originalMatches.call(this, selectors)
  }
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    openPopovers.add(this)
    // jsdom 30 applies [popover]:not(:popover-open){display:none} via UA CSS.
    this.style.setProperty('display', 'block', 'important')
  }
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    openPopovers.delete(this)
    this.style.removeProperty('display')
  }
  HTMLElement.prototype.togglePopover = function (this: HTMLElement, force?: boolean) {
    const shouldOpen = force ?? !openPopovers.has(this)
    if (shouldOpen) HTMLElement.prototype.showPopover.call(this)
    else HTMLElement.prototype.hidePopover.call(this)
    return shouldOpen
  }
}

afterEach(() => {
  cleanup()
})
