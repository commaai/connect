import { MAPBOX_USERNAME, MAPBOX_LIGHT_STYLE_ID, MAPBOX_DARK_STYLE_ID, MAPBOX_TOKEN } from './config'
import { getThemeId } from '~/theme'

export type Coords = [number, number][]

function getMapStyleId(themeId: string): string {
  return themeId === 'light' ? MAPBOX_LIGHT_STYLE_ID : MAPBOX_DARK_STYLE_ID
}

export function getTileUrl(): string {
  const themeId = getThemeId()
  const styleId = getMapStyleId(themeId)

  return `https://api.mapbox.com/styles/v1/${MAPBOX_USERNAME}/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
}
