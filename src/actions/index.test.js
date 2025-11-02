/* eslint-env jest */
import { navigate } from '../navigation';
import { pushTimelineRange } from './index';

jest.mock('../navigation', () => ({
  navigate: jest.fn(),
  replace: jest.fn(),
}));

describe('timeline actions', () => {
  it('should push history state when editing zoom', () => {
    const dispatch = jest.fn();
    const getState = jest.fn();
    const actionThunk = pushTimelineRange("log_id", 123, 1234);

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(navigate).toBeCalledWith('/statedongle/log_id');
  });
});
