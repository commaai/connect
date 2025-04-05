import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dateTimeToColorBetween, formatDate, formatDistance, formatDuration } from './format'

describe('formatDistance', () => {
  it('should format distance', () => {
    expect(formatDistance(0)).toBe('0.0 mi')
    expect(formatDistance(1.234)).toBe('1.2 mi')
  })
  it('should be undefined for undefined distance', () => {
    expect(formatDistance(undefined)).toBe(undefined)
  })
})

describe('formatDuration', () => {
  it('should format duration', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(12)).toBe('12 min')
    expect(formatDuration(12.34)).toBe('12 min')
    expect(formatDuration(90)).toBe('1 hr 30 min')
    expect(formatDuration(120)).toBe('2 hr 0 min')
  })
  it('should be undefined for undefined duration', () => {
    expect(formatDuration(undefined)).toBe(undefined)
  })
})

describe('formatDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-02-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should format date', () => {
    expect(formatDate('2023/01/02')).toBe('January 2nd, 2023')
    expect(formatDate('2018/12/25')).toBe('December 25th, 2018')
  })

  it('should omit year for dates in the current year', () => {
    expect(formatDate('2025/01/01')).toBe('January 1st')
    expect(formatDate('2025/01/02')).toBe('January 2nd')
  })

  it('should parse unix timestamps', () => {
    expect(formatDate(0)).toBe('January 1st, 1970')
    expect(formatDate(1482652800)).toBe('December 25th, 2016')
    expect(formatDate(1738943059)).toBe('February 7th')
    expect(formatDate(1738943059000)).toBe('February 7th')
  })
})

describe('dateTimeToColorBetween', () => {
  it('should generate a color between two colors', () => {
    expect(dateTimeToColorBetween(new Date('2025-02-01T00:00:00.000Z'), '#fcd265', '#384d8f')).toBe('#fcd265')
    expect(dateTimeToColorBetween(new Date('2025-02-01T06:00:00.000Z'), '#fcd265', '#384d8f')).toBe('#9a907a')
    expect(dateTimeToColorBetween(new Date('2025-02-01T12:00:00.000Z'), '#fcd265', '#384d8f')).toBe('#384d8f')
    expect(dateTimeToColorBetween(new Date('2025-02-01T18:00:00.000Z'), '#fcd265', '#384d8f')).toBe('#9a907a')
  })
})
