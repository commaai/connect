import type { Position } from 'geojson'

import type { ReverseGeocodingResponse, ReverseGeocodingFeature } from '~/map/api-types'
import { MAPBOX_TOKEN } from '~/map/config'


const INCLUDE_REGION_CODE = ['US', 'CA']


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
  ].find(Boolean) || ''
  let details = [
    context.place?.name,
    context.locality?.name,
    context.district?.name,
  ].filter((it) => it !== name).find(Boolean) || ''
  if (context.region?.region_code && INCLUDE_REGION_CODE.includes(context.country?.country_code || '')) {
    details = details ? `${details}, ${context.region.region_code}` : context.region.region_code
  }
  return {
    name,
    details,
  }
}
