import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/utils/cn';

export interface Option {
  value: string;
  label: string;
}

export interface AppSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
}

export function AppSelect({ value, onValueChange, options }: AppSelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          'w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-900 px-3 py-2 text-left text-sm'
        )}
      >
        <SelectPrimitive.Value />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Content className="z-[2147483647] rounded border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-md">
        <SelectPrimitive.Viewport className="p-1">
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
      </SelectPrimitive.Content>
    </SelectPrimitive.Root>
  );
}


