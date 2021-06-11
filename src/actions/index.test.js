/* eslint-env jest */
import { push } from 'connected-react-router';
import window from 'global/window';
import { selectRange } from './index';

jest.mock('connected-react-router', () => ({
  push: jest.fn()
}));

describe('timeline actions', () => {
  it('should read dongleid from url when editing zoom', () => {
    const dispatch = jest.fn();
    const getState = jest.fn();
    const actionThunk = selectRange(123, 1234);

    getState.mockImplementationOnce(() => ({
      workerState: {
        dongleId: 'statedongle',
        loop: {},
      },
      zoom: {},
    }));
    window.history.replaceState({}, 'test page', '/0000aaaa0000aaaa');
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/0000aaaa0000aaaa/123/1234');
  });
});
