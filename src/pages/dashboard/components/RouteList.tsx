import {
  createEffect,
  createSignal,
  For,
  Suspense,
  createResource,
  onCleanup,
} from 'solid-js'
import type { VoidComponent } from 'solid-js'
import clsx from 'clsx'

import type { RouteSegments } from '~/types'
import RouteCard from '~/components/RouteCard'
import RouteSorter from '~/components/RouteSorter'
import { SortOption, SortKey, sortRoutes, SortOrder } from '~/utils/sorting'
import { fetchRoutesWithStats, PAGE_SIZE, DEFAULT_DAYS } from '~/api/derived'

interface RouteSegmentsWithStats extends RouteSegments {
  timelineStatistics: {
    duration: number
    engagedDuration: number
    userFlags: number
  }
}

type RouteListProps = {
  class?: string
  dongleId: string
}

const fetchRoutes = async (dongleId: string, days: number): Promise<RouteSegmentsWithStats[]> => {
  return await fetchRoutesWithStats(dongleId, days)
}

const debounce = <F extends (...args: Parameters<F>) => void>(
  func: F,
  delay: number,
): ((...args: Parameters<F>) => void) => {
  let debounceTimeout: number
  return (...args: Parameters<F>) => {
    clearTimeout(debounceTimeout)
    debounceTimeout = window.setTimeout(() => func(...args), delay)
  }
}

const RouteList: VoidComponent<RouteListProps> = (props) => {
  const [sortOption, setSortOption] = createSignal<SortOption>({ label: 'Date', key: 'date', order: 'desc' })
  const [allRoutes, setAllRoutes] = createSignal<RouteSegmentsWithStats[]>([])
  const [sortedRoutes, setSortedRoutes] = createSignal<RouteSegmentsWithStats[]>([])
  const [days, setDays] = createSignal(DEFAULT_DAYS)
  const [hasMore, setHasMore] = createSignal(true)
  const [loading, setLoading] = createSignal(true)
  const [fetchingMore, setFetchingMore] = createSignal(false)
  let bottomRef: HTMLDivElement | undefined

  const [routesResource, { refetch }] = createResource(
    () => `${props.dongleId}-${days()}`,
    async () => {
      setLoading(true)
      const routes = await fetchRoutes(props.dongleId, days())
      setLoading(false)
      return routes
    },
  )

  createEffect(() => {
    const routes: RouteSegmentsWithStats[] = routesResource()?.map(route => ({
      ...route,
      timelineStatistics: route.timelineStatistics || { duration: 0, engagedDuration: 0, userFlags: 0 },
    })) || []

    setHasMore(routes.length >= PAGE_SIZE)

    const routeMap = new Map<string, RouteSegmentsWithStats>()
    allRoutes().forEach(route => routeMap.set(route.fullname, route))
    routes.forEach(route => routeMap.set(route.fullname, route))

    const uniqueRoutes = Array.from(routeMap.values())

    setAllRoutes(prevRoutes => {
      if (uniqueRoutes.length !== prevRoutes.length) {
        console.log('Updated allRoutes:', uniqueRoutes.length)
        return uniqueRoutes
      }
      return prevRoutes
    })

    setFetchingMore(false)
  })

  createEffect(() => {
    const routes = allRoutes()
    const currentSortOption = sortOption()
    console.log('Sorting effect triggered:', { routesCount: routes.length, currentSortOption })
    if (routes.length > 0) {
      const sorted = sortRoutes(routes, currentSortOption)
      setSortedRoutes(sorted)
      console.log('Sorted routes:', sorted.length)
    } else {
      setSortedRoutes(routes)
    }
  })

  const handleSortChange = (key: SortKey, order: SortOrder | null) => {
    if (order === null) {
      console.log('Reverting to default sort')
      setSortOption({ label: 'Date', key: 'date', order: 'desc' })
    } else {
      console.log(`Changing sort to ${key} ${order}`)
      setSortOption({ label: key.charAt(0).toUpperCase() + key.slice(1), key, order })
    }
  }

  createEffect(() => {
    const observer = new IntersectionObserver(
      debounce((entries: IntersectionObserverEntry[]) => {
        if (entries[0].isIntersecting && hasMore() && !loading() && !fetchingMore()) {
          setFetchingMore(true)
          setDays((days) => days + DEFAULT_DAYS)
          void refetch()
        }
      }, 200),
      { rootMargin: '200px' },
    )

    if (bottomRef) {
      observer.observe(bottomRef)
    }

    onCleanup(() => observer.disconnect())
  })

  return (
    <div class={clsx('flex w-full flex-col justify-items-stretch gap-4', props.class)}>
      <RouteSorter onSortChange={handleSortChange} currentSort={sortOption()} />
      <Suspense
        fallback={
          <>
            <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
            <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
            <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
          </>
        }
      >
        {loading() && allRoutes().length === 0 ? (
          <>
            <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
            <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
            <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
          </>
        ) : (
          <For each={sortedRoutes()}>
            {(route) => (
              <RouteCard route={route} sortKey={sortOption().key} />
            )}
          </For>
        )}
      </Suspense>
      <div ref={bottomRef} class="flex justify-center">
        {fetchingMore() && (
          <div class="flex h-12 items-center justify-center">
            <div class="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}
        {hasMore() && !fetchingMore() && (
          <div class="skeleton-loader elevation-1 flex h-[336px] max-w-md flex-col rounded-lg bg-surface-container-low" />
        )}
      </div>
      <div>
        {!hasMore() && sortedRoutes().length === 0 && <div>No routes found</div>}
        {!hasMore() && sortedRoutes().length > 0 && <div>All routes loaded</div>}
      </div>
    </div>
  )
}

export default RouteList
