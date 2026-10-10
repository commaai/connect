import '../store';
import { primeNav, streamNav, selectDevice, openModal, closeModal } from './index';
import { parseLocation } from '../url';

const DONGLE = 'aaaaaaaaaaaaaaaa';
const LOG = '2026-08-06--12-00-00';

function destination(thunk, pathname = `/${DONGLE}/${LOG}`, search = '') {
  const state = { dongleId: DONGLE, navigation: parseLocation({ pathname, search }), router: { location: { pathname, search } } };
  let action;
  const dispatch = value => typeof value === 'function' ? value(dispatch, () => state) : (action = value);
  dispatch(thunk);
  return action?.payload.args[0];
}

it.each([
  [selectDevice('bbbbbbbbbbbbbbbb'), '/bbbbbbbbbbbbbbbb'],
  [primeNav(true), `/${DONGLE}/prime`],
  [streamNav(true), `/${DONGLE}/stream`],
])('navigation writes the target URL', (action, pathname) => {
  expect(destination(action)).toEqual({ pathname, search: '' });
});

it('opening settings retains the drive and unrelated query arguments', () => {
  expect(destination(openModal('settings'), `/${DONGLE}/${LOG}`, '?ci=1'))
    .toEqual({ pathname: `/${DONGLE}/${LOG}`, search: '?ci=1&modal=settings' });
});

it('closing a dialog retains its background and clears its arguments', () => {
  expect(destination(closeModal(), `/${DONGLE}/${LOG}`, '?ci=1&modal=clip&clip=road.mp4'))
    .toEqual({ pathname: `/${DONGLE}/${LOG}`, search: '?ci=1' });
});

it.each([selectDevice('bbbbbbbbbbbbbbbb'), primeNav(true)])('does not carry page-specific query values to another page', (action) => {
  expect(destination(action, `/${DONGLE}/${LOG}`, '?stripe_success=session-a&ci=1').search).toBe('');
});

it('returning from uploads restores its parent settings URL', () => {
  expect(destination(closeModal(), `/${DONGLE}/${LOG}`, '?modal=uploads&parent=settings'))
    .toEqual({ pathname: `/${DONGLE}/${LOG}`, search: '?modal=settings' });
});
