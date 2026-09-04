import { createRequire } from 'node:module'
import { Loader2, Sparkles } from 'lucide-react'
import { createElement } from 'react'
import { twMerge } from 'tailwind-merge'
import { describe, expect, it } from 'vitest'
import { cn } from '@/utils/cn'

const require = createRequire(import.meta.url)

function major(version: string): number {
  const n = Number(version.split('.')[0])
  if (!Number.isFinite(n)) throw new Error(`unparseable version: ${version}`)
  return n
}

describe('resolved upgraded packages', () => {
  it('loads the bumped majors that the app actually imports', () => {
    expect(major(require('typescript/package.json').version)).toBeGreaterThanOrEqual(7)
    expect(major(require('@biomejs/biome/package.json').version)).toBeGreaterThanOrEqual(2)
    expect(major(require('@rspack/core/package.json').version)).toBeGreaterThanOrEqual(2)
    expect(major(require('lucide-react/package.json').version)).toBeGreaterThanOrEqual(1)
    expect(major(require('jsdom/package.json').version)).toBeGreaterThanOrEqual(30)
    expect(major(require('@testing-library/jest-dom/package.json').version)).toBeGreaterThanOrEqual(
      7,
    )
    expect(major(require('vitest/package.json').version)).toBeGreaterThanOrEqual(5)
  })

  it('lucide-react 1 still provides the icons side panel and popup render', () => {
    const sparkles = createElement(Sparkles, { className: 'h-4 w-4' })
    const loader = createElement(Loader2, { className: 'h-4 w-4' })
    expect(sparkles.type).toBe(Sparkles)
    expect(loader.type).toBe(Loader2)
  })

  it('tailwind-merge still collapses conflicting classes through cn()', () => {
    const merged = cn('px-2 py-1', 'px-4')
    expect(merged).toBe(twMerge('px-2 py-1', 'px-4'))
    expect(merged.split(/\s+/)).toEqual(expect.arrayContaining(['py-1', 'px-4']))
    expect(merged.split(/\s+/)).not.toContain('px-2')
  })
})
