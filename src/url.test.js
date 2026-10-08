import { describe, expect, it } from 'vitest';
import {
  ROUTES, MODALS, parseLocation, buildLocation, parseRange, serializeRange,
  getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav,
} from './url';

const DEVICE = '0000aaaa0000aaaa';
const OTHER = '0000bbbb0000bbbb';
const LOG = '2026-08-06--12-00-00';
const HEX_LOG = '0000010a--a51155e496';
const DRIVE = `/${DEVICE}/${LOG}`;
const read = (pathname, search = '', hash = '') => parseLocation({ pathname, search, hash });
const roundTrip = (location) => {
  const first = parseLocation(location);
  expect(first.ok).toBe(true);
  const canonical = buildLocation(first.state);
  const second = parseLocation(canonical);
  expect(second.ok).toBe(true);
  expect(buildLocation(second.state)).toEqual(canonical);
  return { canonical, state: second.state };
};

describe('location grammar', () => {
  it.each(ROUTES)('round trips $page $parts', (route) => {
    const values = { dongleId: DEVICE, logId: LOG, start: 0, end: 20 };
    const pathname = `/${route.parts.map((part) => part.startsWith(':') ? values[part.slice(1)] : part).join('/')}`;
    const { state } = roundTrip({ pathname, search: '?sig=a%2Bb&x=1&x=2', hash: '#position' });
    expect(state.page).toBe(route.page);
    expect(state.demo).toBe(!!route.demo);
    expect(state.hash).toBe('#position');
    expect(new URLSearchParams(state.search).getAll('x')).toEqual(['1', '2']);
  });

  it.each([LOG, HEX_LOG, '00000000--0000000001'])('accepts log ID %s', (logId) => {
    expect(read(`/${DEVICE}/${logId}`).state.logId).toBe(logId);
    expect(read(`/demo/${logId}`).state).toMatchObject({ dongleId: 'deadbeefdeadbeef', logId, demo: true });
  });

  it('keeps legacy absolute milliseconds unchanged', () => {
    const path = `/${DEVICE}/1700000000000/1700000060000`;
    const { state, canonical } = roundTrip({ pathname: path });
    expect(state.legacyRange).toEqual({ start: 1700000000000, end: 1700000060000 });
    expect(canonical.pathname).toBe(path);
    expect(getZoom(path)).toEqual(state.legacyRange);
  });

  it('canonicalizes leading zeroes and settings alias', () => {
    expect(roundTrip({ pathname: `${DRIVE}/000/020` }).canonical.pathname).toBe(`${DRIVE}/0/20`);
    expect(roundTrip({ pathname: `/${DEVICE}/settings` }).canonical).toEqual({
      pathname: `/${DEVICE}`, search: '?modal=settings', hash: '',
    });
    expect(roundTrip({ pathname: '/auth' }).canonical.pathname).toBe('/auth/');
  });

  it('rounds selection outward rather than collapsing it', () => {
    const state = read(DRIVE).state;
    state.zoom = { start: 10100, end: 10900 };
    const { state: canonical } = roundTrip(buildLocation(state));
    expect(canonical.zoom).toEqual({ start: 10000, end: 11000 });
    expect(serializeRange(0.1, 0.2)).toEqual({ start: 0, end: 1 });
  });

  it('supports compatibility getters without loose matching', () => {
    expect(getDongleID(`/${DEVICE}`)).toBe(DEVICE);
    expect(getRouteId(DRIVE)).toBe(LOG);
    expect(getRouteZoom(`${DRIVE}/0/20`)).toEqual({ start: 0, end: 20000 });
    expect(getPrimeNav(`/${DEVICE}/prime`)).toBe(true);
    expect(getStreamNav(`/${DEVICE}/stream`)).toBe(true);
    expect(getZoom(DRIVE)).toBeNull();
    expect(getDongleID({ split: () => [] })).toBeNull();
  });
});

