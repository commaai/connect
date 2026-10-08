import '../../../config/vitest/browserClicks';
import React from 'react';
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { fireEvent, render, screen } from '@testing-library/react';
import { routerMiddleware, LOCATION_CHANGE } from 'connected-react-router';
import Header from './index';
import { createAppStore } from '../../store';
import { createInitialState } from '../../initialState';
import { Provider } from 'react-redux';
import { ConnectedRouter } from 'connected-react-router';

function renderHeader(dongleId, pathname = '/demo', search = '?theme=dark&modal=files', hash = '#route') {
  const location = { pathname, search, hash };
  const history = createMemoryHistory({ initialEntries: [location] });
  const store = createStore((state = { dongleId, profile: null, router: { location } }, action) => (
    action.type === LOCATION_CHANGE ? { ...state, router: { location: action.payload.location } } : state
  ), applyMiddleware(thunk, routerMiddleware(history)));
  history.listen((nextLocation) => store.dispatch({ type: LOCATION_CHANGE, payload: { location: nextLocation } }));
  render(<Router history={history}><Header store={store} handleDrawerStateChanged={() => {}} /></Router>);
  return history;
}


test('dashboard logo retains unrelated query/hash and drops overlay parameters', () => {
  const history = renderHeader('deadbeefdeadbeef', '/demo/00000000--0000000001');
  const link = screen.getByRole('link', { name: 'connect' });
  expect(link).toHaveAttribute('href', '/demo?theme=dark#route');
  fireEvent.click(link);
  expect(history.location.pathname).toBe('/demo');
  expect(history.location.search).toBe('?theme=dark');
});

test('logo without a selected device never links to null', () => {
  renderHeader(null, '/', '', '');
  expect(screen.getByRole('link', { name: 'connect' })).toHaveAttribute('href', '/');
});

test('referrals click matches href and pushes once, modified clicks leave history alone', () => {
  const history = renderHeader('deadbeefdeadbeef');
  const link = screen.getByRole('button', { name: 'referrals' });
  expect(link).toHaveAttribute('href', '/referrals?theme=dark#route');
  fireEvent.click(link);
  expect(history.length).toBe(2);
  expect(history.location.pathname + history.location.search + history.location.hash).toBe('/referrals?theme=dark#route');
  fireEvent.click(link, { ctrlKey: true });
  fireEvent.click(link, { metaKey: true });
  expect(history.length).toBe(2);
});

test('closing referrals restores the demo dashboard and query/hash', () => {
  const history = renderHeader('deadbeefdeadbeef', '/referrals', '?theme=dark', '#route');
  fireEvent.click(screen.getByRole('button', { name: 'referrals' }));
  expect(history.location.pathname + history.location.search + history.location.hash).toBe('/demo?theme=dark#route');
  expect(history.length).toBe(2);
});


test('two gift clicks return to the device with the real coordinator and reducer', () => {
  const history = createMemoryHistory({ initialEntries: ['/demo?theme=dark#route'] });
  const initial = createInitialState('/demo');
  initial.routes = [];
  initial.routesMeta = { dongleId: initial.dongleId, start: initial.filter.start, end: initial.filter.end };
  initial.limit = 5;
  const store = createAppStore(history, initial);
  render(<Provider store={store}><ConnectedRouter history={history}>
    <Header handleDrawerStateChanged={() => {}} />
  </ConnectedRouter></Provider>);
  const gift = screen.getByRole('button', { name: 'referrals' });
  fireEvent.click(gift);
  expect(history.location.pathname).toBe('/referrals');
  expect(store.getState().dongleId).toBeNull();
  expect(gift).toHaveAttribute('href', '/demo?theme=dark#route');
  fireEvent.click(gift);
  expect(history.location.pathname + history.location.search + history.location.hash).toBe('/demo?theme=dark#route');
  expect(store.getState().dongleId).toBe('deadbeefdeadbeef');
});
