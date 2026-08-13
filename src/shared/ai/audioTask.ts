export const MAX_RECORDING_SECONDS = 60
export const MAX_AUDIO_FILE_BYTES = 10 * 1024 * 1024
export const AUDIO_WINDOW_SECONDS = 30
export const AUDIO_OVERLAP_SECONDS = 2

const ALLOWED_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'webm'])
const ALLOWED_MIME_PREFIXES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/ogg',
  'audio/webm',
]

export interface AudioWindow {
  start: number
  end: number
}

export function validateAudioFile(
  size: number,
  mimeOrName: string,
): { ok: true } | { ok: false; code: 'too_large' | 'bad_type' } {
  if (size > MAX_AUDIO_FILE_BYTES) return { ok: false, code: 'too_large' }
  const lower = mimeOrName.toLowerCase()
  const ext = lower.includes('.') ? (lower.split('.').pop() ?? '') : ''
  const mimeOk = ALLOWED_MIME_PREFIXES.some((item) => lower.startsWith(item))
  const extOk = ALLOWED_EXTENSIONS.has(ext)
  if (!mimeOk && !extOk) return { ok: false, code: 'bad_type' }
  return { ok: true }
}

export function planAudioWindows(
  durationSec: number,
  windowSec = AUDIO_WINDOW_SECONDS,
  overlapSec = AUDIO_OVERLAP_SECONDS,
): AudioWindow[] {
  if (durationSec <= 0) return []
  const windows: AudioWindow[] = []
  let start = 0
  const step = Math.max(1, windowSec - overlapSec)
  while (start < durationSec) {
    const end = Math.min(durationSec, start + windowSec)
    windows.push({ start, end })
    if (end >= durationSec) break
    start += step
  }
  return windows
}
