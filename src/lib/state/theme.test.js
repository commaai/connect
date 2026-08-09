import { afterEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEY, storedPreference, systemTheme, theme } from './theme.svelte.js';

function prefersLight(matches) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('storedPreference', () => {
  it('is system when nothing has been chosen', () => {
    expect(storedPreference()).toBe('system');
  });

  it('reads back a choice', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    expect(storedPreference()).toBe('light');
  });

  it('ignores a value it does not recognise, rather than stamping it on the document', () => {
    localStorage.setItem(STORAGE_KEY, 'sepia');
    expect(storedPreference()).toBe('system');
  });
});

describe('systemTheme', () => {
  it('follows the OS when it asks for light', () => {
    prefersLight(true);
    expect(systemTheme()).toBe('light');
  });

  it('is dark otherwise, which is how the app has always looked', () => {
    prefersLight(false);
    expect(systemTheme()).toBe('dark');
  });
});

describe('the theme rune', () => {
  it('resolves system to whatever the OS reports', () => {
    theme.preference = 'system';
    theme.system = 'light';
    expect(theme.resolved).toBe('light');

    theme.system = 'dark';
    expect(theme.resolved).toBe('dark');
  });

  it('resolves an explicit choice over the OS', () => {
    theme.system = 'dark';
    theme.set('light');
    expect(theme.resolved).toBe('light');
  });

  it('persists a choice and forgets it again on system', () => {
    theme.set('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    theme.set('system');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(null);
  });

  it('refuses a preference it does not know', () => {
    theme.set('light');
    theme.set('sepia');
    expect(theme.preference).toBe('light');
  });

  it('cycles system -> dark -> light -> system', () => {
    theme.set('system');
    theme.next();
    expect(theme.preference).toBe('dark');
    theme.next();
    expect(theme.preference).toBe('light');
    theme.next();
    expect(theme.preference).toBe('system');
  });

  it('starts from what was stored and tracks the OS from there', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    prefersLight(false);

    const stop = theme.start();

    expect(theme.preference).toBe('light');
    expect(theme.system).toBe('dark');
    expect(typeof stop).toBe('function');
    stop();
  });
});
