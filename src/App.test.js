/* eslint-env jest */
import React from 'react';
import { createRoot, unmountComponentAtNode } from 'react-dom/client';
import App from './App';

it('renders without crashing', () => {
  const container = document.createElement('div');
  createRoot(container).render(<App />);
  unmountComponentAtNode(container);
});
