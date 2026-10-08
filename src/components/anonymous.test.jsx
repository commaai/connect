import React from 'react';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import AnonymousLanding, { getLoginRedirect } from './anonymous';

vi.mock('@commaai/my-comma-auth', () => ({ config: {
  GOOGLE_REDIRECT_LINK: '/google', GITHUB_REDIRECT_LINK: '/github', APPLE_REDIRECT_PATH: '/apple',
} }));

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const target = `/${FIRST}?dialog=settings&dialogDevice=${SECOND}&source=shared#devices`;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('login destination capture', () => {
  it('preserves a direct protected dialog including target, query and hash', () => {
    expect(getLoginRedirect(target)).toBe(target);
    expect(getLoginRedirect(target, '/referrals')).toBe(target);
  });

  it('honors a valid explicit return destination', () => {
    expect(getLoginRedirect(`/?r=${encodeURIComponent(target)}`, '/referrals')).toBe(target);
  });

  it.each([
    '', 'https://example.com/attack', '//example.com/attack', '/\\example.com/attack',
    '/auth/?code=old', '/unsupported', '/?r=%2Freferrals', '/referrals\n',
  ])('rejects an invalid return destination %s without losing a direct target', (value) => {
    expect(getLoginRedirect(`${target.split('#')[0]}&r=${encodeURIComponent(value)}#devices`, '/referrals')).toBe(target);
  });

  it('uses a validated saved destination only when the current entry has no target', () => {
    expect(getLoginRedirect('/', target)).toBe(target);
    expect(getLoginRedirect('/', 'https://example.com/attack')).toBe('/');
    expect(getLoginRedirect('/missing', target)).toBe('/');
    expect(getLoginRedirect('/?dialog=add-device', target)).toBe('/?dialog=add-device');
  });

  it('does not reinterpret duplicate return parameters as a destination', () => {
    expect(getLoginRedirect(`/${FIRST}?r=%2Freferrals&r=%2Fdemo`, target)).toBe(`/${FIRST}`);
  });

  it('does not replace a saved destination with the authentication callback', () => {
    expect(getLoginRedirect('/auth/?code=test&provider=g', target)).toBe(target);
  });

  it('captures Redux location changes instead of the global window or an older saved target', () => {
    const first = { pathname: `/${FIRST}`, search: '?dialog=settings', hash: '#first' };
    const second = { pathname: `/${SECOND}`, search: '?dialog=uploads&source=shared', hash: '#second' };
    sessionStorage.setItem('redirectURL', '/referrals');
    const store = createStore((state = { router: { location: first } }, action) => (
      action.type === 'SET_LOCATION' ? { router: { location: action.location } } : state
    ));
    const view = render(<Provider store={store}><AnonymousLanding /></Provider>);
    expect(sessionStorage.getItem('redirectURL')).toBe(`/${FIRST}?dialog=settings#first`);
    act(() => store.dispatch({ type: 'SET_LOCATION', location: second }));
    expect(sessionStorage.getItem('redirectURL')).toBe(`/${SECOND}?dialog=uploads&source=shared#second`);
    view.unmount();
  });
});
