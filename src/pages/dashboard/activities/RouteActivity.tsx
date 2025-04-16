import { Show, createEffect, createResource, createSignal, Suspense, type VoidComponent } from 'solid-js'

import { setRouteViewed } from '~/api/athena'
import { getDevice } from '~/api/devices'
import { getProfile } from '~/api/profile'
import { getRoute } from '~/api/route'
import { dayjs } from '~/utils/format'
import { resolved } from '~/utils/reactivity'

import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'
import RouteActions from '~/components/RouteActions'
import RouteStaticMap from '~/components/RouteStaticMap'
import RouteStatisticsBar from '~/components/RouteStatisticsBar'
import RouteVideoPlayer from '~/components/RouteVideoPlayer'
import RouteUploadButtons from '~/components/RouteUploadButtons'
import Timeline from '~/components/Timeline'
import { generateRouteStatistics, getTimelineEvents } from '~/api/derived'
import { A } from '@solidjs/router'

type RouteActivityProps = {
  dongleId: string
  dateStr: string
  startTime: number
  endTime: number | undefined
}

const RouteActivity: VoidComponent<RouteActivityProps> = (props) => {
  const [seekTime, setSeekTime] = createSignal(props.startTime)
  const [videoRef, setVideoRef] = createSignal<HTMLVideoElement>()

  const routeName = () => `${props.dongleId}|${props.dateStr}`
  const [route] = createResource(routeName, getRoute)
  const startTime = () => (route.latest ? dayjs(route().start_time).format('dddd, MMM D, YYYY') : '')

  const selection = () => ({ startTime: props.startTime, endTime: props.endTime })

  // FIXME: generateTimelineStatistics is given different versions of TimelineEvents multiple times, leading to stuttering engaged % on switch
  const [events] = createResource(route, getTimelineEvents, { initialValue: [] })
  const [statistics] = createResource(
    () => [route(), events()] as const,
    ([r, e]) => generateRouteStatistics(r, e),
  )

  const onTimelineChange = (newTime: number) => {
    const video = videoRef()
    if (video) video.currentTime = newTime
  }

  createEffect(() => {
    routeName() // track changes
    setSeekTime(props.startTime)
    onTimelineChange(props.startTime)
  })

  const [device] = createResource(() => props.dongleId, getDevice)
  const [profile] = createResource(getProfile)
  createEffect(() => {
    if (!resolved(device) || !resolved(profile) || (!device().is_owner && !profile().superuser)) return
    void setRouteViewed(device().dongle_id, props.dateStr)
  })

  return (
    <>
      <TopAppBar
        class="mx-4 mb-4 h-[28px]"
        component="h2"
        leading={<IconButton class="md:hidden" name="arrow_back" href={`/${props.dongleId}`} />}
      >
        <Suspense fallback={<div class="skeleton-loader max-w-64 rounded-xs h-[28px]" />}>{startTime()}</Suspense>
      </TopAppBar>

      <div class="flex flex-col gap-6 px-4 pb-4">
        <div class="flex flex-col">
          <RouteVideoPlayer ref={setVideoRef} routeName={routeName()} selection={selection()} onProgress={setSeekTime} />
          <Timeline class="mb-1" route={route()} seekTime={seekTime()} updateTime={onTimelineChange} events={events()} />

          <Show when={selection().startTime || selection().endTime}>
            <A
              class="flex items-center justify-center text-center text-label-lg text-gray-500 mt-4"
              href={`/${props.dongleId}/${props.dateStr}`}
            >
              Clear current route selection
              <IconButton name="close_small" />
            </A>
          </Show>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-sm">Route Info</span>
          <div class="flex flex-col rounded-md overflow-hidden bg-surface-container">
            <RouteStatisticsBar class="p-5" route={route()} statistics={statistics} />

            <RouteActions routeName={routeName()} route={route()} />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-sm">Upload Files</span>
          <div class="flex flex-col rounded-md overflow-hidden bg-surface-container">
            <RouteUploadButtons route={route()} />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-sm">Route Map</span>
          <div class="aspect-square overflow-hidden rounded-lg">
            <Suspense fallback={<div class="h-full w-full skeleton-loader bg-surface-container" />}>
              <RouteStaticMap route={route()} />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  )
}

export default RouteActivity
