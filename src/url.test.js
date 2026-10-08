import { describe, expect, it } from 'vitest';
import { parseLocation, pathForState, withModal, withClip, withFilter, safeReturnTo, canonicalLocation, selectLocation } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const MODERN_LOG = '0000010a--a51155e496';
const DRIVE = `/${DONGLE}/${LOG}`;

describe('dashboard date range URLs', () => {
  const filter = { start: 1000, end: 2000 };

  it.each(['/', '/demo', `/${DONGLE}`, DRIVE, `/${DONGLE}/prime`, `/${DONGLE}/settings`])('reads dates independently of the background page %s', (pathname) => {
    expect(parseLocation(`${pathname}?from=1000&to=2000`).filter).toEqual(filter);
  });

  it.each([
    'from=1', 'to=2', 'from=&to=2', 'from=-1&to=2', 'from=2&to=1', 'from=2&to=2',
    'from=1.5&to=2', 'from=1e2&to=200', 'from=0x10&to=32', 'from=0&to=Infinity',
    'from=0&to=9007199254740992', 'from=0&to=8640000000000001',
    'from=1&from=2&to=3', 'from=1&to=2&to=3',
  ])('ignores an invalid or ambiguous date filter without losing the overlay (%s)', (query) => {
    expect(parseLocation(`/${DONGLE}?${query}&modal=settings`)).toMatchObject({
      page: 'device', modal: 'settings', filter: null,
    });
  });

  it('keeps dashboard epoch dates separate from drive milliseconds', () => {
    const path = `${DRIVE}/1.001/2.002?from=1000&to=2000&modal=drive-files`;
    const parsed = parseLocation(path);
    expect(parsed).toMatchObject({ filter, zoom: { start: 1001, end: 2002 }, modal: 'drive-files' });
    expect(pathForState(parsed)).toBe(path);
  });

  it('updates only from/to and preserves unrelated repeated query, modal and hash', () => {
    const location = `/${DONGLE}?tag=a&from=1&to=2&tag=b&modal=settings#device`;
    const updated = withFilter(location, filter);
    expect(updated).toBe(`/${DONGLE}?tag=a&tag=b&modal=settings&from=1000&to=2000#device`);
    expect(withFilter(updated, null)).toBe(`/${DONGLE}?tag=a&tag=b&modal=settings#device`);
    expect(parseLocation(withModal(updated, 'filter')).filter).toEqual(filter);
  });

  it('rejects invalid builder ranges and does not parse dates on login or unknown pages', () => {
    for (const value of [{ start: -1, end: 2 }, { start: 2, end: 1 }, { start: 0, end: 8640000000000001 }]) {
      expect(() => withFilter(`/${DONGLE}`, value)).toThrow(TypeError);
    }
    expect(parseLocation('/auth?from=1000&to=2000').filter).toBeNull();
    expect(parseLocation('/unknown?from=1000&to=2000').filter).toBeNull();
  });
});

