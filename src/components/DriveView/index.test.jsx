import { DriveView } from './index';
import { popTimelineRange, pushTimelineRange } from '../../actions';

vi.mock('../../actions', () => ({
  popTimelineRange: vi.fn((...args) => ({ type: 'POP_RANGE', args })),
  pushTimelineRange: vi.fn((...args) => ({ type: 'PUSH_RANGE', args })),
}));

const route = { duration: 60000, log_id: 'route-id' };

function createView(dispatch = vi.fn()) {
  return { view: new DriveView({ dispatch }), dispatch };
}

describe('DriveView back navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pops the previous zoom range when available', () => {
    const { view, dispatch } = createView();
    const zoom = {
      start: 10000,
      end: 20000,
      previous: { start: 0, end: route.duration },
    };

    view.onBack(zoom, route);

    expect(popTimelineRange).toHaveBeenCalledWith(route.log_id);
    expect(dispatch).toHaveBeenCalledWith({ type: 'POP_RANGE', args: [route.log_id] });
    expect(pushTimelineRange).not.toHaveBeenCalled();
  });

  it('returns to the route list when backing out of the whole route', () => {
    const { view, dispatch } = createView();
    const zoom = { start: 0, end: route.duration };

    view.onBack(zoom, route);

    expect(pushTimelineRange).toHaveBeenCalledWith(null, null, null);
    expect(dispatch).toHaveBeenCalledWith({ type: 'PUSH_RANGE', args: [null, null, null] });
  });

  it('backs out to the whole route when a range has no saved parent', () => {
    const { view, dispatch } = createView();
    const zoom = { start: 10000, end: 20000 };

    view.onBack(zoom, route);

    expect(pushTimelineRange).toHaveBeenCalledWith(route.log_id, null, null);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'PUSH_RANGE',
      args: [route.log_id, null, null],
    });
  });
});
