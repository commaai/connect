import { createResource, Match, Switch } from 'solid-js'
import type { JSXElement, VoidComponent } from 'solid-js'
import clsx from 'clsx'

import { GPSPathPoint, getCoords } from '~/api/derived'
import { Coords, getPathStaticMapUrl } from '~/map'
import { getThemeId } from '~/theme'
import type { Route } from '~/types'

import Icon from '~/components/material/Icon'

const loadImage = (url: string | undefined): Promise<string | undefined> => {
  if (!url) {
    return Promise.resolve(undefined)
  }
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.src = url
    image.onload = () => resolve(url)
    image.onerror = (error) => reject(error)
  })
}

const getStaticMapUrl = (gpsPoints: GPSPathPoint[]): string | undefined => {
  if (gpsPoints.length === 0) {
    return undefined
  }

  const path: Coords = []
  gpsPoints.forEach(({ lng, lat }) => {
    path.push([lng, lat])
  })
  const themeId = getThemeId()

  return getPathStaticMapUrl(themeId, path, 380, 192, true)
}

const State = (props: {
  children: JSXElement
  trailing?: JSXElement
  opaque?: boolean
}) => {
  return (
    <div
      class={clsx(
        'absolute flex h-[192px] w-full items-center justify-center gap-2',
        props.opaque && 'bg-surface text-on-surface',
      )}
    >
      <span class="text-label-sm">{props.children}</span>
      {props.trailing}
    </div>
  )
}

type RouteStaticMapProps = {
  class?: string
  route: Route | undefined
}

const RouteStaticMap: VoidComponent<RouteStaticMapProps> = (props) => {
  const [coords] = createResource(() => props.route, getCoords)
  const [url] = createResource(coords, getStaticMapUrl)
  const [loadedUrl] = createResource(url, loadImage)

  return (
    <div
      class={clsx(
        'flex size-full flex-col',
        props.class,
      )}
    >
      <Switch>
        <Match when={!!coords.error || !!url.error || !!loadedUrl.error} keyed>
          <State trailing={<Icon filled>error</Icon>}>
            Problem loading map
          </State>
        </Match>
        <Match when={coords()?.length === 0} keyed>
          <State trailing={<Icon filled>satellite_alt</Icon>}>
            No GPS data
          </State>
        </Match>
        <Match when={url() && loadedUrl()} keyed>
          <img
            class="pointer-events-none size-full rounded-t-lg object-contain md:rounded-none md:rounded-l-lg"
            src={loadedUrl()}
            alt=""
          />
        </Match>
      </Switch>
    </div>
  )
}

export default RouteStaticMap
