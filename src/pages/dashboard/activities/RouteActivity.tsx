import { createEffect, createMemo, createResource, createSignal, Suspense, type VoidComponent } from 'solid-js'

import { setRouteViewed } from '~/api/athena'
import { getDevice } from '~/api/devices'
import { getProfile } from '~/api/profile'
import { getRoute } from '~/api/route'
import { dayjs } from '~/utils/format'

import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'
import RouteActions from '~/components/RouteActions'
import RouteStaticMap from '~/components/RouteStaticMap'
import RouteStatistics from '~/components/RouteStatistics'
import RouteVideoPlayer from '~/components/RouteVideoPlayer'
import RouteUploadButtons from '~/components/RouteUploadButtons'
import Timeline from '~/components/Timeline'
import { generateTimelineStatistics, getTimelineEvents } from '~/api/derived'
import { useAppContext } from '~/AppContext'

type RouteActivityProps = {
  dongleId: string
  dateStr: string
  startTime: number
}

const RouteActivity: VoidComponent<RouteActivityProps> = (props) => {
  const [state] = useAppContext()
  const [seekTime, setSeekTime] = createSignal(props.startTime)
  const [videoRef, setVideoRef] = createSignal<HTMLVideoElement>()

  const routeName = () => `${props.dongleId}|${props.dateStr}`

  const [route] = createResource(
    routeName,
    () => {
      if (state.currentRoute !== undefined) return state.currentRoute
      return getRoute(routeName())
    },
    { initialValue: state.currentRoute },
  )

  const startTime = createMemo(() => {
    if (!route.latest) return ''
    return dayjs(route.latest.start_time)?.format('ddd, MMM D, YYYY')
  })

  // FIXME: generateTimelineStatistics is given different versions of TimelineEvents multiple times, leading to stuttering engaged % on switch
  const [events] = createResource(
    route,
    (route) => {
      if (state.currentEvents !== undefined) return state.currentEvents
      return getTimelineEvents(route)
    },
    { initialValue: state.currentEvents ?? [] },
  )

  const timeline = () => generateTimelineStatistics(route(), events() ?? [])

  const onTimelineChange = (newTime: number) => {
    const video = videoRef()
    if (video) video.currentTime = newTime
  }

  createEffect(() => {
    routeName() // track changes
    setSeekTime(props.startTime)
    onTimelineChange(props.startTime)
  })

  const [device] = createResource(
    () => props.dongleId,
    (dongleId) => {
      if (state.currentDevice !== undefined) return state.currentDevice
      return getDevice(dongleId)
    },
    { initialValue: state.currentDevice },
  )

  const [profile] = createResource(getProfile, { initialValue: state.currentProfile })
  createEffect(() => {
    if (!device() || !profile() || (!device()!.is_owner && !profile()!.superuser)) return
    setRouteViewed(device()!.dongle_id, props.dateStr)
  })

  return (
    <>
      <TopAppBar leading={<IconButton class="md:hidden" name="arrow_back" href={`/${props.dongleId}`} />}>{startTime()}</TopAppBar>

      <div class="flex flex-col gap-6 px-4 pb-4">
        <div class="flex flex-col">
          <RouteVideoPlayer ref={setVideoRef} routeName={routeName()} startTime={seekTime()} onProgress={setSeekTime} />
          <Timeline class="mb-1" route={route.latest ?? route()} seekTime={seekTime()} updateTime={onTimelineChange} events={events()} />
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-md uppercase">Route Info</h3>
          <div class="flex flex-col rounded-md overflow-hidden bg-surface-container">
            <RouteStatistics class="p-5" route={route.latest ?? route()} timeline={timeline()} />

            <RouteActions routeName={routeName()} route={route.latest ?? route()} />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-md uppercase">Upload Files</h3>
          <div class="flex flex-col rounded-md overflow-hidden bg-surface-container">
            <RouteUploadButtons route={route.latest ?? route()} />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-md uppercase">Route Map</h3>
          <div class="aspect-square overflow-hidden rounded-lg">
            <Suspense fallback={<div class="h-full w-full skeleton-loader bg-surface-container" />}>
              <RouteStaticMap route={route.latest ?? route()} />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  )
}

export default RouteActivity
