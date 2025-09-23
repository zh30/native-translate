import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/utils/cn';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface Option {
  value: string;
  label: string;
}

export interface AppSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
}

export function AppSelect({ value, onValueChange, options, disabled = false }: AppSelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          'w-full relative pr-8 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#282828] px-3 py-2 text-left text-sm',
          disabled && 'cursor-not-allowed opacity-60'
        )}
        disabled={disabled}
      >
        <SelectPrimitive.Value />
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" aria-hidden="true" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          side="bottom"
          sideOffset={4}
          avoidCollisions
          sticky="always"
          collisionPadding={8}
          className="z-[2147483647] rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-[#282828] shadow-md w-[var(--radix-select-trigger-width)]"
        >
          <SelectPrimitive.ScrollUpButton className="flex items-center justify-center p-1 text-gray-500 dark:text-gray-400">
            <ChevronUp className="h-4 w-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1 max-h-64 overflow-auto overscroll-contain">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="cursor-pointer rounded px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-neutral-800"
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
  );
}

