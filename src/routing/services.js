// Per-store navigation services. One instance is created with each store and
// shared by the routing middleware and thunks (as redux-thunk's extra
// argument), so independent stores never share history or request state.

import { urlOfRouterLocation } from './codec';

// Tracks the history entries this app has observed, so "go back to where I
// came from" is only used when the previous entry is verifiably the parent
// recorded when the current entry was pushed. After a refresh or any
// unobserved history change there is no verified parent and callers fall
// back to an explicit destination.
export function createHistoryTracker() {
  let entries = [];
  let index = -1;

  const entryOf = (location) => ({ key: location.key ?? null, url: urlOfRouterLocation(location) });

  return {
    observe(location, historyAction) {
      const entry = entryOf(location);
      if (index < 0) {
        entries = [entry];
        index = 0;
      } else if (historyAction === 'PUSH') {
        entries = entries.slice(0, index + 1).concat(entry);
        index += 1;
      } else if (historyAction === 'REPLACE') {
        entries[index] = entry;
      } else {
        const found = entries.findIndex((e) => e.key === entry.key && e.url === entry.url);
        if (found === -1) {
          entries = [entry];
          index = 0;
        } else {
          index = found;
        }
      }
    },

    // the parent URL recorded on the current entry, if the previous observed
    // entry is still exactly that parent
    verifiedParentUrl(location) {
      const parent = location?.state?.parent;
      if (!parent || index < 1) return null;
      const previous = entries[index - 1];
      const current = entries[index];
      if (current.key !== (location.key ?? null)) return null;
      return previous.key === parent.key && previous.url === parent.url ? previous.url : null;
    },
  };
}

export function createRoutingServices() {
  return {
    history: createHistoryTracker(),
    navigation: { generation: 0, revision: 0 },
    session: { promise: null },
    requests: { routes: null, routesSeq: 0, routesLatest: new Map() },
    commands: { pairTokens: new Set() },
  };
}

// thunks dispatched without a store-provided extra argument (unit tests)
export const fallbackServices = createRoutingServices();
