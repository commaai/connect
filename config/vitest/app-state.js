/**
 * Stands in for `$app/state`. Kit's `page` is a reactive proxy over the current
 * navigation; a component under test only reads from it, so a plain object with
 * a setter for the test to arrange is enough.
 */
export const page = {
  url: new URL('http://localhost/'),
  params: {},
  route: { id: null },
  status: 200,
  error: null,
  data: {},
  form: null,
};

/** Point `page` at a path, the way navigating to it would. */
export function setPage({ pathname = '/', params = {}, routeId = null } = {}) {
  page.url = new URL(pathname, 'http://localhost');
  page.params = params;
  page.route = { id: routeId };
}

export const navigating = null;
export const updated = { current: false };
