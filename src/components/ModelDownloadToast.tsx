import type { FirstRunStatus } from '@/shared/settings'
import { cn } from '@/utils/cn'
import { t } from '@/utils/i18n'
import { Loader2 } from 'lucide-react'
import React from 'react'

interface ModelDownloadToastProps {
  status: FirstRunStatus
  className?: string
}

export function ModelDownloadToast({ status, className }: ModelDownloadToastProps) {
  if (status.status !== 'downloading') return null

  const progress =
    typeof status.progress === 'number' ? Math.max(0, Math.min(100, status.progress)) : null

  return (
    <output
      aria-live="polite"
      className={cn('pointer-events-none fixed inset-x-3 bottom-3 z-[2147483647]', className)}
    >
      <div
        className={cn(
          'mx-auto max-w-md rounded-lg border border-cyan-200 bg-white/95 p-3',
          'text-cyan-950 shadow-[0_20px_60px_rgba(8,145,178,0.24)] backdrop-blur',
          'dark:border-cyan-900 dark:bg-zinc-950/95 dark:text-cyan-100',
        )}
      >
        <div className="flex items-start gap-2">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{t('first_run_status_downloading_title')}</p>
            <p className="mt-1 text-[11px] leading-4 opacity-80">
              {progress === null
                ? t('first_run_status_preparing_desc')
                : t('first_run_status_downloading_desc', [progress])}
            </p>
            {progress !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cyan-100 dark:bg-cyan-950">
                <div
                  className="h-full rounded-full bg-cyan-600 transition-[width] duration-300 dark:bg-cyan-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </output>
  )
}
