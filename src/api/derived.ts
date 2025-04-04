import type { Route } from '~/api/types'
import { useRouteCache } from '~/utils/cache'
import { getRouteDuration } from '~/utils/format'

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

type OpenpilotState = 'disabled' | 'preEnabled' | 'enabled' | 'softDisabling' | 'overriding'

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

export type TimelineEvent = EngagedTimelineEvent | AlertTimelineEvent | OverridingTimelineEvent | UserFlagTimelineEvent

export interface TimelineStatistics {
  duration: number
  engagedDuration: number
  userFlags: number
}

const getDerived = async <T>(route: Route, fn: string): Promise<T[]> => {
  if (!route) return []
  const urls = Array.from({ length: route.maxqlog + 1 }, (_, i) => `${route.url}/${i}/${fn}`)
  const results = urls.map((url) =>
    fetch(url)
      .then((res) => (res.ok ? (res.json() as T) : undefined))
      .catch((err) => {
        console.error('Error parsing file', url, err)
        return undefined
      }),
  )
  return (await Promise.all(results)).filter((it) => it !== undefined)
}

export const getCoords = useRouteCache((route: Route) => getDerived<GPSPathPoint[]>(route, 'coords.json').then((coords) => coords.flat()))

const getDriveEvents = (route: Route): Promise<DriveEvent[]> =>
  getDerived<DriveEvent[]>(route, 'events.json').then((events) => events.flat())

const generateTimelineEvents = (route: Route, events: DriveEvent[]): TimelineEvent[] => {
  const routeDuration = getRouteDuration(route)?.asMilliseconds() ?? 0

  // sort events by timestamp
  events.sort((a, b) => {
    return a.route_offset_millis - b.route_offset_millis
  })

  // convert events to timeline events
  const res: TimelineEvent[] = []
  let lastEngaged: StateDriveEvent | undefined
  let lastAlert: StateDriveEvent | undefined
  let lastOverride: StateDriveEvent | undefined

  const isOverriding = (state: OpenpilotState) => ['overriding', 'preEnabled'].includes(state)

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

  // ensure events have an end timestamp
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

export const getTimelineEvents = useRouteCache<TimelineEvent[]>((route: Route) =>
  getDriveEvents(route).then((events) => generateTimelineEvents(route, events)),
)

export const generateTimelineStatistics = (route: Route | undefined, timeline: TimelineEvent[]): TimelineStatistics => {
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

export const getTimelineStatistics = async (route: Route): Promise<TimelineStatistics> =>
  getTimelineEvents(route).then((timeline) => generateTimelineStatistics(route, timeline))
