import type { VoidComponent } from 'solid-js'
import clsx from 'clsx'
import type { Route } from '~/types'
import RouteStatistics from './RouteStatistics'

type RouteInfoProps = {
  class?: string
  route?: Route
}

const RouteInfo: VoidComponent<RouteInfoProps> = (props) => {
  return (
    <div class={clsx('flex flex-col rounded-t-md bg-surface-container-low p-5', props.class)}>
      <RouteStatistics route={props.route} />
    </div>
  )
}

export default RouteInfo 
