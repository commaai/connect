/* eslint-env jest */
import '@testing-library/jest-dom';
import 'whatwg-fetch';

jest.mock('localforage');

// Provide requestAnimationFrame in the Jest/jsdom environment
if (!global.requestAnimationFrame) {
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}
if (!global.cancelAnimationFrame) {
  global.cancelAnimationFrame = (id) => clearTimeout(id);
}
