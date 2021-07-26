/* eslint-env jest */
import { TimelineInterface } from './index';
import { pause } from './playback';
import store from './store';

jest.mock('./startup');
jest.mock('./timeline', () => ({
  init: jest.fn(() => new Promise((resolve) => resolve())),
  getState: jest.fn(() => {
    const storeRef = require('./store').default;
    return storeRef.getState();
  })
}));
jest.mock('./commands', () => ({
  commands: {
    hello: jest.fn(() => new Promise((resolve) => resolve())),
    cachePort: jest.fn(() => new Promise((resolve) => resolve())),
  }
}));

describe('timeline index', () => {
  it('fails without auth', async () => {
    const timeline = new TimelineInterface();
    expect(timeline).toBeTruthy();
    expect.assertions(2);
    try {
      await timeline.init();
    } catch (e) {
      expect(() => { throw e; }).toThrowError('No auth');
    }
  });

  it('subscribes to store changes', async () => {
    const timeline = new TimelineInterface();

    expect(timeline).toBeTruthy();
    const stateHandler = jest.fn();
    timeline.onStateChange(stateHandler);

    await timeline.init(true);

    expect(stateHandler).toBeCalled();
    stateHandler.mockClear();

    store.dispatch(pause());
    expect(stateHandler).toBeCalled();
  });
});
