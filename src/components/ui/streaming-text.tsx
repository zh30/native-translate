import * as React from 'react'
import { cn } from '@/utils/cn'

export interface StreamingTextProps extends React.HTMLAttributes<HTMLDivElement> {
  text: string
  done?: boolean
}

export function StreamingText({ text, done = false, className, ...props }: StreamingTextProps) {
  return (
    <div
      className={cn('text-[13px] leading-relaxed whitespace-pre-wrap', className)}
      aria-live="polite"
      {...props}
    >
      {text}
      {!done && (
        <span
          className="ml-0.5 inline-block h-[1em] w-[0.55ch] animate-pulse bg-gradient-to-b from-[var(--color-ai-from)] to-[var(--color-ai-to)] align-[-0.1em] motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
    </div>
  )
}
