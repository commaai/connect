/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  createEffect,
  createResource,
  createSignal,
  For,
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

const pages: Promise<RouteSegments[]>[] = []

const RouteList: VoidComponent<RouteListProps> = (props) => {
  const endpoint = () => `/v1/devices/${props.dongleId}/routes_segments?limit=${PAGE_SIZE}`
  
  const getKey = (previousPageData?: RouteSegments[]): string | undefined => {
    if (!previousPageData) return endpoint()
    if (previousPageData.length === 0) return undefined
    const lastSegment = previousPageData.at(-1)
    if (lastSegment && lastSegment.end_time_utc_millis !== undefined) {
      const lastSegmentEndTime = lastSegment.end_time_utc_millis
      return `${endpoint()}&end=${lastSegmentEndTime - 1}`
    }
    return undefined
  }

  const getPage = (page: number): Promise<RouteSegments[]> => {
    if (!pages[page]) {
      // eslint-disable-next-line no-async-promise-executor
      pages[page] = new Promise(async (resolve) => {
        const previousPageData = page > 0 ? await getPage(page - 1) : undefined
        const key = getKey(previousPageData)
        resolve(key ? fetcher<RouteSegments[]>(key) : [])
      })
    }
    return pages[page]
  }

  createEffect(() => {
    if (props.dongleId) {
      pages.length = 0
      setSize(1)
    }
  })

  const [size, setSize] = createSignal(1)
  const onLoadMore = () => setSize(size() + 1)
  const pageNumbers = () => Array.from(Array(size()).keys())

  return (
    <div
      class={clsx(
        'flex w-full flex-col justify-items-stretch gap-4',
        props.class,
      )}
    >
      <For each={pageNumbers()}>
        {(i) => {
          const [routes] = createResource(() => i, getPage)
          return (
            <Suspense
              fallback={
                <>
                  <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
                  <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
                  <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
                </>
              }
            >
              <For each={routes()}>
                {(route) => <RouteCard route={route} />}
              </For>
            </Suspense>
          )
        }}
      </For>
      <div class="flex justify-center">
        <Button onClick={onLoadMore}>Load more</Button>
      </div>
    </div>
  )
}

export default RouteList
