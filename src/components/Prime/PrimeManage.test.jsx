import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE, routerMiddleware } from 'connected-react-router';

import PrimeManage from './PrimeManage';

const billing = vi.hoisted(() => ({
  cancelPrime: vi.fn(),
  getSubscribeInfo: vi.fn(),
  getSubscription: vi.fn(),
  switchPrimePlan: vi.fn(),
}));

vi.mock('../../api', () => ({ billing }));
vi.mock('../../actions', () => ({
  analyticsEvent: vi.fn(() => ({ type: 'ANALYTICS' })),
  primeGetSubscription: vi.fn((_dongleId, subscription) => ({ type: 'SUBSCRIPTION', subscription })),
  primeNav: vi.fn(() => ({ type: 'PRIME_NAV' })),
}));
vi.mock('../../utils', () => ({
  deviceNamePretty: () => 'Test device',
  deviceTypePretty: () => 'comma 3X',
}));
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
vi.mock('../CommacareBadge', () => ({ default: () => null, COMMACARE_URL: '' }));
vi.mock('../../icons', () => ({
  ErrorOutline: () => null,
  InfoOutline: () => null,
  KeyboardBackspaceIcon: () => null,
  PriorityHighIcon: () => null,
}));
vi.mock('@material-ui/core', () => ({
  withStyles: () => (Component) => (props) => <Component {...props} classes={{}} />,
  Typography: ({ children }) => <p>{children}</p>,
  Paper: ({ children }) => <div>{children}</div>,
  Button: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  IconButton: ({ children, onClick, 'aria-label': label }) => <button onClick={onClick} aria-label={label}>{children}</button>,
  CircularProgress: () => <span role="progressbar" />,
  Modal: ({ open, onClose, children }) => open ? (
    <section role="dialog" onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <button aria-label="Dismiss dialog" onClick={onClose} />
      {children}
    </section>
  ) : null,
}));

const DONGLE = '0000aaaa0000aaaa';
const PRIME_PATH = `/${DONGLE}/prime`;
const subscription = { user_id: 'user', plan: 'data', subscribed_at: 1, next_charge_at: 2 };

function mountPrime(url = PRIME_PATH, initialSubscription = subscription) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const navigation = (location) => ({ dialog: new URLSearchParams(location.search).get('dialog') });
  const initialState = {
    dongleId: DONGLE,
    device: { dongle_id: DONGLE, device_type: 'threex', eligible_features: { prime_data: true } },
    subscription: initialSubscription,
    navigation: navigation(history.location),
    router: { location: history.location, action: history.action },
  };
  const store = createStore((state = initialState, action) => {
    if (action.type === LOCATION_CHANGE) {
      return { ...state, router: action.payload, navigation: navigation(action.payload.location) };
    }
    if (action.type === 'SUBSCRIPTION') {
      return { ...state, subscription: action.subscription };
    }
    return state;
  }, applyMiddleware(thunk, routerMiddleware(history)));
  const unlisten = history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  const view = render(<Provider store={store}><PrimeManage /></Provider>);
  return { history, store, unmount: () => { view.unmount(); unlisten(); } };
}

beforeEach(() => {
  vi.resetAllMocks();
  billing.getSubscription.mockResolvedValue(subscription);
  billing.getSubscribeInfo.mockResolvedValue({ sim_id: 'sim' });
});

afterEach(cleanup);

