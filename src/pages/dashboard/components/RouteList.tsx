import { createEffect, createResource, createSignal, For, Index, onCleanup, onMount, Show, Suspense, type VoidComponent } from 'solid-js'
import dayjs from 'dayjs'

import { fetcher } from '~/api'
import { getTimelineStatistics } from '~/api/derived'
import Card, { CardContent, CardHeader } from '~/components/material/Card'
import Icon from '~/components/material/Icon'
import RouteStatistics from '~/components/RouteStatistics'
import { getPlaceName } from '~/map/geocode'
import type { Route } from '~/types'

interface RouteCardProps {
  route: Route
}

const RouteCard: VoidComponent<RouteCardProps> = (props) => {
  const startTime = () => dayjs(props.route.start_time)
  const endTime = () => dayjs(props.route.end_time)
  const startPosition = () => [props.route.start_lng || 0, props.route.start_lat || 0] as number[]
  const endPosition = () => [props.route.end_lng || 0, props.route.end_lat || 0] as number[]
  const [startPlace] = createResource(startPosition, getPlaceName)
  const [endPlace] = createResource(endPosition, getPlaceName)
  const [timeline] = createResource(() => props.route, getTimelineStatistics)
  const [location] = createResource(
    () => [startPlace(), endPlace()],
    ([startPlace, endPlace]) => {
      if (!startPlace && !endPlace) return ''
      if (!endPlace || startPlace === endPlace) return startPlace
      if (!startPlace) return endPlace
      return `${startPlace} to ${endPlace}`
    },
  )

  return (
    <Card class="max-w-none" href={`/${props.route.dongle_id}/${props.route.fullname.slice(17)}`} activeClass="md:before:bg-primary">
      <CardHeader
        headline={
          <div class="flex gap-2">
            <span>{startTime().format('ddd, MMM D, YYYY')}</span>&middot;
            <span>
              {startTime().format('h:mm A')} to {endTime().format('h:mm A')}
            </span>
          </div>
        }
        subhead={location()}
        trailing={
          <Suspense>
            <Show when={timeline()?.userFlags}>
              <div class="flex items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-900 p-2 border border-amber-300 shadow-inner shadow-black/20">
                <Icon class="text-yellow-300" size="20" name="flag" filled />
              </div>
            </Show>
          </Suspense>
        }
      />

      <CardContent>
        <RouteStatistics route={props.route} />
      </CardContent>
    </Card>
  )
}

const PAGE_SIZE = 10

const RouteList: VoidComponent<{ dongleId: string }> = (props) => {
  const endpoint = () => `/v1/devices/${props.dongleId}/routes?limit=${PAGE_SIZE}`
  const getKey = (previousPageData?: Route[]): string | undefined => {
    if (!previousPageData) return endpoint()
    if (previousPageData.length === 0) return undefined
    return `${endpoint()}&created_before=${previousPageData.at(-1)!.create_time}`
  }
  const getPage = (page: number): Promise<Route[]> => {
    if (pages[page] === undefined) {
      pages[page] = (async () => {
        const previousPageData = page > 0 ? await getPage(page - 1) : undefined
        const key = getKey(previousPageData)
        return key ? fetcher<Route[]>(key) : []
      })()
    }
    return pages[page]
  }

  const pages: Promise<Route[]>[] = []
  const [size, setSize] = createSignal(1)
  const pageNumbers = () => Array.from({ length: size() })

  createEffect(() => {
    if (props.dongleId) {
      pages.length = 0
      setSize(1)
    }
  })

  const [sentinel, setSentinel] = createSignal<HTMLDivElement>()
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        setSize((prev) => prev + 1)
      }
    },
    { threshold: 0.1 },
  )
  onMount(() => {
    const sentinelEl = sentinel()
    if (sentinelEl) {
      observer.observe(sentinelEl)
    }
  })
  onCleanup(() => observer.disconnect())

  return (
    <div class="flex w-full flex-col justify-items-stretch gap-4">
      <For each={pageNumbers()}>
        {(_, i) => {
          const [routes] = createResource(() => i(), getPage)
          return (
            <Suspense
              fallback={
                <Index each={new Array(PAGE_SIZE)}>{() => <div class="skeleton-loader flex h-[140px] flex-col rounded-lg" />}</Index>
              }
            >
              <For each={routes()}>{(route) => <RouteCard route={route} />}</For>
            </Suspense>
          )
        }}
      </For>
      <div ref={setSentinel} class="h-10 w-full" />
    </div>
  )
}

export default RouteList
