import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { applyMiddleware, createStore } from 'redux';
import { createMemoryHistory } from 'history';
import { routerMiddleware } from 'connected-react-router';

import PrimeManage from './PrimeManage';
import { billing } from '../../api';

vi.mock('../../api', () => ({
  billing: {
    cancelPrime: vi.fn(),
    getStripePortal: vi.fn(),
    getStripeSession: vi.fn(),
    getSubscribeInfo: vi.fn(),
    getSubscription: vi.fn(),
    switchPrimePlan: vi.fn(),
  },
}));
vi.mock('../../actions', () => ({
  analyticsEvent: (name) => ({ type: 'test/analytics', name }),
  primeGetSubscription: (dongleId, subscription) => ({ type: 'test/subscription', dongleId, subscription }),
  primeNav: () => ({ type: 'test/prime-nav' }),
}));
vi.mock('../../utils', () => ({
  deviceNamePretty: (device) => device.alias,
  deviceTypePretty: () => 'comma 3X',
}));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const OTHER_DONGLE = 'bbbbbbbbbbbbbbbb';
const PRIME_PATH = `/${DONGLE}/prime`;
const subscription = {
  user_id: 'test-user',
  plan: 'data',
  amount: 2400,
  subscribed_at: 100,
  next_charge_at: 200,
};

function renderPrime(pathname = PRIME_PATH, options = {}) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const initialState = {
    dongleId: DONGLE,
    device: { dongle_id: DONGLE, alias: 'Test device', is_owner: true, prime: true },
    subscription: options.subscription === undefined ? subscription : options.subscription,
    router: { location: history.location },
  };
  const store = createStore((state = initialState, action) => {
    if (action.type === 'test/location') return { ...state, router: { location: action.location } };
    if (action.type === 'test/subscription') return { ...state, subscription: action.subscription };
    if (action.type === 'test/device') return { ...state, dongleId: action.dongleId };
    return state;
  }, applyMiddleware(routerMiddleware(history)));
  history.listen((location) => store.dispatch({ type: 'test/location', location }));
  const view = render(<PrimeManage store={store} />);
  return { ...view, history, store };
}

function expectNoBillingRequests() {
  Object.values(billing).forEach((request) => expect(request).not.toHaveBeenCalled());
}

