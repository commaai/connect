// Reconcile initial, PUSH, POP and REPLACE locations once.
// Forward to the router, parse/canonicalize, commit navigation, then defer effects.

import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { NAVIGATION_COMMITTED } from '../actions/types';
import { activeBackendType, selectBackendType } from '../api/backend';
import { hardNavigate } from '../utils/navigation';
import { buildUrl, parseLocation, sameBase, urlOfRouterLocation } from './codec';
import { createEffectContext, runNavigationEffects } from './effects';

const afterRender = (fn) => Promise.resolve().then(fn);

export function createRoutingMiddleware(services) {
  return (store) => (next) => (action) => {
    if (!action) {
      return undefined;
    }
    if (action.type !== LOCATION_CHANGE) {
      return next(action);
    }

    let previous = store.getState().nav?.location ?? null;
    let previousDongleId = store.getState().dongleId;
    const result = next(action);

    const { location: routerLocation, action: historyAction } = action.payload;

    // demo and real data never share a page load: crossing over reloads
    const backendType = activeBackendType();
    if (backendType && selectBackendType(routerLocation.pathname) !== backendType) {
      hardNavigate(urlOfRouterLocation(routerLocation));
      return result;
    }

    services.history.observe(routerLocation, historyAction);

    const location = parseLocation(routerLocation);
    const canonical = buildUrl(location);
    // Resume deferred effects at the canonical or newer same-page location.
    const pending = services.navigation.pendingCanonical;
    const resumed = Boolean(pending && sameBase(pending.location, location));
    const samePage = !resumed && sameBase(previous, location) && Object.keys(location.commands).length === 0;
    // Generation guards page effects; revision guards exact-location rewrites.
    if (!samePage) services.navigation.generation += 1;
    services.navigation.revision += 1;
    const { generation, revision } = services.navigation;
    store.dispatch({ type: NAVIGATION_COMMITTED, location, previous, generation, at: Date.now() });

    if (canonical && canonical !== urlOfRouterLocation(routerLocation)) {
      // Canonicalize first; run effects once with the original predecessor state.
      services.navigation.pendingCanonical = resumed ? pending : { location, previous, previousDongleId };
      afterRender(() => {
        // any newer location, even on the same page, wins over this rewrite
        if (services.navigation.revision === revision) store.dispatch(replace(canonical));
      });
      return result;
    }

    services.navigation.pendingCanonical = null;
    if (resumed) {
      ({ previous, previousDongleId } = pending);
    }

    if (samePage) {
      return result; // query/hash-only change: nothing to load
    }

    const ctx = createEffectContext(store, services, generation, revision, previousDongleId);
    afterRender(() => runNavigationEffects(previous, location, ctx));
    return result;
  };
}
