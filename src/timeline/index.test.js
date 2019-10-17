/* eslint-env jest */
import { TimelineInterface } from './index';
import { pause } from './playback';
import store from './store';

const LogReaderWorker = require('./logReader');

jest.mock('./startup');
jest.mock('./logReader', () => jest.fn());
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
LogReaderWorker.onData = jest.fn();

describe('timeline index', () => {
  beforeAll(() => {
    LogReaderWorker.mockClear();
    LogReaderWorker.onData.mockClear();
  });

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

  it('listens for log reader events', async () => {
    const timeline = new TimelineInterface();

    await timeline.init(true);

    expect(LogReaderWorker.onData).toBeCalled();

    const indexHandler = jest.fn();
    timeline.onIndexed(indexHandler);

    LogReaderWorker.onData.mock.calls[0][0]({
      data: {
        route: 'asdffdsaasd',
        segment: 1,
        data: []
      }
    });
    expect(indexHandler).toBeCalled();
  });
});
