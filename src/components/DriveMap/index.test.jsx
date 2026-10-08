import { DriveMap, getRouteFeatureCollection, getRoutesBounds } from './index';

describe('route map geometry', () => {
  it('builds route lines from coordinate timestamps in order', () => {
    const routes = [
      {
        fullname: 'device|route',
        driveCoords: {
          2: [-117.2, 32.7],
          1: [-117.1, 32.6],
          3: null,
        },
      },
      { fullname: 'device|empty', driveCoords: {} },
    ];

    expect(getRouteFeatureCollection(routes)).toEqual({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { fullname: 'device|route' },
        geometry: {
          type: 'LineString',
          coordinates: [[-117.1, 32.6], [-117.2, 32.7]],
        },
      }],
    });
  });

  it('fits the map bounds to all loaded route paths', () => {
    const bounds = getRoutesBounds([
      { driveCoords: { 1: [-117.2, 32.7], 2: [-117.1, 32.8] } },
      { driveCoords: null, start_lng: -118, start_lat: 33, end_lng: -116, end_lat: 34 },
    ]);

    expect(bounds).toEqual([[-118, 32.7], [-116, 34]]);
  });

  it('does not throw when clearing a route before the map source is ready', () => {
    const component = new DriveMap({});
    component.map = {
      getMap: () => ({
        getSource: () => undefined,
      }),
    };

    expect(() => component.setPath([])).not.toThrow();
  });

});
