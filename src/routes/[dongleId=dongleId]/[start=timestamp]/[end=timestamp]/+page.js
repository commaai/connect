import { redirect } from '@sveltejs/kit';

/**
 * url.js getZoom() also matched `/{dongleId}/{start}/{end}`, a form nothing ever
 * generated — urlForState only emitted a range after a log id. Without one there
 * was no current route, so explorer rendered the dashboard and the zoom it had
 * just parsed went unused. Land on the dashboard without the dead range.
 */
export function load({ params }) {
  redirect(307, `/${params.dongleId}`);
}
