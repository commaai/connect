import type { FeatureCollection, Point } from 'geojson'

/**
 * @see https://docs.mapbox.com/api/search/geocoding/#geocoding-response-object
 */
export interface ReverseGeocodingResponse extends FeatureCollection<Point, ReverseGeocodingFeatureProperties> {
  attribution: string
}

export type ReverseGeocodingFeature = ReverseGeocodingResponse['features'][number]

interface ReverseGeocodingFeatureProperties {
  // mapbox_id: string
  feature_type: 'country' | 'region' | 'postcode' | 'district' | 'place' | 'locality' | 'neighborhood' | 'street' | 'address'
  name: string
  name_preferred: string
  place_formatted: string
  full_address: string
  context: ReverseGeocodingContextObject
  // coordinates: {
  //   longitude: number
  //   latitude: number
  //   accuracy: 'rooftop' | 'parcel' | 'point' | 'interpolated' | 'approximate' | 'intersection'
  //   routable_points: {
  //     name: 'default' | string
  //     longitude: number
  //     latitude: number
  //   }[]
  // }
  // bbox?: [number, number, number, number]
  // match_code: object
}

/**
 * @see https://docs.mapbox.com/api/search/geocoding/#the-context-object
 */
interface ReverseGeocodingContextObject<S = ReverseGeocodingContextSubObject> {
  country?: S & {
    country_code: string
    country_code_alpha_3: string
  }
  region?: S & {
    region_code: string
    region_code_full: string
  }
  postcode?: S
  district?: S
  place?: S
  locality?: S
  neighborhood?: S
  street?: S
  address?: S & {
    address_number: string
    street_name: string
  }
}

interface ReverseGeocodingContextSubObject {
  // mapbox_id: string
  name: string
  // wikidata_id?: string
}
