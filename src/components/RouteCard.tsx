import { createSignal, createEffect, Suspense, type Component } from 'solid-js'
import dayjs from 'dayjs'

import Avatar from '~/components/material/Avatar'
import { CardContent, CardHeader } from '~/components/material/Card'
import Icon from '~/components/material/Icon'
import RouteStaticMap from '~/components/RouteStaticMap'
import RouteStatistics from '~/components/RouteStatistics'
import Timeline from './Timeline'

import type { Route, RouteSegments } from '~/types'

import { reverseGeocode } from '~/map'

const RouteHeader = (props: { route?: RouteSegments }) => {

  const startTime = () => props?.route?.start_time_utc_millis ? dayjs(props.route.start_time_utc_millis) : null
  const endTime = () => props?.route?.end_time_utc_millis ? dayjs(props.route.end_time_utc_millis) : null

  const headline = () => {
    if (!startTime() && !endTime()) {
      return 'No time info'
    }
    return startTime()?.format('ddd, MMM D, YYYY') || 'No Time Info!'
  }

  const subhead = () => {
    if (!startTime() && !endTime()) {
      return ''
    }
    return `${startTime()?.format('h:mm A') || 'No start time'} to ${endTime()?.format('h:mm A') || 'No end time'}`
  }

  return (
    <CardHeader
      headline={headline()}
      subhead={subhead()}
      leading={
        <Avatar>
          <Icon>directions_car</Icon>
        </Avatar>
      }
    />
  )
}

interface GeoResult {
  features?: Array<{
    properties?: {
      context?: {
        neighborhood?: string | null,
        region?: string | null,
        place?: string | null
      }
    }
  }>
}

interface LocationContext {
  neighborhood?: {
    name: string | null,
  },
  region?: {
    region_code: string | null,
  },
  place?: {
    name: string | null,
  }
}

async function fetchGeoData(lng: number, lat: number): Promise<GeoResult | null> {
  try {
    const revGeoResult = await reverseGeocode(lng, lat) as GeoResult
    if (revGeoResult instanceof Error) throw revGeoResult
    return revGeoResult
  } catch (error) {
    console.error(error)
    // To allow execution to continue for the next location.
    return null
  }
}

function processGeoResult(
  result: GeoResult | null, 
  setLocation: (location: { neighborhood?: string | null, region?: string | null }) => void,
) {
  if (result) {
    const { neighborhood, region, place } = 
      (result?.features?.[0]?.properties?.context || {}) as LocationContext
    setLocation({
      neighborhood: neighborhood?.name || place?.name,
      region: region?.region_code,
    })
  }
}

type LocationState = { neighborhood?: string | null, region?: string | null }

const RouteRevGeo = (props: { route?: Route }) => {
  const [startLocation, setStartLocation] = createSignal<LocationState>({ 
    neighborhood: null, 
    region: null, 
  })
  const [endLocation, setEndLocation] = createSignal<LocationState>({ 
    neighborhood: null, 
    region: null, 
  })
  const [error, setError] = createSignal<Error | null>(null)

  createEffect(() => {
    if (!props.route) return
    const { start_lng, start_lat, end_lng, end_lat } = props.route
    if (!start_lng || !start_lat || !end_lng || !end_lat) return

    Promise.all([
      fetchGeoData(start_lng, start_lat),
      fetchGeoData(end_lng, end_lat),
    ]).then(([startResult, endResult]) => {
      processGeoResult(startResult, setStartLocation)
      processGeoResult(endResult, setEndLocation)
    }).catch((error) => {
      setError(error as Error)
      console.error('An error occurred while fetching geolocation data:', error)
    })
  })

  return (
    <div>
      {error() && <div>Error: {error()?.message}</div>}
      <div class="flex w-fit items-center gap-2 rounded-xl border border-gray-700 bg-black px-4 py-1 text-[13px]">
        {startLocation().neighborhood && <div>{startLocation().neighborhood}, {startLocation().region}</div>}
        <span class="material-symbols-outlined icon-outline" style={{ 'font-size': '14px' }}>
          arrow_right_alt
        </span>
        {endLocation().neighborhood && <div>{endLocation().neighborhood}, {endLocation().region}</div>}
      </div>
    </div>
  )
}

type RouteCardProps = {
  route?: Route;
}

const RouteCard: Component<RouteCardProps> = (props) => {
  const route = () => props.route

  const navigateToRouteActivity = () => {
    location.href = `/${route()?.dongle_id}/${route()?.fullname?.slice(17)}`
  }

  return (
    <div class="custom-card flex shrink-0 flex-col rounded-lg md:flex-row" onClick={navigateToRouteActivity}>
      <div class="h-full lg:w-[410px]">
        <Suspense
          fallback={<div class="skeleton-loader size-full bg-surface" />}
        >
          <RouteStaticMap route={route()} />
        </Suspense>
      </div>

      <div class="flex flex-col">
        <RouteHeader route={route()} />

        <CardContent class="py-0">
          <RouteRevGeo route={route()} />
          <Timeline route={route()} rounded="rounded-sm" />
          <RouteStatistics route={route()} />
        </CardContent>
      </div>
    </div>
  )
}

export default RouteCard
