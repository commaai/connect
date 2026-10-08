import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import DeviceList from './DeviceList';
import { openModal } from '../../actions/navigation';

vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => false } }));
vi.mock('../VisibilityHandler', () => ({ default: () => null }));
vi.mock('./AddDevice', () => ({ default: () => null }));
vi.mock('../../actions/navigation', () => ({ openModal: vi.fn((modal, dongleId) => ({ type: 'OPEN_MODAL', modal, dongleId })) }));

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';

function renderList() {
  const state = {
    devices: [{ dongle_id: SECOND, alias: 'Other device', is_owner: true }],
    profile: null,
    device: null,
    router: {
      location: { pathname: `/${FIRST}/2026-08-06--12-00-00/1.001/20`, search: '?source=shared', hash: '#video' },
    },
  };
  const store = createStore((value = state) => value);
  const selectDevice = vi.fn();
  const dispatch = vi.spyOn(store, 'dispatch');
  render(<Provider store={store}><DeviceList selectedDevice={SECOND} handleDeviceSelected={selectDevice} /></Provider>);
  return { dispatch, selectDevice };
}

describe('device navigation links', () => {
  beforeEach(() => vi.clearAllMocks());

  test('settings is a separate native link and regular clicks retain the background drive', () => {
    const { dispatch, selectDevice } = renderList();
    const deviceLink = screen.getByRole('link', { name: new RegExp(`Other device ${SECOND}`) });
    const settingsLink = screen.getByRole('link', { name: 'device settings' });
    expect(settingsLink).toHaveAttribute('href', `/${FIRST}/2026-08-06--12-00-00/1.001/20?source=shared&modal=settings&modalDevice=${SECOND}#video`);
    expect(settingsLink.parentElement).toBe(deviceLink.parentElement);
    expect(settingsLink.parentElement.closest('a')).toBeNull();
    fireEvent.click(settingsLink);
    expect(openModal).toHaveBeenCalledExactlyOnceWith('settings', SECOND);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'OPEN_MODAL', modal: 'settings', dongleId: SECOND });
    expect(selectDevice).not.toHaveBeenCalled();
    fireEvent.click(deviceLink);
    expect(selectDevice).toHaveBeenCalledExactlyOnceWith(SECOND);
  });

  test.each([
    ['Control', 'click', { ctrlKey: true }],
    ['Command', 'click', { metaKey: true }],
    ['Shift', 'click', { shiftKey: true }],
    ['Alt', 'click', { altKey: true }],
    ['middle', 'auxclick', { button: 1 }],
  ])('%s settings click leaves native link behavior intact', (_name, type, modifiers) => {
    const { dispatch, selectDevice } = renderList();
    let preventedByApp;
    // Inspect the app's decision before canceling jsdom's unsupported page
    // navigation. A real browser follows the anchor using its modifier rules.
    document.addEventListener(type, (event) => {
      preventedByApp = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    fireEvent(screen.getByRole('link', { name: 'device settings' }), new MouseEvent(type, {
      bubbles: true, cancelable: true, button: 0, ...modifiers,
    }));
    expect(preventedByApp).toBe(false);
    expect(openModal).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(selectDevice).not.toHaveBeenCalled();
  });
});
