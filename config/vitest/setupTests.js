import '@testing-library/jest-dom/vitest';
import 'whatwg-fetch';
import { vi } from 'vitest';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });

vi.mock('localforage');

vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    supported: vi.fn(() => true),
    Map: vi.fn(function ({ container }) {
      const sources = new globalThis.Map();
      return {
        addControl: vi.fn(),
        addLayer: vi.fn(),
        addSource: vi.fn((id, source) => sources.set(id, {
          _data: source.data,
          setData(data) { this._data = data; },
        })),
        easeTo: vi.fn(),
        fitBounds: vi.fn(),
        getContainer: vi.fn(() => container),
        getSource: vi.fn((id) => sources.get(id)),
        jumpTo: vi.fn(),
        off: vi.fn(),
        on: vi.fn((event, listener) => {
          if (event === 'load') listener();
        }),
        once: vi.fn((event, listener) => {
          if (event === 'load') listener();
        }),
        project: vi.fn(() => ({ x: 0, y: 0 })),
        remove: vi.fn(),
        resize: vi.fn(),
      };
    }),
    GeolocateControl: vi.fn(function () {
      return {
        off: vi.fn(),
        on: vi.fn(),
        trigger: vi.fn(),
      };
    }),
    Marker: vi.fn(function ({ element }) {
      let lngLat = { lng: 0, lat: 0 };
      return {
        addTo: vi.fn((map) => map.getContainer().appendChild(element)),
        getElement: vi.fn(() => element),
        getLngLat: vi.fn(() => lngLat),
        remove: vi.fn(() => element.remove()),
        setLngLat: vi.fn(([lng, lat]) => {
          lngLat = { lng, lat };
        }),
      };
    }),
  },
}));
