import { createResource, Suspense } from 'solid-js'
import type { VoidComponent } from 'solid-js'
import clsx from 'clsx'

import { TimelineStatistics, getTimelineStatistics } from '~/api/derived'
import type { Route } from '~/types'
import { formatRouteDistance, formatRouteDuration } from '~/utils/date'

const formatEngagement = (timeline?: TimelineStatistics): string => {
  if (!timeline) return ''
  const { engagedDuration, duration } = timeline
  return `${(100 * (engagedDuration / duration)).toFixed(0)}%`
}

const formatUserFlags = (timeline?: TimelineStatistics): string => {
  return timeline?.userFlags.toString() ?? ''
}

type RouteStatisticsProps = {
  class?: string
  route?: Route
}

const RouteStatistics: VoidComponent<RouteStatisticsProps> = (props) => {
  const [timeline] = createResource(() => props.route, getTimelineStatistics)

  return (
    <div class={clsx('mb-[10px] flex h-[45px] w-full items-stretch gap-8 whitespace-nowrap', props.class)}>
      <div class="flex flex-col justify-between">
        <span class="text-body-sm text-on-surface-variant">Distance</span>
        <span class="font-mono text-label-lg uppercase">{formatRouteDistance(props.route)}</span>
      </div>

      <div class="flex flex-col justify-between">
        <span class="text-body-sm text-on-surface-variant">Duration</span>
        <span class="font-mono text-label-lg uppercase">{formatRouteDuration(props.route)}</span>
      </div>

      <div class="flex flex-col justify-between">
        <span class="text-body-sm text-on-surface-variant">Engaged</span>
        <Suspense>
          <span class="font-mono text-label-lg uppercase">{formatEngagement(timeline())}</span>
        </Suspense>
      </div>

      <div class="flex flex-col justify-between">
        <span class="text-body-sm text-on-surface-variant">User flags</span>
        <Suspense>
          <span class="font-mono text-label-lg uppercase">{formatUserFlags(timeline())}</span>
        </Suspense>
      </div>
    </div>
  )
}

export default RouteStatistics
