import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import Tooltip from './Tooltip.svelte';

/** The anchor the tooltip wraps, without adding a fixture component to the tree. */
const anchor = createRawSnippet(() => ({
  render: () => '<button type="button">anchor</button>',
}));

const mount = (props = {}) => render(Tooltip, { title: 'the explanation', children: anchor, ...props });

const button = () => screen.getByRole('button', { name: 'anchor' });

describe('Tooltip', () => {
  it('renders its anchor and nothing else to begin with', () => {
    mount();
    expect(button()).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not add a box of its own around the anchor', () => {
    const { container } = mount();
    // MUI's tooltip left the anchor's place in the parent layout alone
    expect(container.querySelector('[role="presentation"]')).toHaveStyle({ display: 'contents' });
  });

  it('opens on hover and closes again on leave', async () => {
    mount();

    await userEvent.hover(button());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('the explanation');

    await userEvent.unhover(button());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens on keyboard focus, so it is not mouse-only', async () => {
    mount();

    await userEvent.tab();

    expect(button()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });

  it('stays shut when there is nothing to say', async () => {
    mount({ title: '' });

    await userEvent.hover(button());

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('never swallows a click meant for the anchor', async () => {
    mount();

    await userEvent.hover(button());

    expect(screen.getByRole('tooltip')).toHaveClass('pointer-events-none');
  });

  it('sits below the anchor by default and above it on request', async () => {
    const { unmount } = mount();
    await userEvent.hover(button());
    const below = screen.getByRole('tooltip').getAttribute('style');
    expect(below).toContain('translateX(-50%)');
    unmount();

    mount({ placement: 'top' });
    await userEvent.hover(button());
    expect(screen.getByRole('tooltip').getAttribute('style')).toContain('translate(-50%, -100%)');
  });

  it('takes the opacity it is given, rather than leaving it to the cascade', async () => {
    mount({ opacity: 1 });

    await userEvent.hover(button());

    expect(screen.getByRole('tooltip').getAttribute('style')).toContain('opacity: 1');
  });

  it('can be opened by the parent instead of by pointer', () => {
    mount({ open: true });
    expect(screen.getByRole('tooltip')).toHaveTextContent('the explanation');
  });
});
