import { Show, Suspense, type VoidComponent } from 'solid-js'
import dayjs from 'dayjs'

import Avatar from '~/components/material/Avatar'
import Card, { CardContent, CardHeader } from '~/components/material/Card'
import Icon from '~/components/material/Icon'
import RouteStaticMap from '~/components/RouteStaticMap'
import RouteStatistics from '~/components/RouteStatistics'

import type { RouteSegments } from '~/types'
import { hasValidEndTime } from '~/utils/date'

const RouteHeader: VoidComponent<{ route: RouteSegments }> = (props) => {
  // Each of these is now a tiny reactive getter:
  const hasEnd = () => hasValidEndTime(props.route)
  const startTime = () => dayjs(props.route.start_time_utc_millis)
  const endTime = () => dayjs(props.route.end_time_utc_millis)

  const headline = () => startTime().format('ddd, MMM D, YYYY')
  const subhead = () => `${startTime().format('h:mm A')} to ${endTime().format('h:mm A')}`

  return (
    <Show
      when={hasEnd()}
      fallback={
        <CardHeader
          leading={
            <Avatar>
              <Icon>directions_car</Icon>
            </Avatar>
          }
        />
      }
    >
      <CardHeader
        headline={headline()}
        subhead={subhead()}
        leading={
          <Avatar>
            <Icon>directions_car</Icon>
          </Avatar>
        }
      />
    </Show>
  )
}

interface RouteCardProps {
  route: RouteSegments
}

const RouteCard: VoidComponent<RouteCardProps> = (props) => {
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
      </CardContent>
    </Card>
  )
}

export default RouteCard
