import { For, createResource, createSignal, createEffect, createMemo, Show, Suspense } from 'solid-js'
import type { VoidComponent, Accessor } from 'solid-js'
import clsx from 'clsx'

import { TimelineEvent, getTimelineEvents } from '~/api/derived'
import type { Route } from '~/types'
import { getRouteDuration } from '~/utils/format'

function renderTimelineEvents(route: Route, events: TimelineEvent[]) {
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

interface TimelineProps {
  class?: string
  routeName: string
  route: Accessor<Route | undefined>
  seekTime: Accessor<number>
  updateTime: (newTime: number) => void
}

const Timeline: VoidComponent<TimelineProps> = (props) => {
  const [events] = createResource(props.route, getTimelineEvents)
  // TODO: align to first camera frame event
  const [markerOffsetPct, setMarkerOffsetPct] = createSignal(0)
  const duration = createMemo(() => (props.route() ? (getRouteDuration(props.route()!)?.asSeconds() ?? 0) : 0))

  let ref: HTMLDivElement
  let handledTouchStart = false

  function updateMarker(clientX: number, rect: DOMRect) {
    const x = clientX - rect.left
    const fraction = x / rect.width
    // Update marker immediately without waiting for video
    setMarkerOffsetPct(fraction * 100)
    const newTime = duration() * fraction
    props.updateTime(newTime)
  }

  function onMouseDownOrTouchStart(ev: MouseEvent | TouchEvent) {
    if (handledTouchStart || !props.route()) return

    const rect = ref.getBoundingClientRect()

    if (ev.type === 'mousedown') {
      ev = ev as MouseEvent
      updateMarker(ev.clientX, rect)
      const onMove = (moveEv: MouseEvent) => {
        updateMarker(moveEv.clientX, rect)
      }
      const onUpOrLeave = () => {
        ref.removeEventListener('mousemove', onMove)
        ref.removeEventListener('mouseup', onUpOrLeave)
        ref.removeEventListener('mouseleave', onUpOrLeave)
      }
      ref.addEventListener('mousemove', onMove)
      ref.addEventListener('mouseup', onUpOrLeave)
      ref.addEventListener('mouseleave', onUpOrLeave)
    } else {
      ev = ev as TouchEvent
      if (ev.touches.length === 1) {
        updateMarker(ev.touches[0].clientX, rect)
      }
    }
  }

  createEffect(() => {
    setMarkerOffsetPct((props.seekTime() / duration()) * 100)
  })

  return (
    <div
      ref={ref!}
      class={clsx(
        'relative isolate flex h-6 cursor-pointer touch-none self-stretch overflow-hidden rounded-sm bg-blue-900',
        'after:absolute after:inset-0 after:bg-gradient-to-b after:from-[rgba(0,0,0,0)] after:via-[rgba(0,0,0,0.1)] after:to-[rgba(0,0,0,0.2)]',
        props.class,
      )}
      title="Disengaged"
      onMouseDown={onMouseDownOrTouchStart}
      onTouchStart={(ev) => {
        handledTouchStart = false
        onMouseDownOrTouchStart(ev)
        handledTouchStart = true
      }}
      onTouchMove={(ev) => {
        if (ev.touches.length !== 1 || !props.route()) return
        const rect = ref.getBoundingClientRect()
        updateMarker(ev.touches[0].clientX, rect)
      }}
    >
      <Suspense fallback={<div class="skeleton-loader size-full" />}>
        <Show when={props.route()} keyed>
          {(route) => (
            <>
              <Show when={events()} keyed>
                {(events) => renderTimelineEvents(route, events)}
              </Show>
              <div
                class="absolute top-0 z-10 h-full"
                style={{
                  'background-color': 'rgba(255,255,255,0.7)',
                  width: '3px',
                  left: `${markerOffsetPct()}%`,
                }}
              />
            </>
          )}
        </Show>
      </Suspense>
    </div>
  )
}

export default Timeline
