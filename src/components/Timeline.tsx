import { For, createSignal, createEffect, onMount, onCleanup, Suspense } from 'solid-js'
import type { VoidComponent } from 'solid-js'
import clsx from 'clsx'

import type { TimelineEvent } from '~/api/derived'
import type { Route } from '~/api/types'
import { getRouteDuration } from '~/utils/format'

function renderTimelineEvents(route: Route | undefined, events: TimelineEvent[]) {
  if (!route) return
  const duration = getRouteDuration(route)?.asMilliseconds() ?? 0
  return (
    <For each={events}>
      {(event) => {
        let left = ''
        let width = ''
        switch (event.type) {
          case 'engaged':
          case 'overriding':
          case 'alert': {
            const { route_offset_millis, end_route_offset_millis } = event
            const offsetPct = (route_offset_millis / duration) * 100
            const endOffsetPct = (end_route_offset_millis / duration) * 100
            const widthPct = endOffsetPct - offsetPct

            left = `${offsetPct}%`
            width = `${widthPct}%`
            break
          }
          case 'user_flag': {
            const { route_offset_millis } = event
            const offsetPct = (route_offset_millis / duration) * 100
            const widthPct = (1000 / duration) * 100

            left = `${offsetPct}%`
            width = `${widthPct}%`
            break
          }
        }

        let classes = ''
        let title = ''
        switch (event.type) {
          case 'engaged':
            title = 'Engaged'
            classes = 'bg-green-800 min-w-[1px]'
            break
          case 'overriding':
            title = 'Overriding'
            classes = 'bg-gray-500 min-w-[1px]'
            break
          case 'alert':
            if (event.alertStatus === 1) {
              title = 'User prompt alert'
              classes = 'bg-amber-600'
            } else {
              title = 'Critical alert'
              classes = 'bg-red-600'
            }
            classes += ' min-w-[2px]'
            break
          case 'user_flag':
            title = 'User flag'
            classes = 'bg-yellow-500 min-w-[2px]'
        }

        const zIndex = {
          engaged: '1',
          overriding: '2',
          alert: '3',
          user_flag: '4',
        }[event.type]

        return (
          <div
            title={title}
            class={clsx('absolute top-0 h-full', classes)}
            style={{
              left,
              width,
              'z-index': zIndex,
            }}
          />
        )
      }}
    </For>
  )
}

const MARKER_WIDTH = 3

interface TimelineProps {
  class?: string
  route: Route | undefined
  seekTime: number
  updateTime: (time: number) => void
  events: TimelineEvent[]
}

const Timeline: VoidComponent<TimelineProps> = (props) => {
  // TODO: align to first camera frame event
  const [markerOffsetPct, setMarkerOffsetPct] = createSignal(0)
  const duration = () => getRouteDuration(props.route)?.asSeconds() ?? 0

  let ref!: HTMLDivElement

  onMount(() => {
    const updateMarker = (clientX: number) => {
      const rect = ref.getBoundingClientRect()
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
      const fraction = x / rect.width
      // Update marker immediately without waiting for video
      setMarkerOffsetPct(fraction * 100)
      props.updateTime(duration() * fraction)
    }

    const onStart = () => {
      const onMouseMove = (ev: MouseEvent) => {
        updateMarker(ev.clientX)
      }
      const onTouchMove = (ev: TouchEvent) => {
        if (ev.touches.length !== 1) return
        updateMarker(ev.touches[0].clientX)
      }
      const onStop = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('touchmove', onTouchMove)
        window.removeEventListener('mouseup', onStop)
        window.removeEventListener('touchend', onStop)
        window.removeEventListener('touchcancel', onStop)
      }
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('touchmove', onTouchMove)
      window.addEventListener('mouseup', onStop)
      window.addEventListener('touchend', onStop)
      window.addEventListener('touchcancel', onStop)
    }

    const onMouseDown = (ev: MouseEvent) => {
      if (!props.route) return
      updateMarker(ev.clientX)
      onStart()
    }

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1 || !props.route) return
      updateMarker(ev.touches[0].clientX)
      onStart()
    }

    ref.addEventListener('mousedown', onMouseDown)
    ref.addEventListener('touchstart', onTouchStart)
    onCleanup(() => {
      ref.removeEventListener('mousedown', onMouseDown)
      ref.removeEventListener('touchstart', onTouchStart)
    })
  })

  createEffect(() => {
    if (duration() === 0) setMarkerOffsetPct(0)
    else setMarkerOffsetPct((props.seekTime / duration()) * 100)
  })

  return (
    <div class="flex flex-col">
      <div class="h-1 bg-surface-container-high">
        <div class="h-full bg-white" style={{ width: `calc(${markerOffsetPct()}% + 1px)` }} />
      </div>
      <div
        ref={ref!}
        class={clsx(
          'relative isolate flex h-8 cursor-pointer touch-none self-stretch rounded-b-md bg-blue-900',
          'after:absolute after:inset-0 after:rounded-b-md after:bg-gradient-to-b after:from-black/0 after:via-black/10 after:to-black/30',
          props.class,
        )}
        title="Disengaged"
      >
        <div class="absolute inset-0 size-full rounded-b-md overflow-hidden">
          <Suspense fallback={<div class="skeleton-loader size-full" />}>{renderTimelineEvents(props.route, props.events)}</Suspense>
        </div>
        <div
          class="absolute top-0 z-10 h-full"
          style={{
            width: `${MARKER_WIDTH}px`,
            left: `${markerOffsetPct()}%`,
          }}
        >
          <div class="absolute inset-x-0 h-full w-px bg-white" />
          <div class="absolute -bottom-1.5 left-1/2 -translate-x-[calc(50%+1px)]">
            <div class="size-0 border-x-8 border-b-[12px] border-x-transparent border-b-white" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Timeline