describe('Prime dialog URLs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    billing.getSubscription.mockResolvedValue(subscription);
    billing.getSubscribeInfo.mockResolvedValue({ sim_id: 'test-sim' });
  });

  test.each([
    ['prime-plan', 'Switch to Lite plan'],
    ['prime-cancel', 'Cancel prime subscription'],
  ])('a direct %s link opens only a confirmation', (dialog, heading) => {
    renderPrime(`${PRIME_PATH}?dialog=${dialog}`);
    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    expectNoBillingRequests();
  });

  test('PUSH, POP, and REPLACE follow the URL without billing requests', () => {
    const { history } = renderPrime();
    act(() => history.push(`${PRIME_PATH}?dialog=prime-plan`));
    expect(screen.getByRole('heading', { name: 'Switch to Lite plan' })).toBeVisible();
    act(() => history.push(`${PRIME_PATH}?dialog=prime-cancel`));
    expect(screen.getByRole('heading', { name: 'Cancel prime subscription' })).toBeVisible();
    act(() => history.goBack());
    expect(screen.getByRole('heading', { name: 'Switch to Lite plan' })).toBeVisible();
    act(() => history.goForward());
    expect(screen.getByRole('heading', { name: 'Cancel prime subscription' })).toBeVisible();
    act(() => history.replace(PRIME_PATH));
    expect(screen.queryByRole('heading', { name: 'Cancel prime subscription' })).not.toBeInTheDocument();
    expectNoBillingRequests();
  });

  test.each([
    ['Switch to Lite plan', 'prime-plan', 'Cancel'],
    ['Cancel subscription', 'prime-cancel', 'Close'],
  ])('%s opens a URL and closing preserves unrelated arguments', (button, dialog, closeButton) => {
    const { history } = renderPrime(`${PRIME_PATH}?campaign=spring#payment`);
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(history.location.pathname).toBe(PRIME_PATH);
    expect(new URLSearchParams(history.location.search).get('dialog')).toBe(dialog);
    expect(new URLSearchParams(history.location.search).get('campaign')).toBe('spring');
    expect(history.location.hash).toBe('#payment');
    fireEvent.click(screen.getByRole('button', { name: closeButton }));
    expect(history.action).toBe('REPLACE');
    expect(history.location.search).toBe('?campaign=spring');
    expect(history.location.hash).toBe('#payment');
    expectNoBillingRequests();
  });

  test.each(['prime-plan', 'prime-cancel'])('a %s link cannot bypass subscription eligibility', (dialog) => {
    renderPrime(`${PRIME_PATH}?dialog=${dialog}`, {
      subscription: { ...subscription, cancel_at: 150 },
    });
    expect(screen.queryByRole('button', { name: 'Confirm switch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cancel prime subscription' })).not.toBeInTheDocument();
    expectNoBillingRequests();
  });

  test('a dialog waits for a subscription and the matching selected device', () => {
    const { store, history } = renderPrime(`${PRIME_PATH}?dialog=prime-plan`, { subscription: null });
    expect(screen.queryByRole('button', { name: 'Confirm switch' })).not.toBeInTheDocument();
    act(() => store.dispatch({ type: 'test/subscription', subscription }));
    expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeVisible();
    act(() => history.push(`/${OTHER_DONGLE}/prime?dialog=prime-plan`));
    expect(screen.queryByRole('button', { name: 'Confirm switch' })).not.toBeInTheDocument();
    expectNoBillingRequests();
  });

  test('plan changes require confirmation and success does not survive reopening', async () => {
    billing.switchPrimePlan.mockResolvedValue({ success: true });
    billing.getSubscription.mockResolvedValue({ ...subscription, plan: 'nodata', amount: 1400 });
    const { history } = renderPrime(`${PRIME_PATH}?dialog=prime-plan`);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    expect(billing.switchPrimePlan).toHaveBeenCalledWith(DONGLE, 'nodata', undefined);
    expect(await screen.findByRole('heading', { name: 'Welcome to Lite' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    act(() => history.push(`${PRIME_PATH}?dialog=prime-plan`));
    expect(screen.getByRole('heading', { name: 'Switch to Standard plan' })).toBeVisible();
    expect(screen.queryByText('Your subscription has been switched to Lite successfully.')).not.toBeInTheDocument();
    expect(billing.switchPrimePlan).toHaveBeenCalledTimes(1);
  });

  test('cancellation requires confirmation and clears its result on navigation', async () => {
    billing.cancelPrime.mockResolvedValue({ success: true });
    const { history } = renderPrime(`${PRIME_PATH}?dialog=prime-cancel`);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    expect(await screen.findByText('Cancelled subscription.')).toBeVisible();
    expect(billing.cancelPrime).toHaveBeenCalledWith(DONGLE);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    act(() => history.push(`${PRIME_PATH}?dialog=prime-cancel`));
    expect(screen.queryByText('Cancelled subscription.')).not.toBeInTheDocument();
    expect(billing.cancelPrime).toHaveBeenCalledTimes(1);
  });

  test('a cancellation result from a previous dialog visit is not shown after reopening', async () => {
    let resolveCancellation;
    billing.cancelPrime.mockImplementation(() => new Promise((resolve) => { resolveCancellation = resolve; }));
    const { history } = renderPrime(`${PRIME_PATH}?dialog=prime-cancel`);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    act(() => history.push(PRIME_PATH));
    act(() => history.goBack());
    await act(async () => resolveCancellation({ error: true, description: 'Old cancellation error' }));
    expect(screen.queryByText('Old cancellation error')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeEnabled();
    expect(billing.cancelPrime).toHaveBeenCalledTimes(1);
  });

  test('a plan change completing after device navigation cannot refresh the new device', async () => {
    let resolveSwitch;
    billing.switchPrimePlan.mockImplementation(() => new Promise((resolve) => { resolveSwitch = resolve; }));
    const { history, store } = renderPrime(`${PRIME_PATH}?dialog=prime-plan`);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    act(() => {
      history.push(`/${OTHER_DONGLE}/prime?dialog=prime-plan`);
      store.dispatch({ type: 'test/device', dongleId: OTHER_DONGLE });
    });
    await act(async () => resolveSwitch({ success: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeEnabled());
    expect(billing.getSubscription).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Welcome to Lite' })).not.toBeInTheDocument();
  });
});
