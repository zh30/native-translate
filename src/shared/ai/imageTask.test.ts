import { describe, expect, it } from 'vitest'
import {
  dataUrlToBlob,
  MAX_IMAGE_EDGE,
  multimodalImagePart,
  planScreenshotCrop,
  scaleToMaxEdge,
} from '@/shared/ai/imageTask'

describe('planScreenshotCrop', () => {
  it.each([
    { dpr: 1, imageWidth: 1920, imageHeight: 1080 },
    { dpr: 1.25, imageWidth: 2400, imageHeight: 1350 },
    { dpr: 2, imageWidth: 3840, imageHeight: 2160 },
  ])(
    'maps CSS rects at dpr $dpr and keeps the long edge ≤ 1536',
    ({ dpr, imageWidth, imageHeight }) => {
      const plan = planScreenshotCrop({
        cssRect: { x: 100, y: 80, width: 1600, height: 900 },
        dpr,
        imageWidth,
        imageHeight,
      })
      expect(plan.source.x).toBe(Math.round(100 * dpr))
      expect(plan.source.y).toBe(Math.round(80 * dpr))
      expect(plan.source.x + plan.source.width).toBeLessThanOrEqual(imageWidth)
      expect(plan.source.y + plan.source.height).toBeLessThanOrEqual(imageHeight)
      expect(Math.max(plan.output.width, plan.output.height)).toBeLessThanOrEqual(MAX_IMAGE_EDGE)
    },
  )

  it('clamps a rect that extends past the screenshot', () => {
    const plan = planScreenshotCrop({
      cssRect: { x: 1800, y: 1000, width: 400, height: 400 },
      dpr: 1,
      imageWidth: 1920,
      imageHeight: 1080,
    })
    expect(plan.source.x + plan.source.width).toBeLessThanOrEqual(1920)
    expect(plan.source.y + plan.source.height).toBeLessThanOrEqual(1080)
  })
})

describe('scaleToMaxEdge', () => {
  it('does not upscale small images', () => {
    expect(scaleToMaxEdge(800, 600)).toEqual({ width: 800, height: 600, scale: 1 })
  })
})

describe('dataUrlToBlob', () => {
  it('decodes a PNG data URL into a Blob for Prompt API image content', () => {
    const dataUrl = `data:image/png;base64,${btoa('png-bytes')}`
    const blob = dataUrlToBlob(dataUrl)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe('png-bytes'.length)
    const part = multimodalImagePart(dataUrl)
    expect(part.type).toBe('image')
    expect(part.content).toBeInstanceOf(Blob)
    expect(part.content.type).toBe('image/png')
  })
})
