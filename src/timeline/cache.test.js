/* eslint-env jest */
import { setCachePort, getEntry, onExpire } from './cache';

describe('main thread cache', () => {
  const port = {
    postMessage: jest.fn()
  };
  const routeData = {
    route: 'sdafasdf',
    segment: 0
  };

  beforeEach(() => {
    setCachePort(port);
    port.postMessage.mockClear();
  });

  it('should remove onmessage handler when port changes', () => {
    expect(port.onmessage).toBeTruthy();
    setCachePort({ });
    expect(port.onmessage).not.toBeTruthy();
  });

  it('calls touch and start', () => {
    expect(port.postMessage).not.toBeCalled();
    const entry = getEntry(routeData.route, routeData.segment);
    expect(port.postMessage).toBeCalledWith({ command: 'touch', data: routeData });
    port.postMessage.mockClear();
    entry.start();
    expect(port.postMessage).toBeCalledWith({ command: 'start', data: routeData });
  });

  it('should pass through expire events', () => {
    const expireHandler = jest.fn();
    const unlisten = onExpire(expireHandler);
    expect(port.onmessage).toBeTruthy();
    port.onmessage({
      data: {
        command: 'expire',
        data: routeData
      }
    });

    expect(expireHandler).toBeCalledWith(routeData);

    unlisten();
  });

  it('handles unexpected messages correctly', () => {
    const expireHandler = jest.fn();
    const unlisten = onExpire(expireHandler);

    port.onmessage();
    port.onmessage({});
    port.onmessage({
      data: {}
    });

    expect(port.postMessage).not.toBeCalled();
    expect(expireHandler).not.toBeCalled();

    unlisten();
  });
});
