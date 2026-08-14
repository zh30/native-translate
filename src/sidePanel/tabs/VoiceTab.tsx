import { Mic } from 'lucide-react'
import React from 'react'
import { AiBadge } from '@/components/ui/ai-badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MAX_RECORDING_SECONDS, planAudioWindows, validateAudioFile } from '@/shared/ai/audioTask'
import { runAiTask } from '@/shared/ai/client'
import type { TranscribeResult } from '@/shared/ai/types'
import type { LanguageCode } from '@/shared/languages'
import { t } from '@/utils/i18n'

export interface VoiceTabProps {
  targetLanguage: LanguageCode
}

export function VoiceTab({ targetLanguage }: VoiceTabProps) {
  const [recording, setRecording] = React.useState(false)
  const [seconds, setSeconds] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<TranscribeResult | null>(null)
  const mediaRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])

  React.useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value + 1 >= MAX_RECORDING_SECONDS) {
          mediaRef.current?.stop()
          return MAX_RECORDING_SECONDS
        }
        return value + 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [recording])

  const transcribeBuffer = async (buffer: ArrayBuffer) => {
    const next = (await runAiTask({
      kind: 'transcribe',
      audio: buffer,
      targetLanguage,
    })) as TranscribeResult
    setResult(next)
  }

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        setRecording(false)
        for (const track of stream.getTracks()) track.stop()
        void new Blob(chunksRef.current).arrayBuffer().then(transcribeBuffer)
      }
      recorder.start()
      mediaRef.current = recorder
      setSeconds(0)
      setRecording(true)
    } catch {
      setError(t('ai_voice_permission'))
    }
  }

  const onFile = async (file: File) => {
    const check = validateAudioFile(file.size, file.type || file.name)
    if (!check.ok) {
      setError(check.code === 'too_large' ? t('ai_voice_too_large') : t('ai_voice_too_long'))
      return
    }
    await transcribeBuffer(await file.arrayBuffer())
  }

  const transcript = result?.segments.map((item) => item.text).join('\n') ?? ''

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{t('ai_voice_title')}</h2>
        <AiBadge label={t('ai_voice_experimental')} />
      </div>
      <div className="flex gap-2">
        <Button
          variant="ai"
          onClick={() => (recording ? mediaRef.current?.stop() : void startRecording())}
        >
          <Mic className="mr-1 h-4 w-4" />
          {recording ? t('ai_voice_stop') : t('ai_voice_record')} {recording ? `${seconds}s` : ''}
        </Button>
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          {t('ai_voice_file')}
          <input
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,audio/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onFile(file)
            }}
          />
        </label>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {!result ? (
        <EmptyState icon={<Mic className="h-5 w-5" />} title={t('ai_voice_title')} />
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 overflow-auto md:grid-cols-2">
          <pre className="whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-white p-3 text-[13px] dark:border-zinc-800 dark:bg-zinc-950">
            {transcript}
          </pre>
          <pre className="whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-white p-3 text-[13px] text-cyan-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-cyan-200">
            {result.translation}
          </pre>
        </div>
      )}
      {result ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(transcript)}
          >
            {t('ai_voice_copy')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const blob = new Blob([`${transcript}\n\n${result.translation ?? ''}`], {
                type: 'text/plain',
              })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'transcript.txt'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            {t('ai_voice_export')}
          </Button>
        </div>
      ) : null}
      <span className="hidden">{planAudioWindows(60).length}</span>
    </div>
  )
}
