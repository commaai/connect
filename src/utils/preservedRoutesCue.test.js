/* eslint-env jest */
import {
  shouldShowPreservedRoutesCue,
  shouldHoldPreservedRoutesCue,
  nextPreservedCueHold,
} from './preservedRoutesCue';

const preserved = (n) => Array.from({ length: n }, (_, i) => ({
  fullname: `d|${i}`,
  is_preserved: true,
}));

const base = {
  routes: preserved(3),
  device: { prime: false, is_owner: true },
  dongleId: 'dongleA',
  routesMeta: { dongleId: 'dongleA', start: 1, end: 2 },
  limit: 5,
  segmentRange: null,
};

describe('shouldShowPreservedRoutesCue', () => {
  it('shows for exhausted all-preserved free list', () => {
    expect(shouldShowPreservedRoutesCue(base)).toBe(true);
  });

  it('hides when routes null or empty', () => {
    expect(shouldShowPreservedRoutesCue({ ...base, routes: null })).toBe(false);
    expect(shouldShowPreservedRoutesCue({ ...base, routes: [] })).toBe(false);
  });

  it('hides when routesMeta null or undefined', () => {
    expect(shouldShowPreservedRoutesCue({ ...base, routesMeta: null })).toBe(false);
    expect(shouldShowPreservedRoutesCue({ ...base, routesMeta: undefined })).toBe(false);
  });

  it('hides when prime true or undefined', () => {
    expect(shouldShowPreservedRoutesCue({ ...base, device: { prime: true } })).toBe(false);
    expect(shouldShowPreservedRoutesCue({ ...base, device: {} })).toBe(false);
    expect(shouldShowPreservedRoutesCue({ ...base, device: null })).toBe(false);
  });

  it('hides on wrong routesMeta.dongleId', () => {
    expect(shouldShowPreservedRoutesCue({
      ...base,
      routesMeta: { dongleId: 'other', start: 1, end: 2 },
    })).toBe(false);
  });

  it('hides when not exhausted or limit invalid', () => {
    expect(shouldShowPreservedRoutesCue({ ...base, routes: preserved(5), limit: 5 })).toBe(false);
    expect(shouldShowPreservedRoutesCue({ ...base, limit: undefined })).toBe(false);
    expect(shouldShowPreservedRoutesCue({ ...base, limit: 0 })).toBe(false);
  });

  it('hides when any route not strictly preserved', () => {
    expect(shouldShowPreservedRoutesCue({
      ...base,
      routes: [...preserved(2), { fullname: 'd|x', is_preserved: false }],
    })).toBe(false);
    expect(shouldShowPreservedRoutesCue({
      ...base,
      routes: [...preserved(2), { fullname: 'd|x' }],
    })).toBe(false);
  });

  it('hides while segmentRange is set', () => {
    expect(shouldShowPreservedRoutesCue({
      ...base,
      segmentRange: { log_id: 'abc', start: 0, end: 1 },
    })).toBe(false);
  });
});

describe('shouldHoldPreservedRoutesCue', () => {
  const hold = { dongleId: 'dongleA', filterKey: '1:2' };
  const holdBase = {
    hold,
    routes: null,
    device: { prime: false },
    dongleId: 'dongleA',
  };

  it('holds only with matching dongle and prime false while routes null', () => {
    expect(shouldHoldPreservedRoutesCue(holdBase)).toBe(true);
    expect(shouldHoldPreservedRoutesCue({
      ...holdBase,
      dongleId: 'dongleB',
    })).toBe(false);
    expect(shouldHoldPreservedRoutesCue({
      ...holdBase,
      device: { prime: true },
    })).toBe(false);
  });

  it('returns false for falsy hold', () => {
    expect(shouldHoldPreservedRoutesCue({ ...holdBase, hold: null })).toBe(false);
    expect(shouldHoldPreservedRoutesCue({ ...holdBase, hold: undefined })).toBe(false);
  });

  it('returns false when routes is an empty array', () => {
    expect(shouldHoldPreservedRoutesCue({ ...holdBase, routes: [] })).toBe(false);
  });

  it('holds when routes is undefined with valid hold', () => {
    expect(shouldHoldPreservedRoutesCue({ ...holdBase, routes: undefined })).toBe(true);
  });
});

describe('nextPreservedCueHold', () => {
  it('clears hold on device change when showLive is false', () => {
    expect(nextPreservedCueHold({
      prevHold: { dongleId: 'dongleA', filterKey: '1:2' },
      showLive: false,
      dongleId: 'dongleB',
      filterKey: '1:2',
    })).toBe(null);
  });

  it('sets hold when showLive is true and no prevHold', () => {
    expect(nextPreservedCueHold({
      prevHold: null,
      showLive: true,
      dongleId: 'dongleA',
      filterKey: '1:2',
    })).toEqual({ dongleId: 'dongleA', filterKey: '1:2' });
  });

  it('clears hold on filterKey-only change when showLive is false', () => {
    expect(nextPreservedCueHold({
      prevHold: { dongleId: 'dongleA', filterKey: '1:2' },
      showLive: false,
      dongleId: 'dongleA',
      filterKey: '3:4',
    })).toBe(null);
  });

  it('retains prevHold when context stable and showLive is false', () => {
    const prevHold = { dongleId: 'dongleA', filterKey: '1:2' };
    expect(nextPreservedCueHold({
      prevHold,
      showLive: false,
      dongleId: 'dongleA',
      filterKey: '1:2',
    })).toBe(prevHold);
  });

  it('sets new hold on filterKey change when showLive is true', () => {
    expect(nextPreservedCueHold({
      prevHold: { dongleId: 'dongleA', filterKey: '1:2' },
      showLive: true,
      dongleId: 'dongleA',
      filterKey: '3:4',
    })).toEqual({ dongleId: 'dongleA', filterKey: '3:4' });
  });
});
