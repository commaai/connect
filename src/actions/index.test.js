import { goBack, push, replace } from 'connected-react-router';

import { closeModal, openModal } from './index';

const DONGLE = '0000aaaa0000aaaa';

function run(thunk, state) {
  const dispatched = [];
  thunk((a) => dispatched.push(a), () => state);
  return dispatched;
}

describe('modal actions', () => {
  it('opens a modal over the current device', () => {
    expect(run(openModal('filter'), { dongleId: DONGLE })).toEqual([push(`/${DONGLE}?modal=filter`)]);
  });

  it('opens a modal over another device', () => {
    expect(run(openModal('settings', 'ffff0000ffff0000'), { dongleId: DONGLE })).toEqual([push('/ffff0000ffff0000?modal=settings')]);
  });

  it('goes back to close a modal it opened', () => {
    const router = { action: 'PUSH', location: { pathname: `/${DONGLE}` } };
    expect(run(closeModal(), { router })).toEqual([goBack()]);
  });

  it('drops the modal from a URL that was opened directly', () => {
    const router = { action: 'POP', location: { pathname: `/${DONGLE}` } };
    expect(run(closeModal(), { router })).toEqual([replace(`/${DONGLE}`)]);
  });
});
