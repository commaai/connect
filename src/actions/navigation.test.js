import { goBack, push, replace } from 'connected-react-router';

import { parseLocation } from '../url';
import { closeModal, navigate, navigateBack, openModal, selectDevice, selectDrive } from './navigation';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '0000010a--a51155e496';

function run(thunk, url = `/${DONGLE}`, { from, routes = [] } = {}) {
  const [pathname, search = ''] = url.split('?');
  const location = { pathname, search: search && `?${search}`, state: from ? { from } : undefined };
  const state = { dongleId: DONGLE, nav: parseLocation(location), router: { location }, routes };
  const dispatched = [];
  const dispatch = (action) => (typeof action === 'function' ? action(dispatch, () => state) : dispatched.push(action));
  dispatch(thunk);
  return dispatched;
}

describe('navigate', () => {
  it('keeps the CI flag while changing pages', () => {
    const from = `/${DONGLE}?ci=1`;
    expect(run(navigate({ page: 'prime' }), from)).toEqual([push(`/${DONGLE}/prime?ci=1`, { from })]);
  });

  it('pushes the target URL and remembers where it came from', () => {
    expect(run(navigate({ page: 'prime' }))).toEqual([push(`/${DONGLE}/prime`, { from: `/${DONGLE}` })]);
  });

  it('replaces the entry when asked', () => {
    expect(run(navigate({ page: 'stream' }, { replace: true }))).toEqual([replace(`/${DONGLE}/stream`)]);
  });

  it('does nothing when already there', () => {
    expect(run(navigate({ page: 'dashboard' }))).toEqual([]);
  });

  it('switches devices', () => {
    expect(run(selectDevice(OTHER))).toEqual([push(`/${OTHER}`, { from: `/${DONGLE}` })]);
  });
});

describe('navigateBack', () => {
  it('goes back when the previous entry is the target', () => {
    expect(run(navigateBack({ page: 'dashboard' }), `/${DONGLE}/${LOG}`, { from: `/${DONGLE}` })).toEqual([goBack()]);
  });

  it('pushes the target after a cold entry', () => {
    expect(run(navigateBack({ page: 'dashboard' }), `/${DONGLE}/${LOG}`)).toEqual([push(`/${DONGLE}`, { from: `/${DONGLE}/${LOG}` })]);
  });

  it('pushes the target when the previous entry was somewhere else', () => {
    const actions = run(navigateBack({ page: 'drive', logId: LOG }), `/${DONGLE}/${LOG}/10/20`, { from: `/${DONGLE}/${LOG}/5/30` });
    expect(actions).toEqual([push(`/${DONGLE}/${LOG}`, { from: `/${DONGLE}/${LOG}/10/20` })]);
  });
});

describe('selectDrive', () => {
  const routes = [{ log_id: LOG, duration: 60000 }];

  it.each([
    ['the whole drive by default', [], `/${DONGLE}/${LOG}`],
    ['a range covering the whole drive as the whole drive', [0, 60000], `/${DONGLE}/${LOG}`],
    ['a range', [10000, 20000], `/${DONGLE}/${LOG}/10/20`],
    ['a range starting at zero', [0, 20000], `/${DONGLE}/${LOG}/0/20`],
  ])('opens %s', (_name, range, expected) => {
    expect(run(selectDrive(LOG, ...range), `/${DONGLE}`, { routes })).toEqual([push(expected, { from: `/${DONGLE}` })]);
  });
});

describe('modals', () => {
  it('returns from a direct clip link to the clip list', () => {
    const from = `/${DONGLE}?modal=clip&clip=test.mp4`;
    expect(run(closeModal(), from)).toEqual([push(`/${DONGLE}?modal=clips`, { from })]);
  });

  it('preserves query parameters when opening a modal', () => {
    const from = `/${DONGLE}/${LOG}?share_sig=test&share_exp=123`;
    expect(run(openModal('pair'), from)).toEqual([
      push(`${from}&modal=pair`, { from }),
    ]);
  });

  it('opens a modal over the current page', () => {
    expect(run(openModal('settings'), `/${DONGLE}/${LOG}/10/20`)).toEqual([
      push(`/${DONGLE}/${LOG}/10/20?modal=settings`, { from: `/${DONGLE}/${LOG}/10/20` }),
    ]);
  });

  it('closes an opened modal by going back', () => {
    expect(run(closeModal(), `/${DONGLE}?modal=settings`, { from: `/${DONGLE}` })).toEqual([goBack()]);
  });

  it('closes a linked modal by navigating to its page', () => {
    expect(run(closeModal(), `/${DONGLE}/prime?modal=pair`)).toEqual([
      push(`/${DONGLE}/prime`, { from: `/${DONGLE}/prime?modal=pair` }),
    ]);
  });
});
