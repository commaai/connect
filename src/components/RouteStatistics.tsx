import { createResource } from 'solid-js'
import type { VoidComponent } from 'solid-js'

import { TimelineStatistics, getTimelineStatistics } from '~/api/derived'
import type { Route } from '~/types'
import { formatDistance, formatRouteDuration } from '~/utils/format'
import StatisticBar from './StatisticBar'

const formatEngagement = (timeline?: TimelineStatistics): string | undefined => {
  if (!timeline) return undefined
  const { engagedDuration, duration } = timeline
  return `${(100 * (engagedDuration / duration)).toFixed(0)}%`
}

const RouteStatistics: VoidComponent<{ class?: string; route: Route | undefined }> = (props) => {
  const [timeline] = createResource(() => props.route, getTimelineStatistics)

  return (
    <StatisticBar
      class={props.class}
      statistics={[
        { label: 'Distance', value: () => formatDistance(props.route?.length) },
        { label: 'Duration', value: () => formatRouteDuration(props.route) },
        { label: 'Engaged', value: () => formatEngagement(timeline()) },
      ]}
    />
  )
}

export default RouteStatistics
