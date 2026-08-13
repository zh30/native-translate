import * as React from 'react'
import { cn } from '@/utils/cn'

export interface AiBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label?: string
}

export function AiBadge({ label = 'AI', className, ...props }: AiBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[var(--color-ai-from)] to-[var(--color-ai-to)]',
        'px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white',
        className,
      )}
      {...props}
    >
      {label}
    </span>
  )
}
