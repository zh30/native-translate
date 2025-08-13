import * as React from 'react';
import * as RadixLabel from '@radix-ui/react-label';
import { cn } from '@/utils/cn';

export const Label = React.forwardRef<
  React.ElementRef<typeof RadixLabel.Root>,
  React.ComponentPropsWithoutRef<typeof RadixLabel.Root>
>(({ className, ...props }, ref) => (
  <RadixLabel.Root
    ref={ref}
    className={cn('text-xs text-gray-600 dark:text-gray-300', className)}
    {...props}
  />
));
Label.displayName = RadixLabel.Root.displayName;