describe('URL route grammar', () => {
  it.each([
    ['/', 'home'], ['/demo', 'demo'], ['/auth/', 'auth'], ['/referrals', 'referrals'],
    [`/${DONGLE}`, 'device'], [`/${DONGLE}/prime`, 'prime'], [`/${DONGLE}/stream`, 'stream'],
    [DRIVE, 'drive'], [`/${DONGLE}/${MODERN_LOG}`, 'drive'],
    ['/deadbeefdeadbeef/00000000--0000000001', 'drive'], [`/${DONGLE}/1000/2000`, 'legacy'],
  ])('recognizes %s as %s', (pathname, page) => {
    expect(parseLocation(pathname).page).toBe(page);
  });

  it.each([
    '', '//', '/unknown', '/auth/extra', '/demo/extra', '/referrals/extra',
    `/x${DONGLE}`, `/${DONGLE}x`, `/${DONGLE}//prime`, `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}x`, `${DRIVE}/10`, `${DRIVE}/10/20/extra`,
    `${DRIVE}/-1/20`, `${DRIVE}/NaN/20`, `${DRIVE}/0/Infinity`, `${DRIVE}/1e2/200`,
    `${DRIVE}/10/10`, `${DRIVE}/20/10`, `${DRIVE}/0/0.0001`, `${DRIVE}/0/9007199254741`,
    `/${DONGLE}/0/9007199254740992`, `/${DONGLE}/0/1.5`, `/${DONGLE}/0/20/extra`,
    '/%E0%A4%A', `/${DONGLE}/%2F`, '/\\example.com', 'https://example.com/',
  ])('rejects malformed path %s without exposing partial state', (pathname) => {
    expect(parseLocation(pathname)).toMatchObject({
      page: 'notFound', dongleId: null, selectedRouteId: null, zoom: null, legacyZoom: null,
    });
  });

  it('separates relative drive seconds from legacy epoch milliseconds', () => {
    expect(parseLocation(`${DRIVE}/0/1.001`)).toMatchObject({ zoom: { start: 0, end: 1001 }, legacyZoom: null });
    expect(parseLocation(`/${DONGLE}/1000/2000`)).toMatchObject({ zoom: null, legacyZoom: { start: 1000, end: 2000 } });
    expect(parseLocation(DRIVE).legacyZoom).toBeNull();
  });

  it('accepts history locations and trailing slashes', () => {
    expect(parseLocation({ pathname: `${DRIVE}/`, search: '?modal=drive-info', hash: '#video' }))
      .toEqual(parseLocation(`${DRIVE}?modal=drive-info#video`));
  });

  it('handles absent and non-string locations without throwing', () => {
    for (const value of [undefined, null, {}, 10, { pathname: null }]) {
      expect(parseLocation(value).page).toBe('notFound');
    }
  });


});

describe('URL overlays', () => {
  it.each(['settings', 'settings-unpair', 'settings-uploads'])('targets another device with %s over a drive', (modal) => {
    expect(parseLocation(`${DRIVE}/1/2?modal=${modal}&modalDevice=${OTHER}`)).toMatchObject({
      page: 'drive', dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 1000, end: 2000 },
      modal, modalDongleId: OTHER,
    });
  });

  it('defaults settings to the device in the background URL', () => {
    expect(parseLocation(`/${DONGLE}?modal=settings`).modalDongleId).toBe(DONGLE);
    expect(parseLocation('/?modal=settings').modal).toBeNull();
    expect(parseLocation(`/?modal=settings&modalDevice=${DONGLE}`).modal).toBe('settings');
  });

  it.each([
    ['/?modal=add-device', 'add-device'], ['/demo?modal=filter', 'filter'],
    [`/${DONGLE}?modal=filter`, 'filter'], [`${DRIVE}?modal=drive-info`, 'drive-info'],
    [`${DRIVE}?modal=drive-files`, 'drive-files'], [`${DRIVE}?modal=drive-clips`, 'drive-clips'],
    [`${DRIVE}?modal=drive-uploads`, 'drive-uploads'],
    [`/${DONGLE}/prime?modal=prime-cancel`, 'prime-cancel'],
    [`/${DONGLE}/prime?modal=prime-switch&plan=nodata`, 'prime-switch'],
  ])('recognizes valid overlay %s', (path, modal) => {
    expect(parseLocation(path).modal).toBe(modal);
  });

  it.each([
    `/${DONGLE}?modal=drive-info`, `${DRIVE}?modal=filter`, `${DRIVE}?modal=prime-cancel`,
    `${DRIVE}?modal=unknown`, `${DRIVE}?modal=settings&modalDevice=invalid`,
    '/auth?modal=add-device', '/unknown?modal=add-device',
  ])('ignores invalid overlays on %s', (path) => {
    expect(parseLocation(path).modal).toBeNull();
  });

  it('only accepts existing Prime plan values on Prime pages', () => {
    expect(parseLocation(`/${DONGLE}/prime?plan=data`).plan).toBe('data');
    expect(parseLocation(`/${DONGLE}/prime?plan=nodata`).plan).toBe('nodata');
    expect(parseLocation(`/${DONGLE}/prime?plan=unknown`).plan).toBeNull();
    expect(parseLocation(`${DRIVE}?plan=data`).plan).toBeNull();
  });

  it('preserves background range, unrelated query parameters, and hash when changing overlays', () => {
    const original = `${DRIVE}/0/1.001?share=token&modal=settings&modalDevice=${OTHER}&plan=data#video`;
    const next = withModal(original, 'drive-files');
    expect(next).toBe(`${DRIVE}/0/1.001?share=token&modal=drive-files#video`);
    expect(withModal(next, null)).toBe(`${DRIVE}/0/1.001?share=token#video`);
  });

  it('does not build an invalid overlay', () => {
    expect(withModal(DRIVE, 'prime-cancel')).toBe(DRIVE);
    expect(withModal(DRIVE, 'settings', 'invalid')).toBe(DRIVE);
  });
});