describe('modal grammar', () => {
  it('marks every owner-only modal in the shared metadata', () => {
    expect(Object.keys(MODALS).filter((name) => MODALS[name].ownerOnly)).toEqual([
      'settings', 'unpair', 'settings-uploads', 'uploads', 'clips', 'clip', 'delete-clip',
      'switch-prime', 'cancel-prime',
    ]);
  });
  for (const [modal, rule] of Object.entries(MODALS)) {
    it.each(rule.pages)(`${modal} on %s`, (page) => {
      const state = { ...read(`/${DEVICE}`).state, page, modal,
        logId: page === 'drive' ? LOG : null, dongleId: page === 'home' ? null : DEVICE,
        modalDevice: rule.device ? OTHER : null, clip: rule.clip ? 'clip-01.mp4' : null };
      const { state: parsed } = roundTrip(buildLocation(state));
      expect(parsed.modal).toBe(modal);
      expect(parsed.modalDevice).toBe(state.modalDevice);
      expect(parsed.clip).toBe(state.clip);
    });
  }

  it('preserves repeated unrelated arguments and hash while removing a modal', () => {
    const state = read(DRIVE, '?x=1&modal=settings&device=' + OTHER + '&x=2', '#t=20').state;
    const closed = buildLocation({ ...state, modal: null, modalDevice: null });
    expect(closed).toEqual({ pathname: DRIVE, search: '?x=1&x=2', hash: '#t=20' });
  });

  it.each(Object.keys(MODALS))('rejects modal %s on stream', (modal) => {
    expect(read(`/${DEVICE}/stream`, `?modal=${modal}`).ok).toBe(false);
  });
});

const invalidNumbers = ['', 'NaN', 'Infinity', '-1', '+1', '1.1', '1e3', '0x10', ' 1', '1 ',
  '%31', '9007199254740992', '9'.repeat(400), '١'];
const invalidPaths = ['', 'relative', '//', '/unknown', '/demo/', '/demo/unknown', '/referrals/',
  `/${DEVICE}/`, `/${DEVICE}/unknown`, `/${DEVICE}/prime/extra`, `${DRIVE}/`, `${DRIVE}/0/20/extra`,
  `/x${DEVICE}`, `/${DEVICE}x`, `/${DEVICE.toUpperCase()}`, `/%30${DEVICE.slice(1)}`,
  `/${DEVICE}/${LOG}extra`, `/${DEVICE}/0`, `${DRIVE}/0`, `${DRIVE}/20/10`, `${DRIVE}/10/10`,
  `/${DEVICE}/20/10`, `/${DEVICE}/10/10`, '/demo//0/20', '/auth/code/provider',
  ...invalidNumbers.map((number) => `${DRIVE}/${number}/20`),
  ...invalidNumbers.map((number) => `/${DEVICE}/0/${number}`),
];

describe('invalid locations', () => {
  it.each(invalidPaths)('rejects %s', (pathname) => expect(read(pathname).ok).toBe(false));
  it.each(['?modal=unknown', '?modal=__proto__', '?modal=', '?modal=settings&modal=settings',
    '?modal=settings&device=', '?modal=clip&clip=', '?modal=clip', '?modal=clip&clip=../clip.mp4',
    '?modal=clip&clip=a%2Fb', '?modal=files&clip=x', '?modal=files&device=' + DEVICE,
    '?modal=settings&device=no', '?modal=settings&clip=x', '?device=' + DEVICE,
    '?modal=settings&device=' + DEVICE + '&device=' + OTHER, '?modal=clip&clip=x&clip=y',
    '?clip=x', '?device=', '?clip=', '?modal=files&device=', '?modal=files&clip='])
  ('rejects reserved arguments %s', (search) => expect(read(DRIVE, search).ok).toBe(false));

  it.each([null, {}, { pathname: null }, { pathname: '/', search: 'x=1' },
    { pathname: '/', hash: 'x' }, { pathname: '/', search: {} }])('does not throw for %j', (location) => {
    expect(parseLocation(location).ok).toBe(false);
  });

  it.each([{ start: -1, end: 20 }, { start: 20, end: 10 }, { start: 0, end: Infinity },
    { start: NaN, end: 10 }, { start: 0, end: Number.MAX_SAFE_INTEGER }])('rejects builder range %j', (zoom) => {
    expect(() => buildLocation({ ...read(DRIVE).state, zoom })).toThrow(RangeError);
  });

  it('rejects unsafe conversion and accepts the safe boundary', () => {
    expect(parseRange('9007199254740', '9007199254741')).toBeNull();
    expect(parseRange('9007199254739', '9007199254740')).toEqual({ start: 9007199254739000, end: 9007199254740000 });
    expect(parseRange('9007199254740990', '9007199254740991', 1)).toEqual({
      start: 9007199254740990, end: 9007199254740991,
    });
    expect(serializeRange(0, 1, 0)).toBeNull();
  });
});

