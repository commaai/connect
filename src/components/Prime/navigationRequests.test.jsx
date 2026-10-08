import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as Sentry from '@sentry/react';
import { billing as Billing } from '../../api';
import { hardNavigate } from '../../utils/navigation';
import { PrimeManage } from './PrimeManage';
import { PrimeCheckout } from './PrimeCheckout';

vi.mock('../../api', () => ({ billing: { getStripePortal: vi.fn(), getStripeCheckout: vi.fn() } }));
vi.mock('../../actions', () => ({
  analyticsEvent: (name, parameters) => ({ type: 'analytics', name, parameters }),
  primeFetchSubscription: () => ({ type: 'fetchSubscription' }),
  primeGetSubscription: vi.fn(),
  primeNav: vi.fn(),
}));
vi.mock('../../actions/navigation', () => ({ openModal: vi.fn(), closeModal: vi.fn() }));
vi.mock('../../hooks/window', () => ({ subscribeWindowSize: () => () => {} }));
vi.mock('../../utils/navigation', () => ({ hardNavigate: vi.fn() }));
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

// Keep the real lifecycle and async actions; only simplify presentation so the
// tests exercise request ownership independently of billing plan layout.
class Portal extends PrimeManage {
  render() {
    return <button onClick={this.gotoUpdate}>Start</button>;
  }
}
class Checkout extends PrimeCheckout {
  render() {
    return <>
      <button onClick={this.gotoCheckout}>Start</button>
      <span>{this.state.loadingCheckout ? 'Waiting' : 'Ready'}</span>
      {this.state.error && <span role="alert">{this.state.error}</span>}
    </>;
  }
}
const DEVICE = 'aaaaaaaaaaaaaaaa';
const LOCATION = { pathname: `/${DEVICE}/prime`, search: '', hash: '', key: 'first' };
const destination = 'https://billing.example/session';
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function props() {
  return {
    dongleId: DEVICE,
    location: LOCATION,
    subscription: { plan: 'nodata' },
    subscribeInfo: { sim_id: 'sim' },
    device: {},
    dispatch: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

for (const [name, Component, method] of [
  ['portal', Portal, 'getStripePortal'],
  ['checkout', Checkout, 'getStripeCheckout'],
]) {
  describe(`${name} redirect ownership`, () => {
    it('redirects when the initiating navigation is still current', async () => {
      const response = deferred();
      Billing[method].mockReturnValueOnce(response.promise);
      render(<Component {...props()} />);
      fireEvent.click(screen.getByText('Start'));
      await act(async () => response.resolve({ url: destination }));
      expect(hardNavigate).toHaveBeenCalledExactlyOnceWith(destination);
    });

    it('rejects a response after leaving and returning to the same URL', async () => {
      const response = deferred();
      const initial = props();
      Billing[method].mockReturnValueOnce(response.promise);
      const view = render(<Component {...initial} />);
      fireEvent.click(screen.getByText('Start'));
      view.rerender(<Component {...initial} location={{ ...LOCATION, pathname: `/${DEVICE}`, key: 'away' }} />);
      view.rerender(<Component {...initial} location={{ ...LOCATION, key: 'return' }} />);
      await act(async () => response.resolve({ url: destination }));
      expect(hardNavigate).not.toHaveBeenCalled();
      expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
    });

    it('rejects a response after changing the device', async () => {
      const response = deferred();
      const initial = props();
      Billing[method].mockReturnValueOnce(response.promise);
      const view = render(<Component {...initial} />);
      fireEvent.click(screen.getByText('Start'));
      view.rerender(<Component {...initial} dongleId="bbbbbbbbbbbbbbbb" />);
      await act(async () => response.resolve({ url: destination }));
      expect(hardNavigate).not.toHaveBeenCalled();
    });

    it('rejects a response after unmount', async () => {
      const response = deferred();
      Billing[method].mockReturnValueOnce(response.promise);
      const view = render(<Component {...props()} />);
      fireEvent.click(screen.getByText('Start'));
      view.unmount();
      await act(async () => response.resolve({ url: destination }));
      expect(hardNavigate).not.toHaveBeenCalled();
    });

    it('allows only the latest of overlapping requests to redirect', async () => {
      const oldResponse = deferred();
      const newResponse = deferred();
      Billing[method].mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise);
      render(<Component {...props()} />);
      fireEvent.click(screen.getByText('Start'));
      fireEvent.click(screen.getByText('Start'));
      await act(async () => oldResponse.resolve({ url: 'https://billing.example/old' }));
      expect(hardNavigate).not.toHaveBeenCalled();
      await act(async () => newResponse.resolve({ url: destination }));
      expect(hardNavigate).toHaveBeenCalledExactlyOnceWith(destination);
    });

    it('ignores a late failure after navigation', async () => {
      const response = deferred();
      const initial = props();
      Billing[method].mockReturnValueOnce(response.promise);
      const view = render(<Component {...initial} />);
      fireEvent.click(screen.getByText('Start'));
      view.rerender(<Component {...initial} location={{ ...LOCATION, key: 'later' }} />);
      await act(async () => response.reject(new Error('late failure')));
      expect(hardNavigate).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
}

it('clears checkout loading and offers retry when the current request fails', async () => {
  const response = deferred();
  Billing.getStripeCheckout.mockReturnValueOnce(response.promise);
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<Checkout {...props()} />);
    fireEvent.click(screen.getByText('Start'));
    await act(async () => response.reject(new Error('service unavailable')));
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to start checkout. Please try again.');
    expect(hardNavigate).not.toHaveBeenCalled();
  } finally {
    errorLog.mockRestore();
  }
});
