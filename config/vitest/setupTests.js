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

// jsdom doesn't implement media playback; the drive <video> calls these
HTMLMediaElement.prototype.load = () => {};
HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();
globalThis.MediaError ??= { MEDIA_ERR_NETWORK: 2, MEDIA_ERR_DECODE: 3, MEDIA_ERR_SRC_NOT_SUPPORTED: 4 };
