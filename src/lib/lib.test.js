/**
 * Import-level coverage for the ported src/lib modules that have no unit tests
 * of their own yet. This mostly guards against the port going stale: a broken
 * relative path, a missing export, or a dependency that only resolves in the
 * browser will fail here rather than at the first route that needs it.
 */
import { account, athena, billing, devices, drives, raw, request, video, USERADMIN_URL_ROOT } from './api';
import { clipDevice, deviceSupportsClips } from './api/clips';
import Colors from './colors';
import { otherPrimePlan, primePlanName } from './prime/plans';
import { MAPBOX_STYLE, MAPBOX_TOKEN, getFilteredContexts } from './utils/geocode';
import { stringifyQuery } from './utils/query';
import { getTurnCredentials, fetchTurnCredentials } from './utils/turn';
import { WebRTCConnection } from './utils/webrtc';

describe('lib/api', () => {
  it('exposes every endpoint namespace', () => {
    for (const namespace of [account, athena, billing, devices, drives, raw, request, video]) {
      expect(namespace).toBeTruthy();
    }
    expect(typeof USERADMIN_URL_ROOT).toBe('string');
  });

  it('builds a qcamera stream url', () => {
    const url = video.getQcameraStreamUrl('dongle|log', '123', 'sig');
    expect(url).toContain('v1/route/dongle|log/qcamera.m3u8');
    expect(url).toContain('exp=123');
    expect(url).toContain('sig=sig');
  });

  it('exposes the clip device methods', () => {
    expect(typeof deviceSupportsClips).toBe('function');
    for (const method of ['getClipState', 'createClip', 'deleteClip', 'getClipUrl']) {
      expect(typeof clipDevice[method]).toBe('function');
    }
  });
});

describe('lib/utils/query', () => {
  it('encodes params and skips nullish values', () => {
    expect(stringifyQuery({ a: 1, b: 'x y', c: null, d: undefined })).toBe('a=1&b=x+y');
  });

  it('repeats keys for arrays', () => {
    expect(stringifyQuery({ p: ['a', 'b'] })).toBe('p=a&p=b');
  });

  it('handles no params', () => {
    expect(stringifyQuery(null)).toBe('');
    expect(stringifyQuery({})).toBe('');
  });
});

describe('lib/prime/plans', () => {
  it('names and toggles plans', () => {
    expect(primePlanName('data')).toBe('Standard');
    expect(primePlanName('nodata')).toBe('Lite');
    expect(otherPrimePlan('data')).toBe('nodata');
    expect(otherPrimePlan('nodata')).toBe('data');
  });
});

describe('lib/utils/geocode', () => {
  it('exposes mapbox config', () => {
    expect(MAPBOX_TOKEN).toMatch(/^pk\./);
    expect(MAPBOX_STYLE).toMatch(/^mapbox:\/\//);
  });

  it('filters context types', () => {
    const context = [{ id: 'place.1' }, { id: 'country.2' }, { id: 'region.3' }];
    expect(getFilteredContexts(context).map((c) => c.id)).toEqual(['place.1', 'region.3']);
  });
});

describe('lib/utils/webrtc', () => {
  it('exports a connection class', () => {
    expect(typeof WebRTCConnection).toBe('function');
    expect(typeof getTurnCredentials).toBe('function');
    expect(typeof fetchTurnCredentials).toBe('function');
  });
});

describe('lib/colors', () => {
  it('exports a palette', () => {
    expect(Object.keys(Colors).length).toBeGreaterThan(0);
  });
});
