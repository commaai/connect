import '@testing-library/jest-dom/vitest';
import 'whatwg-fetch';
import { vi } from 'vitest';

vi.mock('localforage');

// jsdom does not implement media playback
beforeEach(() => ['load', 'pause', 'play'].forEach((method) => {
  HTMLMediaElement.prototype[method] = vi.fn(async () => undefined);
}));

vi.mock('mapbox-gl/dist/mapbox-gl', () => ({
  GeolocateControl: vi.fn(),
  Map: vi.fn(() => ({
    addControl: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
  })),
}));
