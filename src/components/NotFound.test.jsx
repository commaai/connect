import React from 'react';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import NotFound from './NotFound';

vi.mock('../actions', () => ({ selectDevice: (id) => ({ type: 'select', id }) }));

describe('NotFound', () => {
  test('links back to the dashboard', () => {
    const store = { getState: () => ({}), subscribe: () => () => {}, dispatch: vi.fn() };
    render(<Provider store={store}><NotFound dongleId="0123456789abcdef" /></Provider>);
    expect(screen.getByText('Page not found')).toBeVisible();
    expect(screen.getByText('Back to dashboard')).toHaveAttribute('href', '/0123456789abcdef');
  });
});
