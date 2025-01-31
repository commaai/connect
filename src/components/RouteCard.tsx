import { Suspense, type VoidComponent } from 'solid-js'
import dayjs from 'dayjs'

import Avatar from '~/components/material/Avatar'
import Card, { CardContent, CardHeader } from '~/components/material/Card'
import Icon from '~/components/material/Icon'
import RouteStaticMap from '~/components/RouteStaticMap'
import RouteStatistics from '~/components/RouteStatistics'
import { formatRouteDistance, formatRouteDuration } from '~/utils/date'
import type { RouteSegments } from '~/types'
import type { SortKey } from '~/utils/sorting'

const RouteHeader = (props: { route: RouteSegments }) => {
  const startTime = () => dayjs(props.route.start_time_utc_millis)
  const endTime = () => dayjs(props.route.end_time_utc_millis)

  const headline = () => startTime().format('ddd, MMM D, YYYY')
  const subhead = () => `${startTime().format('h:mm A')} to ${endTime().format('h:mm A')}`

  return (
    <CardHeader
      headline={headline()}
      subhead={subhead()}
      leading={
        <Avatar>
          <Icon>directions_car</Icon>
        </Avatar>
      }
    />
  )
}

interface RouteCardProps {
  route: RouteSegments & { timelineStatistics?: { duration: number, engagedDuration: number, userFlags: number } }
  sortKey: SortKey
}

const RouteCard: VoidComponent<RouteCardProps> = (props) => {
  const getSortedValue = () => {
    switch (props.sortKey) {
      case 'date':
        return dayjs(props.route.start_time_utc_millis).format('YYYY-MM-DD HH:mm:ss')
      case 'miles':
        return formatRouteDistance(props.route)
      case 'duration':
        return formatRouteDuration(props.route)
      case 'engaged':
        return props.route.timelineStatistics ? 
          `${((props.route.timelineStatistics.engagedDuration / props.route.timelineStatistics.duration) * 100).toFixed(2)}%` : 
          'N/A'
      case 'userFlags':
        return props.route.timelineStatistics?.userFlags.toString() || 'N/A'
      default:
        return 'N/A'
    }
  }

  return (
    <Card href={`/${props.route.dongle_id}/${props.route.fullname.slice(17)}`}>
      <RouteHeader route={props.route} />

      <div class="mx-2 h-48 overflow-hidden rounded-lg">
        <Suspense
          fallback={<div class="skeleton-loader size-full bg-surface" />}
        >
          <RouteStaticMap route={props.route} />
        </Suspense>
      </div>

      <CardContent>
        <RouteStatistics route={props.route} />
        <div class="mt-2 text-sm font-bold text-primary">
          {props.sortKey}: {getSortedValue()}
        </div>
      </CardContent>
    </Card>
  )
}

export default RouteCard
