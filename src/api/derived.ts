import dayjs from 'dayjs'
import type { Route, RouteSegments } from '~/types'
import { getRouteDuration } from '~/utils/date'
import { fetcher } from '~/api/index'

export const PAGE_SIZE = 7
export const DEFAULT_DAYS = 7

export interface GPSPathPoint {
  t: number
  lng: number
  lat: number
  speed: number
  dist: number
}

interface IDriveEvent {
  type: string
  time: number
  offset_millis: number
  route_offset_millis: number
  data: object
}

type EventDriveEvent = IDriveEvent & {
  type: 'event'
  data: {
    event_type: 'record_front_toggle' | 'first_road_camera_frame'
  }
}

type OpenpilotState =
  | 'disabled'
  | 'preEnabled'
  | 'enabled'
  | 'softDisabling'
  | 'overriding'

type AlertStatus = 0 | 1 | 2

type StateDriveEvent = IDriveEvent & {
  type: 'state'
  data: {
    state: OpenpilotState
    enabled: boolean
    alertStatus: AlertStatus
  }
}

type UserFlagDriveEvent = IDriveEvent & {
  type: 'user_flag'
  data: Record<string, never>
}

type DriveEvent = EventDriveEvent | StateDriveEvent | UserFlagDriveEvent

type EngagedTimelineEvent = {
  type: 'engaged'
  route_offset_millis: number
  end_route_offset_millis: number
}

type AlertTimelineEvent = {
  type: 'alert'
  route_offset_millis: number
  end_route_offset_millis: number
  alertStatus: AlertStatus
}

type OverridingTimelineEvent = {
  type: 'overriding'
  route_offset_millis: number
  end_route_offset_millis: number
}

type UserFlagTimelineEvent = {
  type: 'user_flag'
  route_offset_millis: number
}

export type TimelineEvent =
  | EngagedTimelineEvent
  | AlertTimelineEvent
  | OverridingTimelineEvent
  | UserFlagTimelineEvent

export interface TimelineStatistics {
  duration: number
  engagedDuration: number
  userFlags: number
}

export interface RouteSegmentsWithStats extends RouteSegments {
  timelineStatistics: TimelineStatistics
}

const fetchWithRetry = async <T>(url: string, attempts: number = 3): Promise<T | null> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      console.log(`Fetching ${url}, attempt ${attempt + 1}`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`)
      return await res.json() as T
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed for ${url}:`, error)
      if (attempt === attempts - 1) {
        console.error(`Failed to fetch after ${attempts} attempts: ${url}`)
        return null
      }
    }
  }
  return null
}

const getDerived = async <T>(route: Route, fn: string): Promise<T[]> => {
  const segmentNumbers = Array.from({ length: route.maxqlog }, (_, i) => i)
  const urls = segmentNumbers.map((i) => `${route.url}/${i}/${fn}`)
  const results = await Promise.all(urls.map((url) => fetchWithRetry<T>(url)))
  return results.flat().filter(item => item !== null) as T[]
}

export const getCoords = (route: Route): Promise<GPSPathPoint[]> =>
  getDerived<GPSPathPoint[]>(route, 'coords.json').then((coords) =>
    coords.flat(),
  )

export const getDriveEvents = (route: Route): Promise<DriveEvent[]> =>
  getDerived<DriveEvent[]>(route, 'events.json').then((events) => events.flat())

