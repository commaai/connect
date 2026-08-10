import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AccountMenu from './AccountMenu.svelte';

const { logOut } = vi.hoisted(() => ({ logOut: vi.fn(() => Promise.resolve()) }));
vi.mock('$lib/auth', () => ({ logOut }));

const profile = { email: 'dev@example.com', user_id: 'user_1234' };

function mount(props = {}) {
  return render(AccountMenu, {
    profile,
    open: true,
    onclose: vi.fn(),
    ...props,
  });
}

describe('AccountMenu', () => {
  it('renders nothing while closed', () => {
    mount({ open: false });
    expect(screen.queryByText(profile.email)).not.toBeInTheDocument();
  });

  it('shows who is signed in', () => {
    mount();
    expect(screen.getByText(profile.email)).toBeInTheDocument();
    expect(screen.getByText(profile.user_id)).toBeInTheDocument();
  });

  it('says dev for a build with no commit stamped into it', () => {
    // vite leaves VITE_APP_GIT_SHA unset outside CI, which is the case here
    mount();
    expect(screen.getByText(/^Version:/)).toHaveTextContent('Version: dev');
    expect(screen.queryByRole('link', { name: /^[0-9a-f]{7}$/ })).not.toBeInTheDocument();
  });

  it('links out to account management in a new tab', () => {
    mount();
    const link = screen.getByRole('link', { name: 'Manage account' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('closes when the account link is followed', async () => {
    const onclose = vi.fn();
    mount({ onclose });

    await userEvent.click(screen.getByRole('link', { name: 'Manage account' }));

    expect(onclose).toHaveBeenCalled();
  });

  describe('logging out', () => {
    it('closes the menu first, so it is not left open over a signed-out page', async () => {
      const onclose = vi.fn();
      mount({ onclose });

      await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

      expect(onclose).toHaveBeenCalled();
      expect(logOut).toHaveBeenCalled();
      expect(onclose.mock.invocationCallOrder[0]).toBeLessThan(logOut.mock.invocationCallOrder[0]);
    });
  });
});
