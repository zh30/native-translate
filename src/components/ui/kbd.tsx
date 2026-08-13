import * as React from 'react'
import { cn } from '@/utils/cn'

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

export function Kbd({ className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5',
        'font-mono text-[10px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
        className,
      )}
      {...props}
    />
  )
}
