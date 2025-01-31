import { Suspense, type VoidComponent } from 'solid-js'

import Card, { CardContent } from '~/components/material/Card'
import RouteStaticMap from '~/components/RouteStaticMap'
import RouteStatistics from '~/components/RouteStatistics'

import type { RouteSegments } from '~/types'

interface RouteCardProps {
  route: RouteSegments
}

const RouteCard: VoidComponent<RouteCardProps> = (props) => {
  return (
    <Card href={`/${props.route.dongle_id}/${props.route.fullname.slice(17)}`}>
      <div class="mx-2 mt-4 h-48 overflow-hidden rounded-lg">
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
