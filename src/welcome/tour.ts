export type WelcomeTourStep = 'ready' | 'hover' | 'type' | 'page' | 'done'

export interface WelcomeTourState {
  step: WelcomeTourStep
  completed: boolean
}

export const DEFAULT_WELCOME_TOUR: WelcomeTourState = {
  step: 'ready',
  completed: false,
}

export const TOUR_STEPS: ReadonlyArray<Exclude<WelcomeTourStep, 'done'>> = [
  'ready',
  'hover',
  'type',
  'page',
]

export const PRACTICE_PARAGRAPHS = [
  {
    id: 'audience',
    text: 'Most pages are written for someone else. Native Translate keeps the original and adds your language underneath.',
  },
  {
    id: 'privacy',
    text: 'Nothing leaves this device. The model runs in Chrome, on your computer.',
  },
] as const

export const TYPE_SAMPLE_TEXT = 'See you tomorrow.'

const ZH_CN_FALLBACKS: Readonly<Record<string, string>> = {
  'Hello, welcome to Native Translate.': '你好，欢迎使用 Native Translate。',
  [PRACTICE_PARAGRAPHS[0].text]:
    '大多数网页都是写给别人看的。原生翻译保留原文，并在下方加上你的语言。',
  [PRACTICE_PARAGRAPHS[1].text]: '内容不会离开这台设备。模型在 Chrome 里、在你的电脑上运行。',
  [TYPE_SAMPLE_TEXT]: '明天见。',
}

export function isWelcomeTourStep(value: unknown): value is WelcomeTourStep {
  return (
    value === 'ready' ||
    value === 'hover' ||
    value === 'type' ||
    value === 'page' ||
    value === 'done'
  )
}

export function normalizeWelcomeTour(value: unknown): WelcomeTourState {
  if (!value || typeof value !== 'object') return DEFAULT_WELCOME_TOUR
  const candidate = value as Partial<WelcomeTourState>
  if (!isWelcomeTourStep(candidate.step)) return DEFAULT_WELCOME_TOUR
  return {
    step: candidate.step,
    completed: candidate.completed === true,
  }
}

export function nextTourStep(step: WelcomeTourStep): WelcomeTourStep {
  if (step === 'ready') return 'hover'
  if (step === 'hover') return 'type'
  if (step === 'type') return 'page'
  return 'done'
}

export function tourStepIndex(step: WelcomeTourStep): number {
  if (step === 'done') return TOUR_STEPS.length
  return TOUR_STEPS.indexOf(step)
}

export function endsWithDoubleSpace(text: string): boolean {
  return text.endsWith('  ')
}

export function fallbackTranslation(text: string, targetLanguage: string): string | null {
  if (targetLanguage === 'zh-CN' || targetLanguage === 'zh') {
    return ZH_CN_FALLBACKS[text] ?? null
  }
  return null
}

export function isModifierActive(
  event: { altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean },
  modifier: 'alt' | 'control' | 'shift',
): boolean {
  if (modifier === 'alt') return event.altKey
  if (modifier === 'control') return event.ctrlKey
  return event.shiftKey
}

export function hotkeyKeycap(modifier: 'alt' | 'control' | 'shift'): string {
  if (modifier === 'alt') return 'Alt'
  if (modifier === 'control') return 'Ctrl'
  return 'Shift'
}
