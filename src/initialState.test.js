import { describe, expect, it } from 'vitest';

import { createInitialState } from './initialState';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('createInitialState', () => {
  it('adopts the demo device for /demo without a path rewrite', () => {
    const state = createInitialState('/demo');
    expect(state.dongleId).toBe('deadbeefdeadbeef');
    expect(state.primeNav).toBe(false);
    expect(state.streamNav).toBe(false);
    expect(state.selectedRouteId).toBeNull();
    expect(state.zoom).toBeNull();
  });

  it('adopts no dongle from a junk path', () => {
    expect(createInitialState(`/${DONGLE}/prime/extra`).dongleId).toBeNull();
    expect(createInitialState('/not-a-device').dongleId).toBeNull();
  });

  it('projects a ranged drive, keeping zero as a real start', () => {
    const state = createInitialState(`/${DONGLE}/${LOG}/0/20`);
    expect(state).toMatchObject({
      dongleId: DONGLE,
      selectedRouteId: LOG,
      zoom: { start: 0, end: 20000 },
      primeNav: false,
      streamNav: false,
    });
  });

  it('projects a whole drive without inventing a zoom', () => {
    const state = createInitialState(`/${DONGLE}/${LOG}`);
    expect(state.selectedRouteId).toBe(LOG);
    expect(state.zoom).toBeNull();
  });

  it.each([
    ['prime', 'primeNav'],
    ['stream', 'streamNav'],
  ])('projects %s from the path', (suffix, flag) => {
    const state = createInitialState(`/${DONGLE}/${suffix}`);
    expect(state.dongleId).toBe(DONGLE);
    expect(state[flag]).toBe(true);
  });

  it('projects a legacy range as a device with no drive', () => {
    const state = createInitialState(`/${DONGLE}/1000/2000`);
    expect(state.dongleId).toBe(DONGLE);
    expect(state.selectedRouteId).toBeNull();
    expect(state.zoom).toBeNull();
  });
});
