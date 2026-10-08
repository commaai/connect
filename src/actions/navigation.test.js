import { createMemoryHistory } from 'history';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { connectRouter, LOCATION_CHANGE, routerMiddleware } from 'connected-react-router';
import { openModal, closeModal, openClip, navigate } from './navigation';

const DONGLE = 'aaaaaaaaaaaaaaaa';
const DRIVE = `/${DONGLE}/0000010a--a51155e496/0/20`;

function setup(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const store = createStore(connectRouter(history)((state = {}) => state), applyMiddleware(thunk, routerMiddleware(history)));
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: 'POP' } });
  return { history, store };
}

it('closes nested settings through Back when the opener has an implicit device', () => {
  const { history, store } = setup(`${DRIVE}?token=abc&modal=settings#video`);
  store.dispatch(openModal('settings-unpair', DONGLE));
  expect(history.index).toBe(1);
  store.dispatch(closeModal('settings'));
  expect(history.index).toBe(0);
  expect(history.location.search).toBe('?token=abc&modal=settings');
  expect(history.location.hash).toBe('#video');
});

it('closes cold nested URLs to their parent without leaving the application', () => {
  const { history, store } = setup(`${DRIVE}?modal=drive-clips&clip=trip.mp4&clipAction=view`);
  store.dispatch(closeModal('drive-clips'));
  expect(history.length).toBe(1);
  expect(history.location.pathname).toBe(DRIVE);
  expect(history.location.search).toBe('?modal=drive-clips');
});

it('supports Back, Forward and close for a clip selection', () => {
  const { history, store } = setup(`${DRIVE}?modal=drive-clips`);
  store.dispatch(openClip('trip.mp4', 'delete'));
  expect(history.location.search).toBe('?modal=drive-clips&clip=trip.mp4&clipAction=delete');
  store.dispatch(closeModal('drive-clips'));
  expect(history.index).toBe(0);
  history.goForward();
  expect(history.location.search).toContain('clipAction=delete');
});

it('preserves the selected checkout plan when closing a Prime modal', () => {
  const { history, store } = setup(`/${DONGLE}/prime?plan=data&stripe_success=true`);
  store.dispatch(openModal('prime-switch', null, 'nodata'));
  store.dispatch(closeModal());
  expect(history.index).toBe(0);
  expect(history.location.search).toBe('?plan=data&stripe_success=true');
});

it('closing all overlays does not accidentally return to a different parent overlay', () => {
  const { history, store } = setup(`${DRIVE}?modal=settings`);
  store.dispatch(openModal('settings-unpair', DONGLE));
  store.dispatch(closeModal());
  expect(history.location.search).toBe('');
});


it('navigates to the canonical settings overlay while retaining location state', () => {
  const { history, store } = setup(DRIVE);
  store.dispatch(navigate({ pathname: `/${DONGLE}/settings`, search: '?token=abc', hash: '#device', state: { reviewed: true } }));
  expect(history.location).toMatchObject({
    pathname: `/${DONGLE}`, search: '?token=abc&modal=settings', hash: '#device', state: { reviewed: true },
  });
  store.dispatch(closeModal());
  expect(history.location.search).toBe('?token=abc');
  expect(history.location.pathname).toBe(`/${DONGLE}`);
});

it('closes a cold settings alias with replace so it cannot reopen on Back', () => {
  const { history, store } = setup(`/${DONGLE}/settings?token=abc#device`);
  store.dispatch(closeModal());
  expect(history.length).toBe(1);
  expect(history.location).toMatchObject({ pathname: `/${DONGLE}`, search: '?token=abc', hash: '#device' });
});
