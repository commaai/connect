import '@testing-library/jest-dom/vitest';
import 'whatwg-fetch';
import { vi } from 'vitest';

vi.mock('localforage');

vi.mock('mapbox-gl/dist/mapbox-gl', () => ({
  GeolocateControl: vi.fn(),
  Map: vi.fn(() => ({
    addControl: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
  })),
}));

// jsdom does not implement media playback
Object.assign(HTMLMediaElement.prototype, { load: vi.fn(), pause: vi.fn(), play: vi.fn(() => Promise.resolve()) });
