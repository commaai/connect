/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('./index', () => ({ applyUrl: vi.fn((location) => ({ type: 'APPLY_URL', location })) }));

const DEVICE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function create(pathname, search = '') {
  const state = { router: { location: { pathname, search, hash: '' } } };
  const store = { getState: vi.fn(() => state), dispatch: vi.fn() };
  const next = vi.fn();
  const middleware = onHistoryMiddleware(store)(next);
  const invoke = (action) => middleware(action);
  return { store, next, invoke };
}

function urlChange(pathname, action = 'POP', search = '') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname, search, hash: '' } } };
}

describe('history middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes non-location actions through', () => {
    const { next, invoke } = create('/');
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.applyUrl).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('applies every location change from %s', (historyAction) => {
    const { store, next, invoke } = create('/');
    const action = urlChange(`/${DEVICE}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'APPLY_URL', location: action.payload.location });
  });

  it('converts a legacy range with replace and keeps modal/query arguments', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DEVICE}|${LOG}` }]);
    const { store, invoke } = create(`/${DEVICE}/1000/2000`, '?modal=filter&ci=1');
    invoke(urlChange(`/${DEVICE}/1000/2000`, 'POP', '?modal=filter&ci=1'));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: '@@router/CALL_HISTORY_METHOD',
      payload: { method: 'replace', args: [`/${DEVICE}/${LOG}?modal=filter&ci=1`] },
    })));
  });

  it('ignores a legacy response after navigating elsewhere', async () => {
    let resolveLookup;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const { store, invoke } = create(`/${DEVICE}/1000/2000`);
    invoke(urlChange(`/${DEVICE}/1000/2000`));
    invoke(urlChange(`/${DEVICE}`));
    resolveLookup([{ fullname: `${DEVICE}|${LOG}` }]);
    await Promise.resolve();
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: '@@router/CALL_HISTORY_METHOD',
    }));
  });

  it('keeps empty legacy lookup results on the legacy URL', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([]);
    const { store, invoke } = create(`/${DEVICE}/1000/2000`);
    invoke(urlChange(`/${DEVICE}/1000/2000`));
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DEVICE, 1000, 2000));
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: '@@router/CALL_HISTORY_METHOD',
    }));
  });

  it('does not share legacy request suppression across stores', () => {
    api.routes.getRoutesSegments.mockReturnValue(new Promise(() => {}));
    const first = create(`/${DEVICE}/1000/2000`);
    const second = create(`/${DEVICE}/1000/2000`);
    first.invoke(urlChange(`/${DEVICE}/1000/2000`));
    second.invoke(urlChange(`/${DEVICE}/1000/2000`));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  });
});
