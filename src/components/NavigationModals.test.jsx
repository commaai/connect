import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { vi, describe, it, expect } from 'vitest';
import NavigationModals from './NavigationModals';

const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => auth.signedIn } }));
vi.mock('../actions/navigation', () => ({ closeModal: () => ({ type: 'close' }) }));
vi.mock('./Dashboard/DeviceSettingsModal', () => ({ default: ({ modal }) => <div>settings host: {modal}</div> }));
vi.mock('./Dashboard/AddDevice', () => ({ default: ({ open }) => open && <div>pair host</div> }));
vi.mock('./TimeSelect', () => ({ default: () => <div>filter host</div> }));

function show(search, owner = true, profile = null) {
  const id = '0123456789abcdef';
  const state = {
    router: { location: { pathname: `/${id}`, search, hash: '' } },
    devices: [{ dongle_id: id, is_owner: owner }],
    profile,
  };
  return render(<Provider store={createStore(() => state)}><NavigationModals /></Provider>);
}

describe('shell modal host', () => {
  it.each(['settings', 'unpair', 'settings-uploads'])('opens a cold %s without a drawer', modal => {
    show(`?modal=${modal}`);
    expect(screen.getByText(`settings host: ${modal}`)).toBeInTheDocument();
  });
  it('does not mount owner controls for shared devices', () => {
    show('?modal=settings', false);
    expect(screen.queryByText('settings host: settings')).toBeNull();
  });
  it('mounts settings for a superuser on a shared device', () => {
    show('?modal=settings', false, { superuser: true });
    expect(screen.getByText('settings host: settings')).toBeInTheDocument();
  });
  it('owns one pairing dialog', () => {
    show('?modal=pair');
    expect(screen.getAllByText('pair host')).toHaveLength(1);
  });
  it('does not request a pairing camera for an anonymous demo link', () => {
    auth.signedIn = false;
    show('?modal=pair');
    expect(screen.getByText('Sign in to pair a device.')).toBeInTheDocument();
    expect(screen.queryByText('pair host')).toBeNull();
    auth.signedIn = true;
  });
  it('opens the date filter from a cold URL', () => {
    show('?modal=filter');
    expect(screen.getByText('filter host')).toBeInTheDocument();
  });
});
