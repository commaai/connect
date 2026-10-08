import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Notification from '.';

test('dismiss control is a labeled native button that cannot submit its enclosing form', () => {
  const dismiss = vi.fn();
  const submit = vi.fn(event => event.preventDefault());
  render(<form onSubmit={submit}><Notification heading="comma prime" subtitle="Promotion"
    buttonText="sign up" dismissLabel="Dismiss prime promotion" onDismiss={dismiss} /></form>);
  const button = screen.getByRole('button', { name: 'Dismiss prime promotion' });
  expect(button.tagName).toBe('BUTTON');
  expect(button).toHaveAttribute('type', 'button');
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
});
