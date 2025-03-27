import { createMemo, createResource, Match, Switch } from 'solid-js'
import type { Accessor, JSXElement, VoidComponent } from 'solid-js'
import clsx from 'clsx'

import { getCoords } from '~/api/derived'
import { getThemeId } from '~/theme'
import type { Route } from '~/types'

import Icon from '~/components/material/Icon'
import { PathMap } from '~/components/PathMap'
import { getRouteDuration } from '~/utils/format'

const State = (props: {
  children: JSXElement
  trailing?: JSXElement
  opaque?: boolean
}) => {
  return (
    <div class={clsx('absolute flex size-full items-center justify-center gap-2', props.opaque && 'bg-surface text-on-surface')}>
      <span class="text-label-sm">{props.children}</span>
      {props.trailing}
    </div>
  )
}

type RouteDynamicMapProps = {
  class?: string
  route: Route | undefined
  routeName: string
  seekTime: Accessor<number>
  updateTime: (newTime: number) => void
}

const RouteDynamicMap: VoidComponent<RouteDynamicMapProps> = (props) => {
  const [coords] = createResource(() => props.route, getCoords)
  const duration = createMemo(() => (props.route ? (getRouteDuration(props.route!)?.asSeconds() ?? 0) : 0))
  const themeId = getThemeId()

  return (
    <div class={clsx('relative isolate flex h-full flex-col justify-end self-stretch bg-surface text-on-surface', props.class)}>
      <Switch>
        <Match when={coords() === undefined || coords()?.length === 0} keyed>
          <State trailing={<Icon name="satellite_alt" filled />}>No GPS data</State>
        </Match>
        <Match when={(coords()?.length ?? 0) > 0} keyed>
          <PathMap
            themeId={themeId}
            seekTime={props.seekTime}
            duration={duration}
            coords={coords()!}
            updateTime={props.updateTime}
            hidpi={true}
          />
        </Match>
      </Switch>
    </div>
  )
}

export default RouteDynamicMap
