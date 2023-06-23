import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('should not crash', () => {
    render(<App/>);
  });
});
