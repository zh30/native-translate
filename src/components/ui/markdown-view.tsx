import * as React from 'react'
import { cn } from '@/utils/cn'

export type MarkdownNode =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; text: string }

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.filter(Boolean).map((part) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`b-${part}`}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={`i-${part}`}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={`c-${part}`}
          className="rounded bg-zinc-100 px-1 py-0.5 text-[12px] dark:bg-zinc-800"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return <React.Fragment key={`t-${part}`}>{part}</React.Fragment>
  })
}

export function parseSafeMarkdown(source: string): MarkdownNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const nodes: MarkdownNode[] = []
  let buffer: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushParagraph = () => {
    if (buffer.length === 0) return
    nodes.push({ type: 'p', text: buffer.join(' ') })
    buffer = []
  }
  const flushList = () => {
    if (list) {
      nodes.push(list)
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }
    if (line.startsWith('### ')) {
      flushParagraph()
      flushList()
      nodes.push({ type: 'h3', text: line.slice(4) })
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph()
      if (!list || list.type !== 'ul') {
        flushList()
        list = { type: 'ul', items: [] }
      }
      list.items.push(line.slice(2))
      continue
    }
    if (/^\d+\.\s/.test(line)) {
      flushParagraph()
      if (!list || list.type !== 'ol') {
        flushList()
        list = { type: 'ol', items: [] }
      }
      list.items.push(line.replace(/^\d+\.\s/, ''))
      continue
    }
    if (line.startsWith('```')) continue
    flushList()
    buffer.push(line)
  }
  flushParagraph()
  flushList()
  return nodes
}

export interface MarkdownViewProps extends React.HTMLAttributes<HTMLDivElement> {
  text: string
}

export function MarkdownView({ text, className, ...props }: MarkdownViewProps) {
  const nodes = React.useMemo(() => parseSafeMarkdown(text), [text])
  return (
    <div
      className={cn('space-y-2 text-[13px] leading-relaxed', className)}
      aria-live="polite"
      {...props}
    >
      {nodes.map((node) => {
        if (node.type === 'h3') {
          return (
            <h3 key={`h3-${node.text}`} className="text-sm font-semibold">
              {renderInline(node.text)}
            </h3>
          )
        }
        if (node.type === 'ul') {
          return (
            <ul key={`ul-${node.items.join('|')}`} className="list-disc space-y-1 pl-4">
              {node.items.map((item) => (
                <li key={item}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }
        if (node.type === 'ol') {
          return (
            <ol key={`ol-${node.items.join('|')}`} className="list-decimal space-y-1 pl-4">
              {node.items.map((item) => (
                <li key={item}>{renderInline(item)}</li>
              ))}
            </ol>
          )
        }
        if (node.type === 'code') {
          return (
            <code
              key={`code-${node.text}`}
              className="block rounded bg-zinc-100 p-2 text-[12px] dark:bg-zinc-800"
            >
              {node.text}
            </code>
          )
        }
        return <p key={`p-${node.text}`}>{renderInline(node.text)}</p>
      })}
    </div>
  )
}