describe('canonical URL construction', () => {
  it.each([
    '/', '/demo', '/auth', '/referrals', `/${DONGLE}`, `/${DONGLE}/prime`, `/${DONGLE}/stream`,
    DRIVE, `${DRIVE}/0/20`, `${DRIVE}/1.001/20.999`, `/${DONGLE}/${MODERN_LOG}`,
    `/${DONGLE}/1000/2000`, `${DRIVE}?modal=drive-info`,
    `${DRIVE}?modal=settings&modalDevice=${OTHER}`, `/${DONGLE}/prime?modal=prime-switch&plan=nodata`,
  ])('round-trips %s', (path) => {
    expect(pathForState(parseLocation(path))).toBe(path);
  });

  it('preserves every accepted millisecond at the safe integer boundary', () => {
    const state = { page: 'drive', dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 9007199254740001, end: Number.MAX_SAFE_INTEGER } };
    expect(parseLocation(pathForState(state)).zoom).toEqual(state.zoom);
  });

  it.each([
    { page: 'notFound' }, { page: 'device', dongleId: 'invalid' },
    { page: 'drive', dongleId: DONGLE, selectedRouteId: 'invalid' },
    { page: 'drive', dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 0, end: 1.5 } },
    { page: 'legacy', dongleId: DONGLE, legacyZoom: { start: 10, end: 1 } },
  ])('rejects invalid navigation state %j', (state) => {
    expect(() => pathForState(state)).toThrow(TypeError);
  });
});


describe('clip selection URLs', () => {
  it.each(['device-clips', 'drive-clips'])('round-trips a %s selection', (modal) => {
    const background = modal === 'drive-clips' ? DRIVE : `/${DONGLE}`;
    const path = withClip(`${background}?token=abc&modal=${modal}#video`, 'my trip.mp4', 'view');
    expect(parseLocation(path)).toMatchObject({ modal, clip: 'my trip.mp4', clipAction: 'view' });
    expect(withModal(path, modal)).toBe(`${background}?token=abc&modal=${modal}#video`);
  });

  it.each(['../trip.mp4', 'folder/trip.mp4', 'folder\\trip.mp4', 'trip.txt', 'a'.repeat(252) + '.mp4', 'bad\n.mp4'])('ignores an invalid clip name %j', (filename) => {
    const path = `${DRIVE}?modal=drive-clips`;
    expect(withClip(path, filename, 'delete')).toBe(path);
    expect(parseLocation(`${path}&clip=${encodeURIComponent(filename)}&clipAction=delete`).clip).toBeNull();
  });

  it('rejects selections outside a clip library or with an unknown action', () => {
    expect(withClip(DRIVE, 'trip.mp4', 'view')).toBe(DRIVE);
    expect(withClip(`${DRIVE}?modal=drive-clips`, 'trip.mp4', 'unknown')).toBe(`${DRIVE}?modal=drive-clips`);
  });

  it('clears a selected clip when opening or closing a different modal', () => {
    const path = withClip(`${DRIVE}?modal=drive-clips`, 'trip.mp4', 'delete');
    expect(withModal(path, 'drive-files')).toBe(`${DRIVE}?modal=drive-files`);
    expect(withModal(path, null)).toBe(DRIVE);
    expect(pathForState(parseLocation(path))).toBe(path);
  });
});


