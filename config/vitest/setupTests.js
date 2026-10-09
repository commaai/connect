import '@testing-library/jest-dom/vitest';
import 'whatwg-fetch';
import { vi } from 'vitest';

vi.mock('localforage');

vi.mock('mapbox-gl/dist/mapbox-gl', () => {
  const mapboxgl = {
    GeolocateControl: vi.fn(),
    Map: vi.fn(() => ({
      addControl: vi.fn(),
      on: vi.fn(),
      remove: vi.fn(),
      resize: vi.fn(),
    })),
  };
  return { ...mapboxgl, default: mapboxgl };
});

// jsdom does not implement media playback
window.HTMLMediaElement.prototype.play = vi.fn(async () => {});
window.HTMLMediaElement.prototype.pause = vi.fn();
window.HTMLMediaElement.prototype.load = vi.fn();
