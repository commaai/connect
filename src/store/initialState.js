import { getDongleID, getPrimeNav } from '../url';
import * as Demo from '../demo';

export function getDefaultFilter() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  if (Demo.isDemo()) {
    return {
      start: 1632948396703,
      end: 1632949028503,
    };
  }

  return {
    start: (new Date(d.getTime() - 1000 * 60 * 60 * 24 * 14)).getTime(),
    end: d.getTime(),
  };
}

export default {
  dongleId: getDongleID(window.location.pathname),

  routes: null,
  routesMeta: {
    dongleId: null,
    start: null,
    end: null,
  },
  currentRoute: null,

  profile: null,
  devices: null,

  primeNav: getPrimeNav(window.location.pathname),
  subscription: null,
  subscribeInfo: null,

  files: null,
  filesUploading: {},
  filesUploadingMeta: {
    dongleId: null,
    fetchedAt: null,
  },

  clips: null,

  filter: getDefaultFilter(),
};
