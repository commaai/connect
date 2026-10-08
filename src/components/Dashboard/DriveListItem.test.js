import '../../../config/vitest/browserClicks';
import { vi } from 'vitest';
import React from 'react';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { fireEvent, render, screen } from '@testing-library/react';
import { navigate } from '../../actions/navigation';
import DriveListItem from './DriveListItem';

const defaultState = {
  start: Date.now(),
  router: { location: { search: '', hash: '' } },
};

vi.mock('../../actions/navigation', () => ({ navigate: vi.fn(() => () => {}) }));

vi.mock('../Timeline', () => ({ default: () => null }));
vi.mock('../../timeline', () => ({ currentOffset: vi.fn(() => 0) }));

const store = Redux.createStore((state) => {
  if (!state) {
    return { ...defaultState };
  }
  return state;
}, Redux.applyMiddleware(thunk));

describe('drive list items', () => {
  it('copies and opens the same demo hex-ID drive URL with query and hash', () => {
    const demoStore = Redux.createStore(() => ({ router: { location: { search: '?theme=dark', hash: '#route' } } }), Redux.applyMiddleware(thunk));
    render(React.createElement(DriveListItem, { store: demoStore, drive: {
      fullname: 'deadbeefdeadbeef|00000000--0000000001', dongle_id: 'deadbeefdeadbeef',
      log_id: '00000000--0000000001', duration: 60000, distance: 1,
      start_time_utc_millis: 1000, end_time_utc_millis: 61000,
    } }));
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/demo/00000000--0000000001?theme=dark#route');
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith({
      page: 'drive', dongleId: 'deadbeefdeadbeef', logId: '00000000--0000000001',
      zoom: null, legacyRange: null, demo: true, search: '?theme=dark', hash: '#route',
    });
    navigate.mockClear();
    fireEvent.click(link, { ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('has DriveEntry class', () => {
    render(React.createElement(DriveListItem, {
      store,
      drive: {
        fullname: '1d3dc3e03047b0c7/000000dd--455f14369d',
        dongle_id: '1d3dc3e03047b0c7',
        log_id: '000000dd--455f14369d',
        start_time_utc_millis: 1570830798378,
        end_time_utc_millis: 1570830798378 + 1234,
        distance: 12.5212,
        duration: 1234,
      },
    }));
    expect(screen.getByRole('link')).toHaveClass('DriveEntry');
  });
});
