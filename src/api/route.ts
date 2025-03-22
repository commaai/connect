import type { Route, RouteInfo, RouteShareSignature, RouteWithSegments } from '~/types'

import { fetcher } from '.'
import { BASE_URL } from './config'

export const parseRouteName = (routeName: string): RouteInfo => ({ dongleId: routeName.split('|')[0], routeId: routeName.split('|')[1] })
export const getRoute = (routeName: Route['fullname']): Promise<Route> =>
  fetcher<Route>(`/v1/route/${routeName}/`)

export const getRouteWithSegments = async (routeName: Route['fullname']) => {
  const { dongleId } = parseRouteName(routeName)
  const routes = await fetcher<RouteWithSegments[]>(`/v1/devices/${dongleId}/routes_segments?${new URLSearchParams({ route_str: routeName }).toString()}`)
  if (routes.length === 0) {
    throw new Error('route does not exist')
  }
  return routes[0]
}

export const getRouteShareSignature = (routeName: string): Promise<RouteShareSignature> =>
  fetcher(`/v1/route/${routeName}/share_signature`)

export const createQCameraStreamUrl = (
  routeName: Route['fullname'],
  signature: RouteShareSignature,
): string =>
  `${BASE_URL}/v1/route/${routeName}/qcamera.m3u8?${new URLSearchParams(signature).toString()}`

export const getQCameraStreamUrl = (routeName: Route['fullname']): Promise<string> =>
  getRouteShareSignature(routeName).then((signature) =>
    createQCameraStreamUrl(routeName, signature),
  )

export const setRoutePublic = (routeName: string, isPublic: boolean): Promise<Route> =>
  fetcher<Route>(`/v1/route/${routeName}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ is_public: isPublic }),
  })

export const getPreservedRoutes = (dongleId: string): Promise<Route[]> =>
  fetcher<Route[]>(`/v1/devices/${dongleId}/routes/preserved`)

export const setRoutePreserved = (routeName: string, preserved: boolean): Promise<Route> =>
  fetcher<Route>(`/v1/route/${routeName}/preserve`, {
    method: preserved ? 'POST' : 'DELETE',
  })
