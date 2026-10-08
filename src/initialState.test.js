import { describe, expect, it } from 'vitest';

import { createInitialState } from './initialState';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('route-derived initial state', () => {
  it.each([
    ['clips', null],
    ['clip-viewer', 'dashboard.mp4'],
    ['clip-delete', 'dashboard.mp4'],
  ])('parses %s as a safe clip modal', (modal, clip) => {
    const query = new URLSearchParams({ modal });
    if (clip) query.set('clip', clip);
    const state = createInitialState(`/${DONGLE}/${LOG}?${query}`);

    expect(state).toMatchObject({
      dongleId: DONGLE,
      selectedRouteId: LOG,
      routeModal: modal,
      routeModalClip: clip,
    });
  });
});
