import { api } from './backend';

export function getRouteVideoUrl(route) {
  if (!route) return null;
  return api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig);
}