describe('post-login return links', () => {
  it.each(['https://example.com/', '//example.com/', '/\\example.com', '/auth?code=secret', '/not-a-page', null])('rejects unsafe or unsupported return path %j', (path) => {
    expect(safeReturnTo(path)).toBe('/');
  });

  it('retains a valid full path including query parameters and hash', () => {
    const path = `${DRIVE}/0/20?modal=drive-files&token=abc#video`;
    expect(safeReturnTo(path)).toBe(path);
  });
});


describe('unambiguous URL selectors', () => {
  it.each([
    'modal=drive-info&modal=drive-files',
    `modal=settings&modalDevice=${DONGLE}&modalDevice=${OTHER}`,
    'modal=drive-info&modal=drive-info',
  ])('ignores ambiguous overlay selectors while preserving the drive: %s', (search) => {
    expect(parseLocation(`${DRIVE}/0/1.001?${search}`)).toMatchObject({
      page: 'drive', dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 0, end: 1001 },
      modal: null, modalDongleId: null,
    });
  });

  it('ignores an ambiguous plan without closing its valid Prime overlay', () => {
    expect(parseLocation(`/${DONGLE}/prime?modal=prime-switch&plan=data&plan=nodata`))
      .toMatchObject({ page: 'prime', modal: 'prime-switch', plan: null });
  });

  it.each(['clip=first.mp4&clip=second.mp4&clipAction=view', 'clip=first.mp4&clipAction=view&clipAction=delete'])('ignores only ambiguous clip selection: %s', (selection) => {
    expect(parseLocation(`${DRIVE}?modal=drive-clips&${selection}`))
      .toMatchObject({ page: 'drive', modal: 'drive-clips', clip: null, clipAction: null });
  });

  it('preserves unrelated repeated parameters through opening and closing', () => {
    const path = `${DRIVE}?tag=one&tag=two#video`;
    const opened = withModal(path, 'drive-info');
    expect(parseLocation(opened).modal).toBe('drive-info');
    expect(withModal(opened, null)).toBe(path);
  });
});

describe('settings input alias', () => {
  it('opens settings for the device named by the path', () => {
    expect(parseLocation(`/${DONGLE}/settings`)).toMatchObject({
      page: 'device', dongleId: DONGLE, modal: 'settings', modalDongleId: DONGLE,
    });
  });

  it('canonicalizes with unrelated query parameters and hash intact', () => {
    expect(canonicalLocation(`/${DONGLE}/settings/?tag=one&tag=two#device`))
      .toBe(`/${DONGLE}?tag=one&tag=two&modal=settings#device`);
  });

  it('prevents query selectors from replacing or retargeting the path settings', () => {
    const path = `/${DONGLE}/settings?modal=settings-unpair&modalDevice=${OTHER}&plan=data`;
    expect(parseLocation(path)).toMatchObject({ modal: 'settings', modalDongleId: DONGLE, plan: null });
    expect(canonicalLocation(path)).toBe(`/${DONGLE}?modal=settings`);
  });

  it('can close an alias directly without retaining a settings pathname', () => {
    expect(withModal(`/${DONGLE}/settings?token=abc#device`, null)).toBe(`/${DONGLE}?token=abc#device`);
  });

  it('leaves established URLs unchanged', () => {
    expect(canonicalLocation(`${DRIVE}/0/20?tag=two&tag=one#video`)).toBe(`${DRIVE}/0/20?tag=two&tag=one#video`);
    expect(parseLocation(`/${DONGLE}/settings/extra`).page).toBe('notFound');
  });
});

describe('parsed location selector', () => {
  it('reuses identity across unrelated Redux changes and multiple stores', () => {
    const location = { pathname: DRIVE, search: '?modal=drive-info', hash: '' };
    const state = { router: { location }, offset: 0 };
    const selected = selectLocation(state);
    selectLocation({ router: { location: { pathname: '/', search: '', hash: '' } } });
    expect(selectLocation({ ...state, offset: 1000 })).toBe(selected);
  });

  it('updates the parsed selection when history supplies a new location', () => {
    const first = selectLocation({ router: { location: { pathname: DRIVE, search: '?modal=drive-info' } } });
    const second = selectLocation({ router: { location: { pathname: DRIVE, search: '?modal=drive-files' } } });
    expect(second).not.toBe(first);
    expect(second.modal).toBe('drive-files');
  });
});
