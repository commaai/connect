/* eslint-env jest */
import { act, render } from '@testing-library/react';
import App, { App as AppComponent } from '../App';

describe('App', () => {
  it('should not crash', () => {
    act(() => {
      render(<App />);
    });
  });

  it('preserves the login redirect across renders', () => {
    const route = '/0123456789abcdef/00000000--0123456789/0/60';
    window.sessionStorage.setItem('redirectURL', route);
    const app = new AppComponent({});

    expect(app.redirectLink()).toBe(route);
    expect(window.sessionStorage.getItem('redirectURL')).toBeNull();
    expect(app.redirectLink()).toBe(route);
  });
});
