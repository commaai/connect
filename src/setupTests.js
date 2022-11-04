/* eslint-env jest */
// eslint-disable-next-line import/no-extraneous-dependencies
import '@testing-library/jest-dom';

jest.mock('localforage');

jest.mock('mapbox-gl/dist/mapbox-gl', () => ({
  GeolocateControl: jest.fn(),
  Map: jest.fn(() => ({
    addControl: jest.fn(),
    on: jest.fn(),
    remove: jest.fn(),
  })),
  NavigationControl: jest.fn(),
}));
