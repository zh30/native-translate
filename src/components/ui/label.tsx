import * as RadixLabel from '@radix-ui/react-label'
import * as React from 'react'
import { cn } from '@/utils/cn'

export const Label = React.forwardRef<
  React.ElementRef<typeof RadixLabel.Root>,
  React.ComponentPropsWithoutRef<typeof RadixLabel.Root>
>(({ className, ...props }, ref) => (
  <RadixLabel.Root
    ref={ref}
    className={cn('text-xs text-zinc-600 dark:text-zinc-300', className)}
    {...props}
  />
))
Label.displayName = RadixLabel.Root.displayName
