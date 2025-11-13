/* eslint-env jest */
import React from 'react';
import { act, render } from '@testing-library/react';
import App from '../App.jsx';

describe('App', () => {
  it('should not crash', () => {
    act(() => {
      render(<App />);
    });
  });
});
