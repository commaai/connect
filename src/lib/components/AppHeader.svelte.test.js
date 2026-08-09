import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AppHeader from './AppHeader.svelte';

const profile = { email: 'dev@example.com', id: 'u1' };

function mount(props = {}) {
  return render(AppHeader, {
    profile,
    dongleId: 'aaaaaaaaaaaaaaaa',
    showDrawerButton: false,
    drawerIsOpen: false,
    ontoggledrawer: vi.fn(),
    ...props,
  });
}

describe('AppHeader', () => {
  it('has no menu button while the drawer is permanent', () => {
    mount({ showDrawerButton: false });
    expect(screen.queryByRole('button', { name: 'menu' })).not.toBeInTheDocument();
  });

  it('asks for the drawer to open when the menu button is pressed', async () => {
    const ontoggledrawer = vi.fn();
    mount({ showDrawerButton: true, drawerIsOpen: false, ontoggledrawer });

    await userEvent.click(screen.getByRole('button', { name: 'menu' }));

    expect(ontoggledrawer).toHaveBeenCalledWith(true);
  });

  it('asks for it to close again when it is already open', async () => {
    const ontoggledrawer = vi.fn();
    mount({ showDrawerButton: true, drawerIsOpen: true, ontoggledrawer });

    await userEvent.click(screen.getByRole('button', { name: 'menu' }));

    expect(ontoggledrawer).toHaveBeenCalledWith(false);
  });

  describe('the account menu', () => {
    it('stays shut until the button is pressed', async () => {
      mount();
      const button = screen.getByRole('button', { name: 'account menu' });
      expect(button).toHaveAttribute('aria-expanded', 'false');

      await userEvent.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(profile.email)).toBeInTheDocument();
    });

    it('renders no menu for a signed-out visitor on a shared drive link', async () => {
      mount({ profile: null });

      await userEvent.click(screen.getByRole('button', { name: 'account menu' }));

      expect(screen.queryByText(profile.email)).not.toBeInTheDocument();
    });
  });
});
