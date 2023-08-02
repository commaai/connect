/* eslint-env jest */
import { push } from 'connected-react-router';
import { pushTimelineRange } from './index';

jest.mock('connected-react-router', () => {
  const originalModule = jest.requireActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: jest.fn(),
  };
});

describe('timeline actions', () => {
  it('should push history state when editing zoom', () => {
    const dispatch = jest.fn();
    const getState = jest.fn();
    const actionThunk = pushTimelineRange(123, 1234);

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/123/1234');
  });
});
