vi.mock('../../actions', () => ({ analyticsEvent: vi.fn() }));
vi.mock('../../actions/cached', () => ({ fetchDriveCoords: vi.fn() }));
vi.mock('../VisibilityHandler', () => ({ default: () => null }));

import { Navigation } from './index';

describe('dashboard map viewport', () => {
  it('does not recenter to a late device location after the user zooms', () => {
    const navigation = new Navigation({ device: {}, dispatch: vi.fn() });
    navigation.state = {
      ...navigation.state,
      carLastLocation: [-117.2, 32.7],
      carLastLocationTime: 1,
      viewport: {
        ...navigation.state.viewport,
        width: 800,
        height: 400,
      },
    };
    navigation.hasUserInteractedWithMap = true;
    navigation.setState = vi.fn();

    navigation.flyToMarkers();

    expect(navigation.setState).not.toHaveBeenCalled();
  });

  it('still flies to an explicitly selected geolocation', () => {
    const navigation = new Navigation({ device: {}, dispatch: vi.fn() });
    navigation.state = {
      ...navigation.state,
      geoLocateCoords: [-117.2, 32.7],
      viewport: {
        ...navigation.state.viewport,
        width: 800,
        height: 400,
      },
    };
    navigation.hasUserInteractedWithMap = true;
    navigation.setState = vi.fn();

    navigation.flyToMarkers();

    expect(navigation.setState).toHaveBeenCalledOnce();
  });
});
