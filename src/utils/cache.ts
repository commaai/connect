import { Route } from '~/api/types'

const getCacheKey = (route: Route) => `${route.fullname}|${route.maxqlog}`

export const useRouteCache = <T>(fn: (route: Route) => Promise<T>): ((route: Route) => Promise<T>) => {
  const cache = new Map<string, Promise<T>>()
  return (route: Route) => {
    const key = getCacheKey(route)
    let res = cache.get(key)
    if (res) return res
    res = fn(route)
    cache.set(key, res)
    return res
  }
}
