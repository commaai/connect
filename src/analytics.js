import { LOCATION_CHANGE } from 'connected-react-router';

import MyCommaAuth from '@commaai/my-comma-auth';

import * as Types from './actions/types';
import { getDongleID, getZoom } from './url'

function getPageViewEventLocation(pathname) {
  let page_location = pathname;
  const dongleId = getDongleID(page_location);
  if (dongleId) {
    page_location = page_location.replace(dongleId, '<dongleId>');
  }
  const zoom = getZoom(page_location);
  if (zoom.expanded) {
    page_location = page_location.replace(zoom.start.toString(), '<zoomStart>');
    page_location = page_location.replace(zoom.end.toString(), '<zoomEnd>');
  }

  if (page_location.endsWith('/')) {
    page_location = page_location.substring(0, page_location.length - 1);
  }
  return page_location;
}

export function analyticsMiddleware({ getState }) {
  return (next) => (action) => {
    next(action);

    if (typeof gtag !== 'function') {
      return;
    }

    const state = getState();

    if (MyCommaAuth.isAuthenticated() && !state.profile) { // no startup data yet
      return;
    }

    switch (action.type) {
    case LOCATION_CHANGE:
      gtag('event', 'page_view', {
        page_location: getPageViewEventLocation(action.payload.location.pathname),
      });
      return;

    case Types.ACTION_STARTUP_DATA:
      gtag('set', {
        user_id: state.profile.user_id,
        user_properties: {
          superuser: state.profile.superuser,  // TODO: filter these events?
          prime: state.profile.prime,
          regdate: state.profile.regdate,
        }
      });

      gtag('event', 'page_view', {
        page_location: getPageViewEventLocation(window.location.pathname),
      });

      gtag('event', 'startup_data', {
        // TODO: PWA, device count, c3?
      });
      return;

    case Types.ACTION_SELECT_DEVICE:

      return;
    }

    // TODO: more events
  };
}
