/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  createEffect,
  createSignal,
  For,
  onMount,
  Suspense,
} from 'solid-js'
import type { VoidComponent } from 'solid-js'
import clsx from 'clsx'

import type { RouteSegments } from '~/types'

import RouteCard from '~/components/RouteCard'
import { fetcher } from '~/api'
import Button from '~/components/material/Button'

const PAGE_SIZE = 3

type RouteListProps = {
  class?: string
  dongleId: string
}

const RouteList: VoidComponent<RouteListProps> = (props) => {
  const endpoint = () => `/v1/devices/${props.dongleId}/routes_segments?limit=${PAGE_SIZE}`
  const getKey = (previousPageData?: RouteSegments[]): string | undefined => {
    if (!previousPageData) return endpoint()
    if (previousPageData.length === 0) return undefined
    const lastSegmentEndTime = previousPageData.at(-1)!.end_time_utc_millis
    return `${endpoint()}&end=${lastSegmentEndTime - 1}`
  }
  const getPage = async (page: number): Promise<RouteSegments[]> => {
    const previousPageData = page > 0 ? await getPage(page - 1) : undefined
    const key = getKey(previousPageData)
    return key ? fetcher<RouteSegments[]>(key) : []
  }

  const [size, setSize] = createSignal(1)
  const [sortedRoutes, setSortedRoutes] = createSignal<RouteSegments[]>([])

  const sortByCreateTime = (routes: RouteSegments[]) => routes.sort((a, b) => a.create_time - b.create_time)

  const onLoadMore = async () => {
    const nextPageData = await getPage(size())
    setSize(size() + 1)
    setSortedRoutes((prev) => sortByCreateTime([...prev, ...nextPageData]))
  }

  const fetchInitialData = async() => setSortedRoutes(sortByCreateTime(await getPage(0)))

  onMount(() => fetchInitialData())

  createEffect(() => {
    if (props.dongleId) {
      setSize(1)
      setSortedRoutes([])
      void fetchInitialData()
    }
  })

  return (
    <div
      class={clsx(
        'flex w-full flex-col justify-items-stretch gap-4',
        props.class,
      )}
    >
      <Suspense
        fallback={
          <>
            <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
            <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
            <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
          </>
        }
      >
        <For each={sortedRoutes()}>
          {(route) => <RouteCard route={route} />}
        </For>
      </Suspense>
      <div class="flex justify-center">
        <Button onClick={onLoadMore}>Load more</Button>
      </div>
    </div>
  )
}

export default RouteList
