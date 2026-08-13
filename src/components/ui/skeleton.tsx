import * as React from 'react'
import { cn } from '@/utils/cn'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number
}

export function Skeleton({ className, lines = 3, ...props }: SkeletonProps) {
  const widths = ['w-full', 'w-[83%]', 'w-[61%]']
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true" {...props}>
      {widths.slice(0, lines).map((width) => (
        <div
          key={width}
          className={cn(
            'h-3 rounded bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 bg-[length:200%_100%]',
            'animate-[shimmer_1.6s_linear_infinite] dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800',
            'motion-reduce:animate-none',
            width,
          )}
        />
      ))}
    </div>
  )
}