it('seeded parser fuzz never throws and every accepted URL canonicalizes', () => {
  let seed = 770;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const alphabet = '/?%#0123456789abcdef.-_ +';
  for (let index = 0; index < 5000; index += 1) {
    let pathname = '';
    const length = next() % 90;
    for (let char = 0; char < length; char += 1) pathname += alphabet[next() % alphabet.length];
    if (index % 5 === 0) pathname = `${DRIVE}/${next() % 100}/${100 + next() % 100}`;
    if (index % 7 === 0) pathname = `/demo/${HEX_LOG}`;
    const location = { pathname, search: index % 3 === 0 ? '?x=%zz&x=2' : '', hash: '#fuzz' };
    const result = parseLocation(location);
    if (result.ok) roundTrip(location);
  }
});

describe('builder edge cases', () => {
  const drive = () => read(DRIVE).state;

  it('floors the start of a selection instead of rounding it', () => {
    expect(buildLocation({ ...drive(), zoom: { start: 5900, end: 6100 } }).pathname).toBe(`${DRIVE}/5/7`);
    expect(buildLocation({ ...drive(), zoom: { start: 0, end: 1 } }).pathname).toBe(`${DRIVE}/0/1`);
  });

  it('keeps a selection inside one second as a one second range', () => {
    expect(buildLocation({ ...drive(), zoom: { start: 5100, end: 5200 } }).pathname).toBe(`${DRIVE}/5/6`);
  });

  it('refuses an empty selection', () => {
    expect(() => buildLocation({ ...drive(), zoom: { start: 5000, end: 5000 } })).toThrow(RangeError);
    expect(serializeRange(5000, 5000)).toBeNull();
  });

  it.each([{ dongleId: 'abc' }, { dongleId: DEVICE.toUpperCase() }, { logId: 'nope' }, { logId: null }])(
    'refuses to build an invalid id %j', (change) => {
      expect(() => buildLocation({ ...drive(), ...change })).toThrow(RangeError);
    });

  it('never builds a URL that parses back to a different page', () => {
    for (const path of [`/${DEVICE}`, `/${DEVICE}/prime`, `/${DEVICE}/stream`, DRIVE, `${DRIVE}/3/9`,
      `/${DEVICE}/1700000000000/1700000060000`, '/demo', `/demo/${LOG}`, '/referrals', '/']) {
      const { state } = read(path);
      expect(read(buildLocation(state).pathname).state).toMatchObject({ page: state.page, demo: state.demo });
    }
  });
});


describe('compatibility and query retention', () => {
  it('keeps trailing slash support only in transitional helpers', () => {
    expect(getDongleID(`/${DEVICE}/`)).toBe(DEVICE);
    expect(getRouteId(`${DRIVE}/`)).toBe(LOG);
    expect(getStreamNav(`/${DEVICE}/stream/`)).toBe(true);
    expect(read(`/${DEVICE}/`).ok).toBe(false);
  });

  it('resolves the demo alias to the synthetic device', () => {
    expect(getDongleID('/demo')).toBe('deadbeefdeadbeef');
    expect(getDongleID(`/demo/${HEX_LOG}`)).toBe('deadbeefdeadbeef');
  });

  it('clears stale modal targets when a modal is closed', () => {
    const state = read(DRIVE, '?modal=clip&clip=a.mp4').state;
    expect(buildLocation({ ...state, modal: null, modalDevice: OTHER })).toEqual({
      pathname: DRIVE, search: '', hash: '',
    });
  });

  it('retains unrelated query bytes and removes encoded reserved keys', () => {
    const search = '?a=b%20c&flag&y=a+b&%6dodal=settings&%64evice=' + OTHER;
    const state = read(DRIVE, search, '#frag').state;
    expect(buildLocation(state).search).toBe('?a=b%20c&flag&y=a+b&modal=settings&device=' + OTHER);
    expect(buildLocation({ ...state, modal: null })).toEqual({
      pathname: DRIVE, search: '?a=b%20c&flag&y=a+b', hash: '#frag',
    });
  });

  it('validates the clip filename length boundary', () => {
    expect(read(DRIVE, '?modal=clip&clip=' + 'a'.repeat(255)).ok).toBe(true);
    expect(read(DRIVE, '?modal=clip&clip=' + 'a'.repeat(256)).ok).toBe(false);
  });
});
