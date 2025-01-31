import { RouteSegmentsWithStats } from '~/api/derived'

export type SortKey = 'date' | 'miles' | 'duration' | 'engaged' | 'userFlags'
export type SortOrder = 'asc' | 'desc'
export interface SortOption {
  label: string
  key: SortKey
  order: SortOrder
}

export const sortRoutes = (routes: RouteSegmentsWithStats[], option: SortOption): RouteSegmentsWithStats[] => {
  console.log('Sorting routes with option:', option)

  const getSortValue = (route: RouteSegmentsWithStats, key: SortKey): number => {
    switch (key) {
      case 'date': return route.start_time_utc_millis
      case 'miles': return route.length || 0
      case 'duration': return route.timelineStatistics?.duration || 0
      case 'engaged': return route.timelineStatistics?.engagedDuration || 0
      case 'userFlags': return route.timelineStatistics?.userFlags || 0
      default: return 0
    }
  }

  console.log('First 5 routes before sorting:', routes.slice(0, 5).map(r => ({
    id: r.fullname,
    sortValue: getSortValue(r, option.key),
  })))

  const sortedRoutes = [...routes].sort((a, b) => {
    const aValue = getSortValue(a, option.key)
    const bValue = getSortValue(b, option.key)
    return option.order === 'desc' ? bValue - aValue : aValue - bValue
  })

  console.log('First 5 routes after sorting:', sortedRoutes.slice(0, 5).map(r => ({
    id: r.fullname,
    sortValue: getSortValue(r, option.key),
  })))

  return sortedRoutes
}