const generateTimelineEvents = (
  route: Route,
  events: DriveEvent[],
): TimelineEvent[] => {
  const routeDuration = getRouteDuration(route)?.asMilliseconds() ?? 0

  events.sort((a, b) => a.route_offset_millis - b.route_offset_millis)

  const res: TimelineEvent[] = []
  let lastEngaged: StateDriveEvent | undefined
  let lastAlert: StateDriveEvent | undefined
  let lastOverride: StateDriveEvent | undefined

  const isOverriding = (state: OpenpilotState) =>
    ['overriding', 'preEnabled'].includes(state)

  events.forEach((ev) => {
    if (ev.type === 'state') {
      const { enabled, alertStatus, state } = ev.data
      if (lastEngaged && !enabled) {
        res.push({
          type: 'engaged',
          route_offset_millis: lastEngaged.route_offset_millis,
          end_route_offset_millis: ev.route_offset_millis,
        } as EngagedTimelineEvent)
        lastEngaged = undefined
      }
      if (!lastEngaged && enabled) {
        lastEngaged = ev
      }

      if (lastAlert && lastAlert.data.alertStatus !== alertStatus) {
        res.push({
          type: 'alert',
          route_offset_millis: lastAlert.route_offset_millis,
          end_route_offset_millis: ev.route_offset_millis,
          alertStatus: lastAlert.data.alertStatus,
        } as AlertTimelineEvent)
        lastAlert = undefined
      }
      if (!lastAlert && alertStatus !== 0) {
        lastAlert = ev
      }

      if (lastOverride && !isOverriding(ev.data.state)) {
        res.push({
          type: 'overriding',
          route_offset_millis: lastOverride.route_offset_millis,
          end_route_offset_millis: ev.route_offset_millis,
        } as OverridingTimelineEvent)
        lastOverride = undefined
      }
      if (!lastOverride && isOverriding(state)) {
        lastOverride = ev
      }
    } else if (ev.type === 'user_flag') {
      res.push({
        type: 'user_flag',
        route_offset_millis: ev.route_offset_millis,
      })
    }
  })

  if (lastEngaged) {
    res.push({
      type: 'engaged',
      route_offset_millis: lastEngaged.route_offset_millis,
      end_route_offset_millis: routeDuration,
    })
  }
  if (lastAlert) {
    res.push({
      type: 'alert',
      route_offset_millis: lastAlert.route_offset_millis,
      end_route_offset_millis: routeDuration,
      alertStatus: lastAlert.data.alertStatus,
    })
  }
  if (lastOverride) {
    res.push({
      type: 'overriding',
      route_offset_millis: lastOverride.route_offset_millis,
      end_route_offset_millis: routeDuration,
    })
  }

  return res
}

export const getTimelineEvents = (route: Route): Promise<TimelineEvent[]> =>
  getDriveEvents(route).then((events) => generateTimelineEvents(route, events))

const generateTimelineStatistics = (
  route: Route,
  timeline: TimelineEvent[],
): TimelineStatistics => {
  let engagedDuration = 0
  let userFlags = 0
  timeline.forEach((ev) => {
    if (ev.type === 'engaged') {
      engagedDuration += ev.end_route_offset_millis - ev.route_offset_millis
    } else if (ev.type === 'user_flag') {
      userFlags += 1
    }
  })

  return {
    engagedDuration,
    userFlags,
    duration: getRouteDuration(route)?.asMilliseconds() ?? 0,
  }
}

export const getTimelineStatistics = async (
  route: Route,
): Promise<TimelineStatistics> =>
  getTimelineEvents(route).then((timeline) =>
    generateTimelineStatistics(route, timeline),
  )

export const fetchRoutesWithinDays = async (dongleId: string, days: number): Promise<RouteSegments[]> => {
  const now = dayjs().valueOf()
  const pastDate = dayjs().subtract(days, 'day').valueOf()
  const endpoint = (end: number) => `/v1/devices/${dongleId}/routes_segments?limit=${PAGE_SIZE}&end=${end}`

  let allRoutes: RouteSegments[] = []
  let end = now

  while (true) {
    const key = `${endpoint(end)}`
    try {
      const routes = await fetcher<RouteSegments[]>(key)
      if (!routes || routes.length === 0) break
      allRoutes = [...allRoutes, ...routes]
      end = (routes.at(-1)?.end_time_utc_millis ?? 0) - 1
      if (end < pastDate) break
    } catch (error) {
      console.error('Error fetching routes:', error)
      break
    }
  }
  return allRoutes.filter(route => route.end_time_utc_millis >= pastDate)
}

export const fetchRoutesWithStats = async (dongleId: string, days: number): Promise<RouteSegmentsWithStats[]> => {
  const routes = await fetchRoutesWithinDays(dongleId, days)
  console.log('Fetched routes:', routes.length)
  const routesWithStats = await Promise.all(
    routes.map(async (route): Promise<RouteSegmentsWithStats> => {
      const stats = await getTimelineStatistics(route).catch((error) => {
        console.error(`Error fetching statistics for route ${route.fullname}:`, error)
        return { duration: 0, engagedDuration: 0, userFlags: 0 }
      })
      console.log(`Route ${route.fullname} stats:`, stats)
      return {
        ...route,
        timelineStatistics: stats,
      }
    }),
  )
  console.log('Routes with stats:', routesWithStats.length)
  return routesWithStats
}
