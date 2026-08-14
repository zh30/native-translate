import * as React from 'react'
import { cn } from '@/utils/cn'

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

export function Progress({ value = 0, className, ...props }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-cyan-100 dark:bg-cyan-950',
        className,
      )}
      {...props}
    >
      <div
        className="h-2 rounded-full bg-cyan-600 transition-all duration-300 ease-out dark:bg-cyan-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