describe('PrimeManage URL dialogs', () => {
  it.each(['cancel-subscription', 'change-plan'])('opens %s from a cold link and follows back/forward', (dialog) => {
    const view = mountPrime(`${PRIME_PATH}?dialog=${dialog}`);
    expect(screen.getByRole('dialog')).toHaveTextContent(dialog === 'change-plan' ? 'Switch to Lite plan' : 'Cancel prime subscription');
    act(() => view.history.push(PRIME_PATH));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => view.history.goBack());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => view.history.goForward());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
  });

  it.each([
    ['Cancel subscription', 'cancel-subscription'],
    ['Switch to Lite plan', 'change-plan'],
  ])('opens %s in the URL without leaving Prime', (button, dialog) => {
    const view = mountPrime(`${PRIME_PATH}?existing=value`);
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(view.history.location.pathname).toBe(PRIME_PATH);
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe(dialog);
    expect(new URLSearchParams(view.history.location.search).get('existing')).toBe('value');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dismiss dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.history.location.pathname).toBe(PRIME_PATH);
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBeNull();
    expect(new URLSearchParams(view.history.location.search).get('existing')).toBe('value');
    view.unmount();
  });

  it('derives and retains the change-plan target when a cold-link subscription loads later', async () => {
    const view = mountPrime(`${PRIME_PATH}?dialog=change-plan`, null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => view.store.dispatch({ type: 'SUBSCRIPTION', subscription: { ...subscription, plan: 'nodata' } }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Switch to Standard plan');
    expect(screen.getByRole('dialog')).toHaveTextContent('$24/month');
    billing.switchPrimePlan.mockResolvedValue({ success: true });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' })));
    expect(billing.switchPrimePlan).toHaveBeenCalledWith(DONGLE, 'data', 'sim');
    expect(screen.getByRole('dialog')).toHaveTextContent('Welcome to Standard');
    expect(screen.getByRole('dialog')).toHaveTextContent('Your plan now includes data for $24/month');
    view.unmount();
  });

  it('ignores unrelated dialogs and switches visibility directly with navigation state', () => {
    const view = mountPrime(`${PRIME_PATH}?dialog=pair-device`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => view.history.push(`${PRIME_PATH}?dialog=cancel-subscription`));
    expect(screen.getByRole('dialog')).toHaveTextContent('Cancel prime subscription');
    act(() => view.history.push(`${PRIME_PATH}?dialog=change-plan`));
    expect(screen.getByRole('dialog')).toHaveTextContent('Switch to Lite plan');
    expect(screen.queryByText('Cancel prime subscription')).not.toBeInTheDocument();
    view.unmount();
  });

  it('guards cancel-dialog dismissal while submitting and keeps errors local', async () => {
    let resolveCancel;
    billing.cancelPrime.mockImplementation(() => new Promise((resolve) => { resolveCancel = resolve; }));
    const view = mountPrime(`${PRIME_PATH}?dialog=cancel-subscription`);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel subscription' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss dialog' }));
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe('cancel-subscription');
    await act(async () => resolveCancel({ error: true, description: 'Please retry cancellation' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Please retry cancellation');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => view.history.push(`${PRIME_PATH}?dialog=cancel-subscription`));
    expect(screen.getByRole('dialog')).toHaveTextContent('Please retry cancellation');
    view.unmount();
  });

  it('guards change-plan dismissal while submitting and closes the success dialog via Done', async () => {
    let resolveSwitch;
    billing.switchPrimePlan.mockImplementation(() => new Promise((resolve) => { resolveSwitch = resolve; }));
    const view = mountPrime(`${PRIME_PATH}?dialog=change-plan`);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    expect(billing.switchPrimePlan).toHaveBeenCalledWith(DONGLE, 'nodata', undefined);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss dialog' }));
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe('change-plan');
    billing.getSubscription.mockResolvedValue({ ...subscription, plan: 'nodata' });
    await act(async () => resolveSwitch({ success: true }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Your plan no longer includes data');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => view.history.push(`${PRIME_PATH}?dialog=change-plan`));
    expect(screen.getByRole('dialog')).toHaveTextContent('Switch to Standard plan');
    expect(screen.queryByText('Success')).not.toBeInTheDocument();
    view.unmount();
  });

  it('keeps change-plan failures local, retries the cold-link target, and closes with Cancel', async () => {
    billing.switchPrimePlan.mockRejectedValue({ resp: { status: 400 } });
    const view = mountPrime(`${PRIME_PATH}?dialog=change-plan`, { ...subscription, plan: 'nodata' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' })));
    expect(billing.getSubscribeInfo).toHaveBeenCalledWith(DONGLE);
    expect(billing.switchPrimePlan).toHaveBeenCalledWith(DONGLE, 'data', 'sim');
    expect(screen.getByRole('dialog')).toHaveTextContent('Standard could not be activated');
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe('change-plan');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(billing.switchPrimePlan).toHaveBeenCalledTimes(2);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.history.location.pathname).toBe(PRIME_PATH);
    act(() => view.history.push(`${PRIME_PATH}?dialog=change-plan`));
    expect(screen.queryByText('Standard could not be activated')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeInTheDocument();
    view.unmount();
  });
});
