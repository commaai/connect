import {
  createResource,
  createSignal,
  lazy,
  Suspense,
  type VoidComponent,
  createMemo,
  Show,
} from 'solid-js'

import { getRoute, getPreservedRoutes } from '~/api/route'

import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'
import RouteStaticMap from '~/components/RouteStaticMap'
import Timeline from '~/components/Timeline'
import RouteInfo from '~/components/RouteInfo'
import RouteActions from '~/components/RouteActions'
import { dayjs } from '~/utils/format'
import Icon from '~/components/material/Icon'
import clsx from 'clsx'

const RouteVideoPlayer = lazy(() => import('~/components/RouteVideoPlayer'))

type RouteActivityProps = {
  dongleId: string
  dateStr: string
}

const RouteActivity: VoidComponent<RouteActivityProps> = (props) => {
  const [seekTime, setSeekTime] = createSignal(0)
  const [expanded, setExpanded] = createSignal(false)
  const [videoRef, setVideoRef] = createSignal<HTMLVideoElement>()

  const routeName = () => `${props.dongleId}|${props.dateStr}`
  const [route] = createResource(routeName, getRoute)
  const [startTime] = createResource(route, (route) => dayjs(route.start_time)?.format('ddd, MMM D, YYYY'))
  const [isPublic] = createResource(route, (route) => route.is_public)

  const [preservedRoutes] = createResource(
    () => props.dongleId,
    getPreservedRoutes,
  )

  const isPreserved = createMemo(() => {
    try {
      const currentRoute = route()
      const preserved = preservedRoutes()

      if (!currentRoute) return undefined
      if (currentRoute.is_preserved) return true
      if (!preserved) return undefined

      return preserved.some(r => r.fullname === currentRoute.fullname)
    } catch (err) {
      console.error('Error checking preserved status:', err)
      return undefined
    }
  })

  function onTimelineChange(newTime: number) {
    const video = videoRef()
    if (video) video.currentTime = newTime
  }

  return (
    <>
      <TopAppBar leading={<IconButton class="md:hidden" href={`/${props.dongleId}`}>arrow_back</IconButton>}>
        {startTime()}
      </TopAppBar>

      <div class="flex flex-col gap-6 px-4 pb-4">
        <div class="flex flex-col">
          <Suspense
            fallback={
              <div class="skeleton-loader aspect-[241/151] rounded-lg bg-surface-container-low" />
            }
          >
            <RouteVideoPlayer ref={setVideoRef} routeName={routeName()} onProgress={setSeekTime} />
          </Suspense>
          <Timeline
            routeName={routeName()}
            seekTime={seekTime}
            updateTime={onTimelineChange}
          />
        </div>

        <div class="flex flex-col">
          <h3 class="mb-2 text-label-sm uppercase">Route Info</h3>
          <Suspense fallback={<div class="h-10" />}>
            <RouteInfo route={route()} />
          </Suspense>

          <Show when={expanded()}>
            <Suspense fallback={<div class="skeleton-loader min-h-80 rounded-lg bg-surface-container-low" />}>
              <RouteActions
                routeName={routeName()}
                initialPublic={isPublic()}
                initialPreserved={isPreserved()}
                isPublic={isPublic}
                isPreserved={isPreserved}
              />
            </Suspense>
          </Show>

          <button
            class={clsx(
              'flex w-full cursor-pointer justify-center p-2 hover:bg-black/45',
              expanded() 
                ? 'rounded-b-md border-2 border-t-0 border-surface-container-high bg-surface-container-lowest'
                : 'rounded-b-md bg-surface-container-lowest',
            )}
            onClick={() => setExpanded(prev => !prev)}
          >
            <Icon class={expanded() ? 'text-yellow-400' : 'text-zinc-500'}>
              {expanded() ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
            </Icon>
          </button>
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
