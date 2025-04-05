import { Show, createEffect, createResource, createSignal, Suspense, type VoidComponent } from 'solid-js'

import { setRouteViewed } from '~/api/athena'
import { getProfile } from '~/api/profile'
import { currentDevice, currentRoute, currentEvents } from '~/store'
import { dayjs } from '~/utils/format'

import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'
import RouteActions from '~/components/RouteActions'
import RouteStaticMap from '~/components/RouteStaticMap'
import RouteStatistics from '~/components/RouteStatistics'
import RouteVideoPlayer from '~/components/RouteVideoPlayer'
import RouteUploadButtons from '~/components/RouteUploadButtons'
import Timeline from '~/components/Timeline'
import { generateTimelineStatistics } from '~/api/derived'
import { A } from '@solidjs/router'

type RouteActivityProps = {
  dateStr: string // TODO: move to route
  startTime: number
  endTime: number | undefined
}

const RouteActivity: VoidComponent<RouteActivityProps> = (props) => {
  const [seekTime, setSeekTime] = createSignal(props.startTime)
  const [videoRef, setVideoRef] = createSignal<HTMLVideoElement>()

  const [startTime] = createResource(() => dayjs(currentRoute()?.start_time)?.format('ddd, MMM D, YYYY'))

  const selection = () => ({ startTime: props.startTime, endTime: props.endTime })

  const [timeline] = createResource(
    () => [currentRoute(), currentEvents()] as const,
    ([r, e]) => generateTimelineStatistics(r, e),
  )

  const onTimelineChange = (newTime: number) => {
    const video = videoRef()
    if (video) video.currentTime = newTime
  }

  createEffect(() => {
    currentRoute()
    setSeekTime(props.startTime)
    onTimelineChange(props.startTime)
  })

  const [profile] = createResource(getProfile)
  createResource(
    () => [currentDevice(), profile(), props.dateStr] as const,
    async ([device, profile, dateStr]) => {
      if (!device || !profile || (!device.is_owner && !profile.superuser)) return
      await setRouteViewed(device.dongle_id, dateStr)
    },
  )

  return (
    <>
      <TopAppBar leading={<IconButton class="md:hidden" name="arrow_back" href={`/${currentDevice()?.dongle_id}`} />}>
        {startTime()}
      </TopAppBar>

      <div class="flex flex-col gap-6 px-4 pb-4">
        <div class="flex flex-col">
          <RouteVideoPlayer ref={setVideoRef} selection={selection()} onProgress={setSeekTime} />
          <Timeline class="mb-1" seekTime={seekTime()} updateTime={onTimelineChange} events={currentEvents()} />

          <Show when={selection().startTime || selection().endTime}>
            <A class="flex items-center justify-center text-center text-label-lg text-gray-500 mt-4" href={`/${currentRoute()?.fullname}`}>
              Clear current route selection
              <IconButton name="close_small" />
            </A>
          </Show>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-label-md uppercase">Route Info</span>
          <div class="flex flex-col rounded-md overflow-hidden bg-surface-container">
            <RouteStatistics class="p-5" timeline={timeline()} />

            <RouteActions />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-label-md uppercase">Upload Files</span>
          <div class="flex flex-col rounded-md overflow-hidden bg-surface-container">
            <RouteUploadButtons />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-label-md uppercase">Route Map</span>
          <div class="aspect-square overflow-hidden rounded-lg">
            <Suspense fallback={<div class="h-full w-full skeleton-loader bg-surface-container" />}>
              <RouteStaticMap />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  )
}

export default RouteActivity
