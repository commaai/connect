import 'whatwg-fetch';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach, vi } from 'vitest';

// jsdom has no layout engine, and components that measure or observe the box
// they are in would otherwise throw on mount.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});

// config/jest/setupTests.js mocked these because a component reaching either one
// under jsdom throws: localforage has no IndexedDB, mapbox-gl has no WebGL.
vi.mock('localforage');
vi.mock('mapbox-gl/dist/mapbox-gl', () => ({
  default: {
    GeolocateControl: vi.fn(),
    Map: vi.fn(() => ({ addControl: vi.fn(), on: vi.fn(), remove: vi.fn() })),
  },
  GeolocateControl: vi.fn(),
  Map: vi.fn(() => ({ addControl: vi.fn(), on: vi.fn(), remove: vi.fn() })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // clearAllMocks only forgets the calls, so a spy's mockReturnValue outlives
  // the test that set it — a component reading navigator.userAgent then sees
  // the previous test's browser. Spies have to be put back too.
  vi.restoreAllMocks();
});
