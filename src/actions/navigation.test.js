import { closeDialog, openDialog } from './navigation';
import { createInitialState } from '../initialState';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const location = { pathname: `/${DONGLE}/${LOG}/0/20`, search: '?unrelated=kept', hash: '#anchor' };

function invoke(action, currentLocation = location) {
  const dispatch = vi.fn();
  action(dispatch, () => ({ router: { location: currentLocation } }));
  return dispatch.mock.calls[0]?.[0];
}

describe('URL dialog actions', () => {
  it('opens settings without changing the background drive or unrelated arguments', () => {
    expect(invoke(openDialog('settings', { settingsDongleId: DONGLE })).payload).toEqual({
      method: 'push', args: [{ ...location, search: `?unrelated=kept&dialog=settings&settingsDevice=${DONGLE}` }],
    });
  });

  it('closes a cold-linked dialog without leaving the app', () => {
    expect(invoke(closeDialog(), { ...location, search: `?dialog=settings&settingsDevice=${DONGLE}&unrelated=kept` }).payload).toEqual({
      method: 'replace', args: [location],
    });
  });

  it('closes a nested confirmation back to settings with its target intact', () => {
    expect(invoke(closeDialog('settings'), { ...location, search: `?dialog=unpair&settingsDevice=${DONGLE}` }).payload.args[0].search)
      .toBe(`?dialog=settings&settingsDevice=${DONGLE}`);
  });

  it('does not navigate to unknown dialogs', () => {
    expect(invoke(openDialog('typo'))).toBeUndefined();
  });

  it('does not add duplicate history entries when the same dialog is already open', () => {
    expect(invoke(openDialog('account'), { ...location, search: '?dialog=account' })).toBeUndefined();
  });

  it('encodes clip filenames and clears them when returning to the clip list', () => {
    const opened = invoke(openDialog('clip-preview', { clipFilename: 'my clip & camera.mp4' })).payload.args[0];
    expect(new URLSearchParams(opened.search).get('clip')).toBe('my clip & camera.mp4');
    const closed = invoke(closeDialog('clips'), opened).payload.args[0];
    expect(new URLSearchParams(closed.search).get('clip')).toBeNull();
    expect(new URLSearchParams(closed.search).get('dialog')).toBe('clips');
  });

  it('initializes dialog and drive selection from a cold URL', () => {
    expect(createInitialState(location.pathname, '?dialog=settings')).toMatchObject({
      dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 0, end: 20000 }, navigation: { dialog: 'settings' },
    });
  });
});
