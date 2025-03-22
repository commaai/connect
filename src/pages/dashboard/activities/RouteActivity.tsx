import {
  createResource,
  createSignal,
  lazy,
  Suspense,
  type VoidComponent,
} from 'solid-js'

import { getRouteWithSegments } from '~/api/route'
import { uploadAllSegments } from '~/api/upload'
import { dayjs } from '~/utils/format'

import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'
import RouteStaticMap from '~/components/RouteStaticMap'
import RouteStatistics from '~/components/RouteStatistics'
import RouteActions from '~/components/RouteActions'
import Timeline from '~/components/Timeline'

const RouteVideoPlayer = lazy(() => import('~/components/RouteVideoPlayer'))

type RouteActivityProps = {
  dongleId: string
  dateStr: string
  startTime: number
}

const RouteActivity: VoidComponent<RouteActivityProps> = (props) => {
  const [seekTime, setSeekTime] = createSignal(props.startTime)
  const [videoRef, setVideoRef] = createSignal<HTMLVideoElement>()

  const routeName = () => `${props.dongleId}|${props.dateStr}`
  const [route] = createResource(routeName, getRouteWithSegments)
  const [startTime] = createResource(route, (route) => dayjs(route.start_time)?.format('ddd, MMM D, YYYY'))

  function onTimelineChange(newTime: number) {
    const video = videoRef()
    if (video) video.currentTime = newTime
  }

  return (
    <>
      <TopAppBar 
        leading={<IconButton class="md:hidden" href={`/${props.dongleId}`}>arrow_back</IconButton>} 
        trailing={<IconButton name='Upload' onClick={() => uploadAllSegments(routeName(), route()?.segment_numbers.length || 0)}>upload</IconButton>}
      >
        {startTime()}
      </TopAppBar>

      <div class="flex flex-col gap-6 px-4 pb-4">
        <Suspense
          fallback={
            <div class="skeleton-loader aspect-[241/151] rounded-lg bg-surface-container-low" />
          }
        >
          <RouteVideoPlayer ref={setVideoRef} routeName={routeName()} startTime={seekTime()} onProgress={setSeekTime} />
        </Suspense>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-sm">Timeline</h3>
          <Timeline
            class="mb-1"
            routeName={routeName()}
            seekTime={seekTime}
            updateTime={onTimelineChange}
          />
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-sm uppercase">Route Info</h3>
          <div class="flex flex-col rounded-md overflow-hidden bg-surface-container-low">
            <RouteStatistics class="p-5" route={route()} />

            <Suspense fallback={<div class="skeleton-loader min-h-48" />}>
              <RouteActions routeName={routeName()} />
            </Suspense>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-sm uppercase">Route Map</h3>
          <div class="aspect-square overflow-hidden rounded-lg">
            <Suspense fallback={<div class="skeleton-loader size-full bg-surface" />}>
              <RouteStaticMap route={route()} />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  )
}

export default RouteActivity
