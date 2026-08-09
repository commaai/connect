/* eslint-env jest */
import WebMercatorViewport, {
  MAX_LATITUDE,
  fitBounds,
  lngLatToWorld,
  scaleToZoom,
  worldToLngLat,
  zoomToScale,
} from './mercator';

// values below are pinned against viewport-mercator-project 7.0.4, the package react-map-gl used

const expectClose = (actual, expected, precision = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, precision));
};

describe('world coordinates', () => {
  it('projects onto the 512x512 zoom 0 tile', () => {
    expectClose(lngLatToWorld([0, 0]), [256, 256]);
    expectClose(lngLatToWorld([-180, 0]), [0, 256]);
    expectClose(lngLatToWorld([180, 0]), [512, 256]);
    expectClose(lngLatToWorld([-117.161052, 32.711483]), [89.37094826666666, 305.2780851291231]);
  });

  it('makes a square world at the maximum latitude', () => {
    expectClose(lngLatToWorld([180, MAX_LATITUDE]), [512, 512], 4);
    expectClose(lngLatToWorld([-180, -MAX_LATITUDE]), [0, 0], 4);
  });

  it('round trips', () => {
    [[0, 0], [-117.161052, 32.711483], [151.2093, -33.8688], [-73.9857, 40.7484]].forEach((lngLat) => {
      expectClose(worldToLngLat(lngLatToWorld(lngLat)), lngLat);
    });
  });

  it('converts zoom to scale', () => {
    expect(zoomToScale(0)).toBe(1);
    expect(zoomToScale(10)).toBe(1024);
    expect(scaleToZoom(1024)).toBe(10);
  });

  it('rejects invalid latitudes', () => {
    expect(() => lngLatToWorld([0, 91])).toThrow('invalid latitude');
    expect(() => lngLatToWorld([0, NaN])).toThrow('invalid latitude');
  });
});

describe('project', () => {
  it('puts the center of the viewport at the center of the screen', () => {
    const viewport = new WebMercatorViewport({
      width: 400, height: 200, longitude: -117.161052, latitude: 32.711483, zoom: 5,
    });
    expectClose(viewport.project([-117.161052, 32.711483]), [200, 100]);
  });

  it('projects lng/lat to top left pixels', () => {
    const viewport = new WebMercatorViewport({
      width: 400, height: 200, longitude: -117.161052, latitude: 32.711483, zoom: 5,
    });
    // north east of the center: right of and above the center pixel
    expectClose(viewport.project([-117.0, 32.6]), [207.3296554666661, 106.026308192498]);
  });

  it('measures y from the bottom when topLeft is false', () => {
    const viewport = new WebMercatorViewport({
      width: 400, height: 200, longitude: -117.161052, latitude: 32.711483, zoom: 5,
    });
    expectClose(viewport.project([-117.0, 32.6], { topLeft: false }),
      [207.3296554666661, 93.973691807502]);
  });

  it('fills a 512x512 viewport with the world at zoom 0', () => {
    const viewport = new WebMercatorViewport({
      width: 512, height: 512, longitude: 0, latitude: 0, zoom: 0,
    });
    expectClose(viewport.project([0, 0]), [256, 256]);
    expectClose(viewport.project([-180, MAX_LATITUDE]), [0, 0], 4);
    expectClose(viewport.project([180, -MAX_LATITUDE]), [512, 512], 4);
  });

  it('applies pitch and bearing', () => {
    const viewport = new WebMercatorViewport({
      width: 800, height: 600, longitude: -122.45, latitude: 37.78, zoom: 12, pitch: 45, bearing: 30,
    });
    expectClose(viewport.project([-122.43, 37.79]), [458.43866246771256, 221.22617593200417]);
  });
});

describe('unproject', () => {
  const viewport = new WebMercatorViewport({
    width: 400, height: 200, longitude: -117.161052, latitude: 32.711483, zoom: 5,
  });

  it('returns the viewport center for the center pixel', () => {
    expectClose(viewport.unproject([200, 100]), [-117.161052, 32.711483]);
  });

  it('unprojects the top left corner', () => {
    expectClose(viewport.unproject([0, 0]), [-121.55558325000041, 34.54092938040014]);
  });

  it('round trips with project', () => {
    [[-117.161052, 32.711483], [-117.0, 32.6], [-118.2, 33.4]].forEach((lngLat) => {
      expectClose(viewport.unproject(viewport.project(lngLat)), lngLat);
    });

    [[0, 0], [200, 100], [399, 199], [37, 162]].forEach((pixel) => {
      expectClose(viewport.project(viewport.unproject(pixel)), pixel);
    });
  });

  it('round trips with project when pitched', () => {
    const pitched = new WebMercatorViewport({
      width: 800, height: 600, longitude: -122.45, latitude: 37.78, zoom: 12, pitch: 45, bearing: 30,
    });
    expectClose(pitched.unproject([500, 200]), [-122.41961982083737, 37.791061336746786]);
    expectClose(pitched.project(pitched.unproject([500, 200])), [500, 200]);
  });
});

describe('fitBounds', () => {
  const bounds = [[-117.2, 32.7], [-117.1, 32.8]];

  it('centers a two point bound', () => {
    const { longitude, latitude, zoom } = fitBounds({ width: 400, height: 200, bounds });
    expect(longitude).toBeCloseTo(-117.14999999999999, 6);
    expect(latitude).toBeCloseTo(32.75001403292432, 6);
    expect(zoom).toBeCloseTo(10.20788167526419, 6);
  });

  it('zooms out for padding', () => {
    const { longitude, latitude, zoom } = fitBounds({
      width: 400, height: 200, bounds, padding: 20, maxZoom: 10,
    });
    expect(longitude).toBeCloseTo(-117.14999999999999, 6);
    expect(latitude).toBeCloseTo(32.75001403292432, 6);
    expect(zoom).toBeCloseTo(9.885953580376828, 6);
  });

  it('shifts the center for uneven padding', () => {
    const { longitude, latitude, zoom } = fitBounds({
      width: 400,
      height: 200,
      bounds,
      padding: { left: 20, right: 40, top: 25, bottom: 30 },
      maxZoom: 10,
    });
    expect(longitude).toBeCloseTo(-117.14705882352943, 6);
    expect(latitude).toBeCloseTo(32.748289878179115, 6);
    expect(zoom).toBeCloseTo(9.7439345755044, 6);
  });

  it('clamps to maxZoom', () => {
    const { zoom } = fitBounds({
      width: 400, height: 200, bounds: [[-117.1005, 32.7], [-117.1, 32.7005]], maxZoom: 10,
    });
    expect(zoom).toBe(10);
  });

  it('throws when the padding leaves no room', () => {
    expect(() => fitBounds({ width: 400, height: 200, bounds, padding: 200 }))
      .toThrow('assertion failed');
  });

  it('returns a viewport keeping the width and height, without pitch or bearing', () => {
    const viewport = new WebMercatorViewport({
      width: 400, height: 200, longitude: 0, latitude: 0, zoom: 3, bearing: 20, pitch: 10,
    }).fitBounds(bounds, { padding: 20, maxZoom: 10 });

    expect(viewport.width).toBe(400);
    expect(viewport.height).toBe(200);
    expect(viewport.longitude).toBeCloseTo(-117.14999999999999, 6);
    expect(viewport.latitude).toBeCloseTo(32.75001403292432, 6);
    expect(viewport.zoom).toBeCloseTo(9.885953580376828, 6);
    expect(viewport.bearing).toBe(0);
    expect(viewport.pitch).toBe(0);
    expectClose(viewport.project([-117.15, 32.75001403292432]), [200, 100], 3);
  });
});
