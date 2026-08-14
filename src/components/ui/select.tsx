import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown, ChevronUp } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/utils/cn'

export interface Option {
  value: string
  label: string
}

export interface AppSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: Option[]
  disabled?: boolean
}

export function AppSelect({ value, onValueChange, options, disabled = false }: AppSelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          'relative w-full rounded-lg border border-zinc-200 bg-white py-2 pr-8 pl-3 text-left text-sm dark:border-zinc-800 dark:bg-zinc-950',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        disabled={disabled}
      >
        <SelectPrimitive.Value />
        <ChevronDown
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60"
          aria-hidden="true"
        />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          side="bottom"
          sideOffset={4}
          avoidCollisions
          sticky="always"
          collisionPadding={8}
          className="z-[2147483647] w-[var(--radix-select-trigger-width)] rounded-lg border border-zinc-200 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-950"
        >
          <SelectPrimitive.ScrollUpButton className="flex items-center justify-center p-1 text-gray-500 dark:text-gray-400">
            <ChevronUp className="h-4 w-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1 max-h-64 overflow-auto overscroll-contain">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-zinc-900 outline-none data-[highlighted]:bg-zinc-100 dark:text-zinc-100 dark:data-[highlighted]:bg-zinc-900"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex items-center justify-center p-1 text-gray-500 dark:text-gray-400">
            <ChevronDown className="h-4 w-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
