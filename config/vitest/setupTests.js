import '@testing-library/jest-dom/vitest';
import 'whatwg-fetch';
import { vi } from 'vitest';

vi.mock('localforage');

// jsdom doesn't implement media playback; the app drives a real <video>.
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
HTMLMediaElement.prototype.pause = vi.fn();
HTMLMediaElement.prototype.load = vi.fn();
HTMLMediaElement.prototype.canPlayType = vi.fn(() => 'maybe');

vi.mock('mapbox-gl/dist/mapbox-gl', () => ({
  GeolocateControl: vi.fn(),
  Map: vi.fn(() => ({
    addControl: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
  })),
}));
