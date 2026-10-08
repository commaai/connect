import { goBack, push, replace } from 'connected-react-router';

import { closeModal, navigate } from './index';

const DONGLE = '0000aaaa0000aaaa';

function run(thunk, state) {
  const dispatched = [];
  thunk((a) => dispatched.push(a), () => state);
  return dispatched;
}

describe('navigation actions', () => {
  it('goes to a view of the current device', () => {
    expect(run(navigate({ page: 'prime' }), { dongleId: DONGLE })).toEqual([push(`/${DONGLE}/prime`)]);
    expect(run(navigate({ modal: 'filter' }), { dongleId: DONGLE })).toEqual([push(`/${DONGLE}?modal=filter`)]);
  });

  it('goes to a view of another device', () => {
    expect(run(navigate({ dongleId: 'ffff0000ffff0000', modal: 'settings' }), { dongleId: DONGLE })).toEqual([push('/ffff0000ffff0000?modal=settings')]);
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
