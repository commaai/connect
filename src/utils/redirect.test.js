import { describe, it, expect, beforeEach } from 'vitest';
import {
  REDIRECT_URL_KEY,
  sanitizeRedirectUrl,
  saveRedirectUrl,
  consumeRedirectUrl,
} from './redirect';

describe('sanitizeRedirectUrl', () => {
  it('accepts valid internal paths and query strings', () => {
    expect(sanitizeRedirectUrl('/0000aaaa0000aaaa/2026-08-06--12-00-00')).toBe('/0000aaaa0000aaaa/2026-08-06--12-00-00');
    expect(sanitizeRedirectUrl('/0000aaaa0000aaaa/settings')).toBe('/0000aaaa0000aaaa/settings');
    expect(sanitizeRedirectUrl('/0000aaaa0000aaaa?filter=today#zoom')).toBe('/0000aaaa0000aaaa?filter=today#zoom');
  });

  it('rejects external, protocol-relative, and invalid targets', () => {
    expect(sanitizeRedirectUrl('https://evil.com')).toBeNull();
    expect(sanitizeRedirectUrl('http://evil.com/path')).toBeNull();
    expect(sanitizeRedirectUrl('//evil.com/path')).toBeNull();
    expect(sanitizeRedirectUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeRedirectUrl('')).toBeNull();
    expect(sanitizeRedirectUrl('   ')).toBeNull();
    expect(sanitizeRedirectUrl(null)).toBeNull();
    expect(sanitizeRedirectUrl(undefined)).toBeNull();
    expect(sanitizeRedirectUrl(123)).toBeNull();
  });

  it('rejects root and auth destinations', () => {
    expect(sanitizeRedirectUrl('/')).toBeNull();
    expect(sanitizeRedirectUrl('/auth')).toBeNull();
    expect(sanitizeRedirectUrl('/auth/')).toBeNull();
    expect(sanitizeRedirectUrl('/auth/?code=123')).toBeNull();
  });

  it('rejects stringified null or undefined literals', () => {
    expect(sanitizeRedirectUrl('undefined')).toBeNull();
    expect(sanitizeRedirectUrl('null')).toBeNull();
  });
});

describe('saveRedirectUrl and consumeRedirectUrl', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('saves to both sessionStorage and localStorage and consumes cleanly', () => {
    saveRedirectUrl('/0000aaaa/2026-08-06--12-00-00');
    expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBe('/0000aaaa/2026-08-06--12-00-00');
    expect(localStorage.getItem(REDIRECT_URL_KEY)).toBe('/0000aaaa/2026-08-06--12-00-00');

    const consumed = consumeRedirectUrl();
    expect(consumed).toBe('/0000aaaa/2026-08-06--12-00-00');
    expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
    expect(localStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
  });

  it('falls back to localStorage when sessionStorage was lost during OAuth redirect', () => {
    localStorage.setItem(REDIRECT_URL_KEY, '/0000aaaa/2026-08-06--12-00-00');

    const consumed = consumeRedirectUrl();
    expect(consumed).toBe('/0000aaaa/2026-08-06--12-00-00');
    expect(localStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
  });

  it('ignores invalid targets and returns null when empty', () => {
    saveRedirectUrl('https://evil.com');
    expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
    expect(localStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
    expect(consumeRedirectUrl()).toBeNull();
  });
});
