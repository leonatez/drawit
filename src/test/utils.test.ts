import { describe, it, expect } from 'vitest'
import { cn, formatLabel, parseMentions } from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })
  it('handles tailwind conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})

describe('formatLabel', () => {
  it('pads single digits', () => {
    expect(formatLabel(1)).toBe('01')
  })
  it('leaves double digits unchanged', () => {
    expect(formatLabel(12)).toBe('12')
  })
})

describe('parseMentions', () => {
  it('extracts mentions', () => {
    expect(parseMentions('hello @world and @foo')).toEqual(['world', 'foo'])
  })
  it('returns empty array for no mentions', () => {
    expect(parseMentions('no mentions here')).toEqual([])
  })
  it('handles hyphenated mentions', () => {
    expect(parseMentions('@my-element')).toEqual(['my-element'])
  })
})
