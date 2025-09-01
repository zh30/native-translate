import * as React from 'react';
import { cn } from '@/utils/cn';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

export function Progress({ value = 0, className, ...props }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-2 w-full bg-gray-200 dark:bg-neutral-800 rounded overflow-hidden', className)} {...props}>
      <div
        className="h-2 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 rounded transition-all duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}


