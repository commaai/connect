import React from 'react';
import { render, screen } from '@testing-library/react';
import TimelineLegend, { legendItems } from './legend';
import theme from '../../theme';

describe('timeline legend', () => {
  it('labels every seekbar color', () => {
    render(React.createElement(TimelineLegend));
    legendItems.forEach(({ label }) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it('only uses colors defined in the theme', () => {
    legendItems.forEach(({ color }) => {
      expect(theme.palette.states[color]).toBeTruthy();
    });
  });
});
