import { act, render } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('should not crash', async () => {
    await act(() => {
      render(<App/>);
    });
  });
});
