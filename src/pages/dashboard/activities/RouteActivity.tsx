import {
  createResource,
  createSignal,
  lazy,
  Suspense,
  type VoidComponent,
} from 'solid-js'

import { getRoute } from '~/api/route'

import IconButton from '~/components/material/IconButton'
import MediaMenu from '~/components/material/MediaMenu'
import TopAppBar from '~/components/material/TopAppBar'

import RouteStaticMap from '~/components/RouteStaticMap'
import RouteStatistics from '~/components/RouteStatistics'
import Timeline from '~/components/Timeline'
import { parseDateStr } from '~/utils/date'

const RouteVideoPlayer = lazy(() => import('~/components/RouteVideoPlayer'))

type RouteActivityProps = {
  dongleId: string
  dateStr: string
}

const RouteActivity: VoidComponent<RouteActivityProps> = (props) => {
  const [seekTime, setSeekTime] = createSignal(0)

  const routeName = () => `${props.dongleId}|${props.dateStr}`
  const [route] = createResource(routeName, getRoute)
  const [startTime] = createResource(route, (route) => parseDateStr(route.start_time)?.format('ddd, MMM D, YYYY'))

  let videoRef: HTMLVideoElement

  function onTimelineChange(newTime: number) {
    videoRef.currentTime = newTime
  }

  return (
    <>
      <TopAppBar leading={<IconButton href={`/${props.dongleId}`}>arrow_back</IconButton>} trailing={
        <MediaMenu />
      }>
        {startTime()}
      </TopAppBar>

      <div class="flex flex-col gap-6 px-4 pb-4">
        <Suspense
          fallback={
            <div class="skeleton-loader aspect-[241/151] rounded-lg bg-surface-container-low" />
          }
        >
          <RouteVideoPlayer ref={ref => videoRef = ref} routeName={routeName()} onProgress={setSeekTime} />
        </Suspense>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-sm">Timeline</h3>
          <Timeline
            class="mb-1"
            routeName={routeName()}
            seekTime={seekTime}
            updateTime={onTimelineChange}
          />
          <Suspense fallback={<div class="h-10" />}>
            <RouteStatistics route={route()} />
          </Suspense>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-sm">Route Map</h3>
          <div class="h-64 overflow-hidden rounded-lg">
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
