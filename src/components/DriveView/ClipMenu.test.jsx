import '../../store';
import { ClipMenu } from './ClipMenu';
import sourceRoute from '../../test-data/public-route.json';
import { DEMO_DONGLE_ID } from '../../api/demo';

// Lifecycle-only tests use no clip records or clip/device API responses.
it.each(['close', 'device'])('invalidates pending clip operations and local confirmation on %s', (change) => {
  const previous = { open: true, dongleId: sourceRoute.dongle_id, route: sourceRoute, deviceOnline: false };
  const menu = new ClipMenu(previous);
  menu.mounted = true;
  menu.state.deleteDialogOpen = true;
  menu.state.deleting = true;
  menu.state.creating = true;
  // Component instance checks exercise the lifecycle without rendering a fabricated inventory.
  menu.setState = (next) => { menu.state = { ...menu.state, ...next }; };
  menu.props = change === 'close' ? { ...previous, open: false } : { ...previous, dongleId: DEMO_DONGLE_ID };
  const operation = menu.operationRequest;
  menu.componentDidUpdate(previous);
  expect(menu.operationRequest).toBeGreaterThan(operation);
  expect(menu.state).toMatchObject({ deleteDialogOpen: false, deleting: false, creating: false, deletingClip: null });
});
