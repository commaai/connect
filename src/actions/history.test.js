import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { onHistoryMiddleware } from './history';
import * as actions from './index';
import { parseUrl } from '../url';

vi.mock('./index', () => ({
  commitView: vi.fn((view) => ({ type: 'commit', view })),
}));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function create() {
  const store = { dispatch: vi.fn() };
  const next = vi.fn((action) => action);
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
}

function location(pathname, historyAction = 'POP', search = '') {
  return { type: LOCATION_CHANGE, payload: { action: historyAction, location: { pathname, search } } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    expect(invoke()).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a non-location action through', () => {
    const { next, store, invoke } = create();
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('applies a %s location after the router has it', (historyAction) => {
    const { next, store, invoke } = create();
    const pathname = `/${DONGLE}/${LOG}/0/20`;
    const search = '?from=1&to=2';
    const action = location(pathname, historyAction, search);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.commitView).toHaveBeenCalledWith(parseUrl(pathname, search));
    expect(next.mock.invocationCallOrder[0]).toBeLessThan(store.dispatch.mock.invocationCallOrder[0]);
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'commit', view: parseUrl(pathname, search) });
  });
});
