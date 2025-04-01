import { createResource, Match, Switch, Suspense, createSignal, createEffect } from 'solid-js'
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
    image.onerror = (error) => reject(new Error('Failed to load image', { cause: error }))
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
  return getPathStaticMapUrl(themeId, path, 512, 512, true)
}

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

type RouteStaticMapProps = {
  class?: string
  route?: Route
}

const RouteStaticMap: VoidComponent<RouteStaticMapProps> = (props) => {
  // const [coords] = createResource(() => props.route, getCoords)
  const [coords, setCoords] = createSignal<GPSPathPoint[] | undefined>()
  // const [url] = createResource(coords, getStaticMapUrl)
  const [url, setUrl] = createSignal<string | undefined>()
  // const [loadedUrl] = createResource(url, loadImage)
  const [loadedUrl, setLoadedUrl] = createSignal<HTMLImageElement | undefined>()

  createEffect(() => {
    const route = props.route
    if (!route) return

    getCoords(route).then(setCoords)
  })

  // Step 3: Generate map URL when coords are ready
  createEffect(() => {
    const c = coords()
    if (!c) return

    const generatedUrl = getStaticMapUrl(c)
    setUrl(generatedUrl)
  })

  // Step 4: Load image when URL is ready
  createEffect(() => {
    const u = url()
    if (!u) return

    loadImage(u).then(setLoadedUrl)
  })

  return (
    <div class={clsx('relative isolate flex h-full flex-col justify-end self-stretch bg-surface text-on-surface', props.class)}>
      <Suspense>
        <Switch>
          <Match when={!!coords.error || !!url.error || !!loadedUrl.error} keyed>
            <State trailing={<Icon name="error" filled />}>Problem loading map</State>
          </Match>
          <Match when={coords()?.length === 0} keyed>
            <State trailing={<Icon name="satellite_alt" filled />}>No GPS data</State>
          </Match>
          <Match when={url() && loadedUrl()} keyed>
            <img class="pointer-events-none size-full object-cover" src={loadedUrl()} alt="" />
          </Match>
        </Switch>
      </Suspense>
    </div>
  )
}

export default RouteStaticMap
