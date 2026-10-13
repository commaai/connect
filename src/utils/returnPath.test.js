import { beforeEach, describe, expect, test } from 'vitest';
import { linkedReturnPath, rememberReturnPath, signInUrl, takeReturnPath } from './returnPath';

const at = (url) => window.history.replaceState({}, '', url);

describe('returnPath', () => {
  beforeEach(() => { sessionStorage.clear(); at('/'); });

  test('signInUrl encodes the path', () => {
    expect(signInUrl('/a b/c')).toBe('/?r=/a%20b/c');
  });

  test('round trip through sessionStorage, cleared after take', () => {
    at(`/?r=${encodeURIComponent('/abc/prime?x=1')}`);
    rememberReturnPath();
    at('/auth/');
    expect(takeReturnPath()).toBe('/abc/prime?x=1');
    expect(sessionStorage.getItem('redirectURL')).toBeNull();
    expect(takeReturnPath()).toBeNull();
  });

  test('remembers the current path when there is no ?r=', () => {
    at('/abc?settings=1');
    rememberReturnPath();
    at('/auth/');
    expect(takeReturnPath()).toBe('/abc?settings=1');
  });

  test('a sign-in link is followed only through ?r=, never a stale stored target', () => {
    at('/?r=%2Fabc');
    expect(linkedReturnPath()).toBe('/abc');
    sessionStorage.setItem('redirectURL', '/stale');
    at('/deadbeefdeadbeef');
    expect(linkedReturnPath()).toBeNull();
  });

  test('rejects other origins', () => {
    at(`/?r=${encodeURIComponent('https://evil.example/x')}`);
    expect(linkedReturnPath()).toBeNull();
    sessionStorage.setItem('redirectURL', '//evil.example/x');
    at('/auth/');
    expect(takeReturnPath()).toBeNull();
    expect(sessionStorage.getItem('redirectURL')).toBeNull();
  });
});
