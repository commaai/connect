import { Media } from './Media';
import { navigateModal } from '../../actions';

vi.mock('../../actions', () => ({ analyticsEvent: vi.fn(), updateRoute: vi.fn(), navigateModal: vi.fn(() => ({ type: 'CLOSE_MODAL' })) }));

function setup() {
  let finish;
  const writeText = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const dispatch = vi.fn();
  const props = { dispatch, currentRoute: { fullname: '0000aaaa0000aaaa|2026-08-06--12-00-00', segment_numbers: [0] }, navigation: { modal: 'info' } };
  const component = new Media(props);
  component.mounted = true;
  return { component, dispatch, finish: () => finish() };
}

beforeEach(() => vi.clearAllMocks());

test('a completed copy closes the info overlay that initiated it', async () => {
  const { component, dispatch, finish } = setup();
  const pending = component.copySegmentName();
  finish();
  await pending;
  expect(navigateModal).toHaveBeenCalledWith(null);
  expect(dispatch).toHaveBeenCalledWith({ type: 'CLOSE_MODAL' });
});

test('a delayed copy cannot close a newer overlay', async () => {
  const { component, dispatch, finish } = setup();
  const pending = component.copySegmentName();
  component.props = { ...component.props, navigation: { modal: 'settings' } };
  finish();
  await pending;
  expect(dispatch).not.toHaveBeenCalled();
});

test('a delayed copy cannot navigate after the drive unmounts', async () => {
  const { component, dispatch, finish } = setup();
  const pending = component.copySegmentName();
  component.mounted = false;
  finish();
  await pending;
  expect(dispatch).not.toHaveBeenCalled();
});
