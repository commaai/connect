import { isAuthCallback, rememberRedirect, takeRedirectUrl } from './auth';

const url = (href) => new URL(href, 'https://connect.comma.ai');

beforeEach(() => {
  sessionStorage.clear();
});

describe('isAuthCallback', () => {
  it('matches the callback path with a code, with or without a trailing slash', () => {
    expect(isAuthCallback(url('/auth/?code=abc&provider=g'))).toBe(true);
    expect(isAuthCallback(url('/auth?code=abc&provider=g'))).toBe(true);
  });

  it('ignores the callback path without a code', () => {
    expect(isAuthCallback(url('/auth/'))).toBe(false);
    expect(isAuthCallback(url('/auth'))).toBe(false);
  });

  it('ignores other paths even when they carry a code', () => {
    expect(isAuthCallback(url('/?code=abc'))).toBe(false);
    expect(isAuthCallback(url('/1d3dc3e03047b0c7?code=abc'))).toBe(false);
  });
});

describe('rememberRedirect', () => {
  it('prefers an explicit ?r= destination', () => {
    rememberRedirect(url('/?r=%2F1d3dc3e03047b0c7%2Fprime'));
    expect(sessionStorage.getItem('redirectURL')).toBe('/1d3dc3e03047b0c7/prime');
  });

  it('falls back to the current path', () => {
    rememberRedirect(url('/1d3dc3e03047b0c7'));
    expect(sessionStorage.getItem('redirectURL')).toBe('/1d3dc3e03047b0c7');
  });

  it('does not overwrite a destination already remembered', () => {
    sessionStorage.setItem('redirectURL', '/first');
    rememberRedirect(url('/second'));
    expect(sessionStorage.getItem('redirectURL')).toBe('/first');
  });

  it('lets ?r= override a remembered destination', () => {
    sessionStorage.setItem('redirectURL', '/first');
    rememberRedirect(url('/second?r=%2Fthird'));
    expect(sessionStorage.getItem('redirectURL')).toBe('/third');
  });
});

describe('takeRedirectUrl', () => {
  it('consumes the remembered destination', () => {
    sessionStorage.setItem('redirectURL', '/1d3dc3e03047b0c7');
    expect(takeRedirectUrl()).toBe('/1d3dc3e03047b0c7');
    expect(sessionStorage.getItem('redirectURL')).toBe(null);
  });

  it('defaults to the dashboard', () => {
    expect(takeRedirectUrl()).toBe('/');
  });

  it('never bounces back to the callback itself', () => {
    sessionStorage.setItem('redirectURL', '/auth/?code=abc');
    expect(takeRedirectUrl()).toBe('/');
  });
});
