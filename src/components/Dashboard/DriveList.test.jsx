import React from 'react';
import { Provider } from 'react-redux';
import * as Redux from 'redux';
import { render } from '@testing-library/react';

import { checkRoutesData } from '../../actions';
import { DriveList } from './DriveList';

vi.mock('../../actions', () => ({
  checkRoutesData: vi.fn(() => ({ type: 'CHECK_ROUTES_DATA' })),
  checkLastRoutesData: vi.fn(),
}));
vi.mock('../TimeSelect', () => ({ default: () => null }));
vi.mock('./DriveListEmpty', () => ({ default: () => null }));
vi.mock('./DriveListItem', () => ({ default: () => null }));
vi.mock('../ScrollIntoView', () => ({ default: () => null }));

describe('dashboard route list', () => {
  it('checks route metadata when the dashboard list mounts', () => {
    const state = { dongleId: 'device' };
    const store = Redux.createStore((currentState = state) => currentState);
    const dispatch = vi.fn();

    render(
      <Provider store={store}>
        <DriveList
          dispatch={dispatch}
          classes={{ drives: '', stickyFilters: '' }}
          device={{ shared: true }}
          dongleId="device"
          routes={[{ fullname: 'device|route', start_time_utc_millis: 1 }]}
          lastRoutes={null}
        />
      </Provider>,
    );

    expect(checkRoutesData).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: 'CHECK_ROUTES_DATA' });
  });
});
