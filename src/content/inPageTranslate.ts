export interface InPageTranslateRequest {
  text: string
  sourceLanguage?: string
  targetLanguage: string
}

export type InPageTranslateFn = (input: InPageTranslateRequest) => Promise<string>

let registered: InPageTranslateFn | null = null

export function registerInPageTranslator(fn: InPageTranslateFn | null): void {
  registered = fn
}

export function getRegisteredInPageTranslator(): InPageTranslateFn | null {
  return registered
}

export async function translateInPage(input: InPageTranslateRequest): Promise<string> {
  if (!registered) {
    throw new Error('In-page translator is not registered')
  }
  return registered(input)
}
