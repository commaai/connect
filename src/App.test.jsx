import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';

const auth = vi.hoisted(() => ({ authenticated: true }));

vi.mock('@commaai/my-comma-auth', () => ({
  default: {
    init: vi.fn(async () => auth.authenticated ? 'test-token' : null),
    isAuthenticated: vi.fn(() => auth.authenticated),
    logOut: vi.fn(),
  },
  config: { AUTH_PATH: '/auth/' },
  storage: { setCommaAccessToken: vi.fn() },
}));

vi.mock('./api', () => ({
  athena: { configure: vi.fn() },
  auth: { refreshAccessToken: vi.fn() },
  billing: { configure: vi.fn() },
  drives: { getRoutesSegments: vi.fn(async () => []) },
  request: { configure: vi.fn() },
}));
vi.mock('./utils/turn', () => ({ fetchTurnCredentials: vi.fn(async () => null) }));
vi.mock('./utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn(), reconnect: vi.fn() } }));
vi.mock('./components/explorer', async () => {
  const { useLocation } = await import('react-router');
  return { default: () => <main data-testid="app-dashboard">Dashboard {useLocation().pathname}</main> };
});
vi.mock('./components/anonymous', async () => {
  const { useLocation } = await import('react-router');
  return { default: () => <main>Sign in with Google {useLocation().pathname}</main> };
});

async function renderApp(pathname, authenticated = true) {
  auth.authenticated = authenticated;
  window.history.replaceState({}, '', pathname);
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(history.location.pathname));
  render(<App history={history} store={store} />);
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument());
  return { history, store };
}

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const SHARED = 'cccccccccccccccc';
const LOG = '2026-08-06--12-00-00';
const START = Date.UTC(2026, 7, 6, 12);

describe('whole-app routing behavior', () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.clearAllMocks();
  });

  test.each([
    ['valid stored device', FIRST],
    ['no stored device', undefined],
    ['unknown stored device', 'dddddddddddddddd'],
    ['no devices', undefined],
  ])('root startup: %s', async (_name, selected) => {
    if (selected) localStorage.setItem('selectedDongleId', selected);
    const { store } = await renderApp('/');
    expect(screen.getByTestId('app-dashboard')).toBeVisible();
    expect(store.getState()).toMatchObject({ dongleId: null, primeNav: false, streamNav: false, segmentRange: null });
  });

  test.each([
    ['owned device', FIRST],
    ['shared device', SHARED],
    ['empty dashboard filter', FIRST],
  ])('device dashboard: %s', async (_name, dongleId) => {
    const { store } = await renderApp(`/${dongleId}`);
    expect(screen.getByText(`Dashboard /${dongleId}`)).toBeVisible();
    expect(store.getState().dongleId).toBe(dongleId);
  });

  test.each([
    ['authenticated whole drive', `/${FIRST}/${LOG}`, true],
    ['authenticated ranged drive', `/${FIRST}/${LOG}/10/20`, true],
    ['public whole drive', `/${FIRST}/${LOG}`, false],
    ['public ranged drive', `/${FIRST}/${LOG}/10/20`, false],
  ])('drive cold entry: %s', async (_name, pathname, authenticated) => {
    const { store } = await renderApp(pathname, authenticated);
    expect(screen.getByTestId('app-dashboard')).toHaveTextContent(pathname);
    expect(store.getState().segmentRange?.log_id).toBe(LOG);
  });

  test.each([
    ['private device', `/${FIRST}`],
    ['Prime', `/${FIRST}/prime`],
    ['stream', `/${FIRST}/stream`],
  ])('signed-out entry retains path: %s', async (_name, pathname) => {
    const { history } = await renderApp(pathname, false);
    expect(screen.getByText(/Sign in with Google/)).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
  });

  test('missing public route can return to its requested path', async () => {
    const pathname = `/${FIRST}/2026-08-06--99-99-99`;
    await renderApp(`/?r=${pathname}`, false);
    expect(screen.getByText(/Sign in with Google/)).toBeVisible();
    expect(new URLSearchParams(window.location.search).get('r')).toBe(pathname);
  });

  test.each([
    ['successful legacy lookup', `/${FIRST}/${START}/${START + 60_000}`],
    ['empty legacy lookup', `/${FIRST}/${START}/${START + 60_000}`],
    ['failed legacy lookup', `/${FIRST}/${START}/${START + 60_000}`],
  ])('legacy timestamps: %s', async (_name, pathname) => {
    const { history, store } = await renderApp(pathname);
    expect(history.location.pathname).toBe(pathname);
    expect(store.getState().dongleId).toBe(FIRST);
  });

  test.each([
    ['Prime close and history', `/${FIRST}/prime`, `/${FIRST}`],
    ['stream close and history', `/${FIRST}/stream`, `/${FIRST}`],
    ['device dashboard history', `/${FIRST}`, `/${SECOND}`],
    ['drive range and close history', `/${FIRST}/${LOG}`, `/${FIRST}/${LOG}/10/20`],
  ])('browser navigation: %s', async (_name, from, to) => {
    const { history } = await renderApp(from);
    act(() => history.push(to));
    expect(screen.getByTestId('app-dashboard')).toHaveTextContent(to);
    act(() => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(from));
    act(() => history.goForward());
    await waitFor(() => expect(history.location.pathname).toBe(to));
  });
});
