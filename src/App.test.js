/* eslint-env jest */
import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

it('renders without crashing', () => {
  const container = document.createElement('div');
  const { unmount } = render(<App />, { container });
  unmount();
});
