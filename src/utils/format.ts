import dayjs from 'dayjs'
import advanced from 'dayjs/plugin/advancedFormat'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import duration, { type Duration } from 'dayjs/plugin/duration'

import type { Route } from '~/api/types'

dayjs.extend(advanced)
dayjs.extend(customParseFormat)
dayjs.extend(duration)

export { dayjs }

const MI_TO_KM = 1.609344

const isImperial = (): boolean => {
  if (typeof navigator === 'undefined') return true
  const locale = navigator.language.toLowerCase()
  return locale.startsWith('en-us') || locale.startsWith('en-gb')
}

export const formatDistance = (miles: number | undefined): string | undefined => {
  if (miles === undefined) return undefined
  if (isImperial()) return `${miles.toFixed(1)} mi`
  return `${(miles * MI_TO_KM).toFixed(1)} km`
}

const _formatDuration = (duration: Duration): string => {
  if (duration.hours() > 0) {
    return duration.format('H [hr] m [min]')
  } else {
    return duration.format('m [min]')
  }
}

export const formatDuration = (minutes: number | undefined): string | undefined => {
  if (minutes === undefined) return undefined
  const duration = dayjs.duration({
    hours: Math.floor(minutes / 60),
    minutes: Math.round(minutes % 60),
  })
  return _formatDuration(duration)
}

export const formatVideoTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60).toString()
  const remainingSeconds = Math.floor(seconds % 60).toString()
  if (hours > 0) return `${hours}:${minutes.padStart(2, '0')}:${remainingSeconds.padStart(2, '0')}`
  return `${minutes}:${remainingSeconds.padStart(2, '0')}`
}

export const getRouteDuration = (route: Route | undefined): Duration | undefined => {
  if (!route || !route.end_time) return undefined
  const startTime = dayjs(route.start_time)
  const endTime = dayjs(route.end_time)
  return dayjs.duration(endTime.diff(startTime))
}

export const formatRouteDuration = (route: Route | undefined): string => {
  if (!route) return ''
  const duration = getRouteDuration(route)
  return duration ? _formatDuration(duration) : ''
}

const parseTimestamp = (input: dayjs.ConfigType): dayjs.Dayjs => {
  if (typeof input === 'number') {
    // Assume number is unix timestamp, convert to seconds
    return dayjs.unix(input >= 1e11 ? input / 1000 : input)
  }
  return dayjs(input)
}

export const formatDate = (input: dayjs.ConfigType): string => {
  const date = parseTimestamp(input)
  // Hide current year
  const yearStr = date.year() === dayjs().year() ? '' : ', YYYY'
  return date.format('MMMM Do' + yearStr)
}

const hexToRgb = (hex: string): [number, number, number] => {
  hex = hex.replace('#', '')
  if (hex.length !== 6) throw new Error('Invalid hex color')
  const [r, g, b] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  return [r, g, b]
}

const rgbToHex = (rgb: [number, number, number]): string => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')

const blend = (a: number, b: number, mix: number): number => Math.round(a * mix + b * (1 - mix))

export const dateToGradient = (date: Date, colorA: string, colorB: string, centerHour = 9): string => {
  const [r1, g1, b1] = hexToRgb(colorA)
  const [r2, g2, b2] = hexToRgb(colorB)

  const hours = date.getHours() + date.getMinutes() / 60

  // normalize time so that centerHour is 0 and wraps around 24 hours
  const t = ((hours - centerHour + 24) % 24) / 24

  // cosine smooths transition between colorA and colorB
  const theta = t * 2 * Math.PI
  const mix = (1 + Math.cos(theta)) / 2

  return rgbToHex([blend(r1, r2, mix), blend(g1, g2, mix), blend(b1, b2, mix)])
}
