import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/utils/cn'

const segmentedVariants = cva(
  'inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-900',
)

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className={cn(segmentedVariants(), 'm-0 min-w-0 border-0 p-0', className)}>
      {ariaLabel ? <legend className="sr-only">{ariaLabel}</legend> : null}
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            className={cn(
              'rounded-md px-2 py-1 font-medium transition-colors',
              selected
                ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </fieldset>
  )
}

export type SegmentedControlVariants = VariantProps<typeof segmentedVariants>
