import { createResource, createSignal, lazy, Suspense, type VoidComponent } from 'solid-js'

import { setRouteViewed } from '~/api/athena'
import { getDevice } from '~/api/devices'
import { getProfile } from '~/api/profile'
import { getRoute } from '~/api/route'
import { dayjs } from '~/utils/format'

import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'
import RoutePlaybackMap from '~/components/RoutePlaybackMap'
import RouteStatistics from '~/components/RouteStatistics'
import RouteActions from '~/components/RouteActions'
import RouteUploadButtons from '~/components/RouteUploadButtons'
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
  const [route] = createResource(routeName, getRoute)
  const [startTime] = createResource(route, (route) => dayjs(route.start_time)?.format('ddd, MMM D, YYYY'))

  function onTimelineChange(newTime: number) {
    const video = videoRef()
    if (video) video.currentTime = newTime
  }

  const [device] = createResource(() => props.dongleId, getDevice)
  const [profile] = createResource(getProfile)
  createResource(
    () => [device(), profile(), props.dateStr] as const,
    async ([device, profile, dateStr]) => {
      if (!device || !profile || (!device.is_owner && !profile.superuser)) return
      await setRouteViewed(device.dongle_id, dateStr)
    },
  )

  return (
    <>
      <TopAppBar leading={<IconButton class="md:hidden" name="arrow_back" href={`/${props.dongleId}`} />}>{startTime()}</TopAppBar>

      <div class="flex flex-col gap-6 px-4 pb-4">
        <Suspense fallback={<div class="skeleton-loader aspect-[241/151] rounded-lg bg-surface-container-low" />}>
          <RouteVideoPlayer ref={setVideoRef} routeName={routeName()} startTime={seekTime()} onProgress={setSeekTime} />
        </Suspense>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-sm">Timeline</h3>
          <Timeline class="mb-1" routeName={routeName()} seekTime={seekTime} updateTime={onTimelineChange} />
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
          <h3 class="text-label-sm uppercase">Upload Files</h3>
          <div class="flex flex-col rounded-md overflow-hidden bg-surface-container-low">
            <Suspense fallback={<div class="skeleton-loader min-h-48" />}>
              <RouteUploadButtons routeName={routeName()} />
            </Suspense>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-label-sm uppercase">Route Map</h3>
          <div class="aspect-square overflow-hidden rounded-lg">
            <Suspense fallback={<div class="skeleton-loader size-full bg-surface" />}>
              <RoutePlaybackMap
                route={route()}
                currentTime={seekTime()}
                setCurrentTime={(newTime) => {
                  setSeekTime(newTime)
                  onTimelineChange(newTime)
                }}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  )
}

export default RouteActivity
