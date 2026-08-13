import * as React from 'react'
import { cn } from '@/utils/cn'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center dark:border-zinc-800',
        className,
      )}
      {...props}
    >
      {icon ? <div className="text-[var(--color-ai-from)]">{icon}</div> : null}
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</p>
      {description ? <p className="max-w-[16rem] text-xs text-zinc-500">{description}</p> : null}
      {action}
    </div>
  )
}
