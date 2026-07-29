import request from './request';

export function getRoutesSegments(dongleId, start, end, limit, routeStr) {
  return request.get(`v1/devices/${dongleId}/routes_segments`, {
    start,
    end,
    limit,
    route_str: routeStr,
  });
}

export function setRoutePublic(routeName, isPublic) {
  return request.patch(`v1/route/${routeName}/`, { is_public: isPublic });
}

export function setRoutePreserved(routeName, preserved) {
  return request.request(preserved ? 'POST' : 'DELETE', `v1/route/${routeName}/preserve`);
}

export function getPreservedRoutes(dongleId) {
  return request.get(`v1/devices/${dongleId}/routes/preserved`);
}
