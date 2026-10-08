import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';

import PrimeManage from './PrimeManage';
import rootReducer from '../../reducers';
import { createInitialState } from '../../initialState';
import { primeFetchSubscription, primeGetSubscription } from '../../actions';

const DONGLE_ID = 'aaaaaaaaaaaaaaaa';
const subscription = {
  user_id: 'test-user',
  plan: 'data',
  amount: 2400,
  subscribed_at: 1780000000,
  next_charge_at: 1782678400,
};

function renderPrime(currentSubscription) {
  const store = createStore(rootReducer, {
    ...createInitialState(`/${DONGLE_ID}/prime`),
    device: { dongle_id: DONGLE_ID, alias: 'My comma', is_owner: true, prime: true },
    profile: { user_id: subscription.user_id },
    subscription: currentSubscription,
  }, applyMiddleware(thunk));
  render(<Provider store={store}><PrimeManage /></Provider>);
  return store;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Prime high usage notice', () => {
  test('shows a useful notice for a flagged Standard subscription', () => {
    renderPrime({ ...subscription, high_usage: true });

    expect(screen.getByRole('status')).toHaveTextContent('High cellular data usage!');
    expect(screen.getByRole('status')).toHaveTextContent('Use Wi-Fi for large transfers');
    expect(screen.getByRole('button', { name: 'Update payment method' })).toBeEnabled();
  });

  test.each([
    ['normal usage', { ...subscription, high_usage: false }],
    ['unknown usage', subscription],
    ['Lite plan', { ...subscription, plan: 'nodata', high_usage: true }],
    ['no subscription', null],
  ])('does not show a notice for %s', (_name, currentSubscription) => {
    renderPrime(currentSubscription);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('appears and clears when the existing subscription request refreshes', async () => {
    const store = renderPrime(subscription);
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...subscription, high_usage: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...subscription, high_usage: false })));
    vi.stubGlobal('fetch', fetch);

    store.dispatch(primeFetchSubscription(DONGLE_ID, store.getState().device));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe('/v1/prime/subscription');

    store.dispatch(primeFetchSubscription(DONGLE_ID, store.getState().device));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('ignores a usage response for a different device', () => {
    const store = renderPrime(subscription);

    act(() => {
      store.dispatch(primeGetSubscription('bbbbbbbbbbbbbbbb', { ...subscription, high_usage: true }));
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(store.getState().subscription).toBe(subscription);
  });
});
