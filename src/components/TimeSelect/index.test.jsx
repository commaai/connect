import { vi } from 'vitest';
import { createStore } from 'redux';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { selectTimeFilter } from '../../actions';
import TimeSelect from './index';

vi.mock('../../actions', () => ({ selectTimeFilter: vi.fn((start, end) => ({ type: 'SAVE_FILTER', start, end })) }));

function setup() {
  const filter = { start: new Date(2026, 9, 1).getTime(), end: new Date(2026, 9, 3).getTime() };
  const store = createStore((state = { filter }, action) => action.type === 'FILTER_FROM_URL' ? { filter: action.filter } : state);
  const onClose = vi.fn();
  render(<TimeSelect store={store} onClose={onClose} />);
  return { store, onClose };
}

beforeEach(() => vi.clearAllMocks());

it('saves local day boundaries through one URL action without a second close', () => {
  const { onClose } = setup();
  fireEvent.change(screen.getByDisplayValue('2026-10-01'), { target: { value: '2026-10-02' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(selectTimeFilter).toHaveBeenCalledWith(new Date(2026, 9, 2).setHours(0, 0, 0, 0), new Date(2026, 9, 3).setHours(23, 59, 59, 999));
  expect(onClose).not.toHaveBeenCalled();
});

it('updates an open filter when browser navigation restores different dates', () => {
  const { store } = setup();
  fireEvent.change(screen.getByDisplayValue('2026-10-01'), { target: { value: '2026-10-02' } });
  act(() => store.dispatch({ type: 'FILTER_FROM_URL', filter: {
    start: new Date(2026, 8, 1).getTime(), end: new Date(2026, 8, 5).getTime(),
  } }));
  expect(screen.getByDisplayValue('2026-09-01')).toBeInTheDocument();
  expect(screen.getByDisplayValue('2026-09-05')).toBeInTheDocument();
});
