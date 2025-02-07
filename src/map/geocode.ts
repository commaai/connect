import type { Position } from 'geojson'

import type { ReverseGeocodingResponse, ReverseGeocodingFeature } from '~/map/api-types'
import { MAPBOX_TOKEN } from '~/map/config'


export async function reverseGeocode(position: Position): Promise<ReverseGeocodingFeature | null> {
  if (position[0] === 0 && position[1] === 0) {
    return null
  }
  try {
    const resp = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${position[0]}&latitude=${position[1]}&access_token=${MAPBOX_TOKEN}`, {
      cache: 'force-cache',
    })
    if (!resp.ok) {
      throw new Error(`${resp.status} ${resp.statusText}`)
    }
    try {
      const collection = await resp.json() as ReverseGeocodingResponse
      return collection?.features?.[0] ?? null
    } catch (error) {
      throw new Error('Failed to parse response', { cause: error })
    }
  } catch (error) {
    console.error('Reverse geocode lookup failed', error)
    return null
  }
}


export async function getFullAddress(position: Position): Promise<string | null> {
  const feature = await reverseGeocode(position)
  if (!feature) return null
  return feature.properties.full_address
}


export async function getPlaceDetails(position: Position): Promise<{
  name: string
  details: string
} | null> {
  const feature = await reverseGeocode(position)
  if (!feature) return null
  const { properties: { context } } = feature
  const name = [
    context.neighborhood?.name,
    context.locality?.name,
    context.place?.name,
    context.district?.name,
  ].find((name) => name !== undefined) || ''
  const lower = [
    context.place?.name,
    context.locality?.name,
    context.district?.name,
  ].filter((detail) => detail !== name).find((detail) => detail !== undefined)
  const upper = [
    context.region?.region_code,
    context.country?.country_code,
  ].find((detail) => detail !== undefined)
  let details = ''
  if (lower && upper && context.country?.country_code === 'US') {
    details = `${lower}, ${upper}`
  } else {
    details = lower || upper || ''
  }
  return {
    name,
    details,
  }
}
