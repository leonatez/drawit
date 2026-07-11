import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseModelId, getConfiguredModels } from '@/lib/ai/providers/types'

describe('parseModelId', () => {
  it('splits provider from a single-segment model name', () => {
    expect(parseModelId('gemini/gemini-3.1-flash-image-preview')).toEqual({
      provider: 'gemini',
      modelName: 'gemini-3.1-flash-image-preview',
    })
  })

  it('splits on the FIRST slash only when the model name itself contains slashes', () => {
    expect(parseModelId('vilao/gtm/gpt-image-2')).toEqual({
      provider: 'vilao',
      modelName: 'gtm/gpt-image-2',
    })
  })

  it('returns null when there is no slash', () => {
    expect(parseModelId('vilao')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseModelId('')).toBeNull()
  })

  it('returns null when the provider or model name segment is empty', () => {
    expect(parseModelId('/gpt-image-2')).toBeNull()
    expect(parseModelId('vilao/')).toBeNull()
  })
})

describe('getConfiguredModels', () => {
  const originalModels = process.env.MODELS

  beforeEach(() => {
    delete process.env.MODELS
  })

  afterEach(() => {
    if (originalModels === undefined) delete process.env.MODELS
    else process.env.MODELS = originalModels
  })

  it('falls back to Gemini-only when MODELS is unset', () => {
    expect(getConfiguredModels()).toEqual(['gemini/gemini-3.1-flash-image-preview'])
  })

  it('falls back to Gemini-only when MODELS is an empty string', () => {
    process.env.MODELS = ''
    expect(getConfiguredModels()).toEqual(['gemini/gemini-3.1-flash-image-preview'])
  })

  it('parses a comma-separated list and trims whitespace', () => {
    process.env.MODELS = ' gemini/gemini-3.1-flash-image-preview , vilao/gtm/gpt-image-2 '
    expect(getConfiguredModels()).toEqual([
      'gemini/gemini-3.1-flash-image-preview',
      'vilao/gtm/gpt-image-2',
    ])
  })

  it('drops empty entries from a trailing/double comma', () => {
    process.env.MODELS = 'gemini/gemini-3.1-flash-image-preview,,vilao/gtm/gpt-image-2,'
    expect(getConfiguredModels()).toEqual([
      'gemini/gemini-3.1-flash-image-preview',
      'vilao/gtm/gpt-image-2',
    ])
  })
})
