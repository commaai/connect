/* eslint-env jest */
/* eslint-disable no-import-assign */
import { routerMiddleware, LOCATION_CHANGE } from 'connected-react-router';
import thunk from 'redux-thunk';

import { history } from '../store';
import { onHistoryMiddleware } from './history';
import * as actionsIndex from './index';

jest.mock('./index', () => ({
  selectDevice: jest.fn(),
  pushTimelineRange: jest.fn(),
  primeNav: jest.fn(),
}));

const create = (initialState) => {
  const store = {
    getState: jest.fn(() => initialState),
    dispatch: jest.fn(),
  };
  const next = jest.fn();

  const middleware = (s) => (n) => (action) => {
    routerMiddleware(history)(s)(n)(action);
    onHistoryMiddleware(s)(n)(action);
    thunk(s)(n)(action);
  };
  const invoke = (action) => middleware(store)(next)(action);

  return { store, next, invoke };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('history middleware', () => {
  it('passes through non-function action', () => {
    const { next, invoke } = create();
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
  });

  it('calls the function', () => {
    const { invoke } = create();
    const fn = jest.fn();
    invoke(fn);
    expect(fn).toHaveBeenCalled();
  });

  it('passes dispatch and getState', () => {
    const { store, invoke } = create();
    invoke((dispatch, getState) => {
      dispatch('TEST DISPATCH');
      getState();
    });
    expect(store.dispatch).toHaveBeenCalledWith('TEST DISPATCH');
  });

  it('should call select dongle with history', async () => {
    const fakeInner = { id: 'kahjfiowenv' };
    actionsIndex.selectDevice.mockReturnValue(fakeInner);

    const { store, next, invoke } = create({
      dongleId: null,
      zoom: null,
      primeNav: false,
    });

    const action = {
      type: LOCATION_CHANGE,
      payload: {
        action: 'POP',
        location: { pathname: '0000aaaa0000aaaa' },
      },
    };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(fakeInner);
    expect(actionsIndex.selectDevice).toHaveBeenCalledWith('0000aaaa0000aaaa', false);
  });

  it('should call select zoom with history', async () => {
    const fakeInner = { id: 'asdfsd83242' };
    actionsIndex.pushTimelineRange.mockReturnValue(fakeInner);

    const { store, next, invoke } = create({
      dongleId: '0000aaaa0000aaaa',
      zoom: null,
      primeNav: false,
    });

    const action = {
      type: LOCATION_CHANGE,
      payload: {
        action: 'POP',
        location: { pathname: '0000aaaa0000aaaa/1230/1234' },
      },
    };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(fakeInner);
    expect(actionsIndex.pushTimelineRange).toHaveBeenCalledWith(1230, 1234, false);
  });

  it('should call prime nav with history', async () => {
    const fakeInner = { id: 'n27u3n9va' };
    const fakeInner2 = { id: 'vmklxmsd' };
    actionsIndex.pushTimelineRange.mockReturnValue(fakeInner);
    actionsIndex.primeNav.mockReturnValue(fakeInner2);

    const { store, next, invoke } = create({
      dongleId: '0000aaaa0000aaaa',
      zoom: { start: 1230, end: 1234 },
      primeNav: false,
    });

    const action = {
      type: LOCATION_CHANGE,
      payload: {
        action: 'POP',
        location: { pathname: '0000aaaa0000aaaa/prime' },
      },
    };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledTimes(2);
    expect(store.dispatch).toHaveBeenCalledWith(fakeInner);
    expect(store.dispatch).toHaveBeenCalledWith(fakeInner2);
    expect(actionsIndex.pushTimelineRange).toHaveBeenCalledWith(undefined, undefined, false);
    expect(actionsIndex.primeNav).toHaveBeenCalledWith(true);
  });
});
