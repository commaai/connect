import '../../../config/vitest/browserClicks';
import React from 'react';
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { routerMiddleware, LOCATION_CHANGE } from 'connected-react-router';
import DriveView from './index';

vi.mock('./Media', () => ({ default: () => null }));
vi.mock('../Timeline', () => ({ default: () => null }));

function renderDrive(zoom, warm = false) {
  const history = createMemoryHistory({ initialEntries: [...(warm ? ['/demo?theme=dark#route'] : []), '/demo/00000000--0000000001/1/10?theme=dark#route'] });
  const initial = {
    dongleId: 'deadbeefdeadbeef', zoom, routes: [],
    currentRoute: { log_id: '00000000--0000000001', duration: 60000, start_time_utc_millis: 1000 },
    router: { location: history.location },
  };
  const store = createStore((state = initial, action) => (action.type === LOCATION_CHANGE
    ? { ...state, router: { location: action.payload.location } } : state), applyMiddleware(thunk, routerMiddleware(history)));
  history.listen((location) => store.dispatch({ type: LOCATION_CHANGE, payload: { location } }));
  render(<DriveView store={store} />);
  return history;
}


test('Back drops the selected range rather than using zoom.previous', () => {
  const history = renderDrive({ start: 1000, end: 10000, previous: { start: 2000, end: 5000 } });
  fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
  expect(history.location.pathname + history.location.search + history.location.hash).toBe('/demo/00000000--0000000001?theme=dark#route');
  expect(history.length).toBe(2);
});

test('whole-drive Back is disabled and Close delegates to history-aware closure', () => {
  const history = renderDrive({ start: 0, end: 60000 });
  expect(screen.getByRole('button', { name: 'Go Back' })).toBeDisabled();
  const close = screen.getByRole('button', { name: 'Close' });
  expect(close).toHaveAttribute('href', '/demo?theme=dark#route');
  fireEvent.click(close, { ctrlKey: true });
  expect(history.location.pathname).toBe('/demo/00000000--0000000001/1/10');
  fireEvent.click(close);
  expect(history.location.pathname + history.location.search + history.location.hash).toBe('/demo?theme=dark#route');
  expect(history.length).toBe(1);
});


test('warm dashboard-to-drive Close adds no extra history entry', () => {
  const history = renderDrive({ start: 0, end: 60000 }, true);
  expect(history.length).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(history.location.pathname + history.location.search + history.location.hash).toBe('/demo?theme=dark#route');
  expect(history.length).toBe(2);
});


test('an absent cold route does not wait for dashboard metadata', () => {
  const store = createStore(() => ({
    dongleId: 'deadbeefdeadbeef', routes: null, currentRoute: null,
    missingRouteId: 'deadbeefdeadbeef|00000000--0000000001',
    router: { location: { pathname: '/demo/00000000--0000000001', search: '', hash: '' } },
  }));
  render(<DriveView store={store} />);
  expect(screen.getByText('Route does not exist.')).toBeVisible();
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
});
