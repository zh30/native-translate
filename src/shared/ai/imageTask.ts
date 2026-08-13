export const MAX_IMAGE_EDGE = 1536

export interface CssRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropPlan {
  source: PixelRect
  output: { width: number; height: number }
  scale: number
  dpr: number
}

export function cssRectToPixelRect(rect: CssRect, dpr: number): PixelRect {
  const scale = dpr > 0 ? dpr : 1
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale)),
  }
}

export function clampPixelRect(
  rect: PixelRect,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  const x = Math.min(Math.max(0, rect.x), Math.max(0, imageWidth - 1))
  const y = Math.min(Math.max(0, rect.y), Math.max(0, imageHeight - 1))
  const width = Math.max(1, Math.min(rect.width, imageWidth - x))
  const height = Math.max(1, Math.min(rect.height, imageHeight - y))
  return { x, y, width, height }
}

export function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number; scale: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) {
    return { width, height, scale: 1 }
  }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}

export function planScreenshotCrop(input: {
  cssRect: CssRect
  dpr: number
  imageWidth: number
  imageHeight: number
  maxEdge?: number
}): CropPlan {
  const raw = cssRectToPixelRect(input.cssRect, input.dpr)
  const source = clampPixelRect(raw, input.imageWidth, input.imageHeight)
  const output = scaleToMaxEdge(source.width, source.height, input.maxEdge ?? MAX_IMAGE_EDGE)
  return {
    source,
    output: { width: output.width, height: output.height },
    scale: output.scale,
    dpr: input.dpr,
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const header = comma >= 0 ? dataUrl.slice(0, comma) : ''
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/png'
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function multimodalImagePart(source: Blob | string): { type: 'image'; content: Blob } {
  const content = typeof source === 'string' ? dataUrlToBlob(source) : source
  return { type: 'image', content }
}

export function multimodalAudioPart(audio: ArrayBuffer | Blob): { type: 'audio'; content: Blob } {
  const content = audio instanceof Blob ? audio : new Blob([audio], { type: 'audio/wav' })
  return { type: 'audio', content }
}

export async function cropImageBitmap(bitmap: ImageBitmap, plan: CropPlan): Promise<ImageBitmap> {
  const cropped = await createImageBitmap(
    bitmap,
    plan.source.x,
    plan.source.y,
    plan.source.width,
    plan.source.height,
  )
  if (plan.scale === 1) return cropped
  return createImageBitmap(cropped, {
    resizeWidth: plan.output.width,
    resizeHeight: plan.output.height,
  })
}
