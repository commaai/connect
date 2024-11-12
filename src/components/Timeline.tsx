import { For, createResource, Show, Suspense } from 'solid-js'
import type { Component } from 'solid-js'
import clsx from 'clsx'

import { TimelineEvent, getTimelineEvents } from '~/api/derived'
import type { Route } from '~/types'
import { getRouteDuration } from '~/utils/date'

function renderTimelineEvents(
  route: Route | undefined,
  events: TimelineEvent[],
) {
  if (!route) return null

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
            classes = 'bg-yellow-500  min-w-[2px]'
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

// TODO: align to first camera frame event
function renderMarker(route: Route | undefined, seekTime: number | undefined) {
  if (!route) return null
  if (seekTime === undefined) return null

  const duration = getRouteDuration(route)?.asSeconds() ?? 0
  const offsetPct = (seekTime / duration) * 100
  return (
    <div
      class="absolute top-0 z-10 h-full"
      style={{
        'background-color': 'rgba(255,255,255,0.7)',
        width: '3px',
        left: `${offsetPct}%`,
      }}
    />
  )
}

interface TimelineProps {
  route: Route | undefined
  class?: string
  seekTime?: number
  rounded?: string
}

const Timeline: Component<TimelineProps> = (props) => {
  const route = () => props.route
  const [events] = createResource(route, getTimelineEvents)

  return (
    <div
      class={clsx(
        `relative isolate flex h-3.5 self-stretch overflow-hidden ${props.rounded} bg-blue-900`,
        'after:absolute after:inset-0 after:bg-gradient-to-b after:from-[rgba(0,0,0,0)] after:via-[rgba(0,0,0,0.1)] after:to-[rgba(0,0,0,0.2)]',
        props.class,
      )}
      title="Disengaged"
    >
      <Suspense fallback={<div class="skeleton-loader size-full" />}>
        <Show when={route()} keyed>
          {(route: Route | undefined) => (
            <>
              <Show when={events()} keyed>
                {(events: TimelineEvent[]) => renderTimelineEvents(route, events)}
              </Show>
              {renderMarker(route, props.seekTime)}
            </>
          )}
        </Show>
      </Suspense>
    </div>
  )
}

export default Timeline
