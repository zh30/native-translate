import * as React from 'react'
import { cn } from '@/utils/cn'

export interface ProgressRingProps extends React.SVGAttributes<SVGSVGElement> {
  value: number
  size?: number
  strokeWidth?: number
}

export function ProgressRing({
  value,
  size = 28,
  strokeWidth = 3,
  className,
  ...props
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('tabular-nums', className)}
      aria-hidden="true"
      {...props}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-zinc-200 dark:text-zinc-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#nt-ai-ring)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <defs>
        <linearGradient id="nt-ai-ring" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-ai-from)" />
          <stop offset="100%" stopColor="var(--color-ai-to)" />
        </linearGradient>
      </defs>
    </svg>
  )
}
