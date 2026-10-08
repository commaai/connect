import React from 'react';
import { act, render } from '@testing-library/react';
import { publicCoords, publicRoute } from '../../../config/vitest/publicRoute';
import { DriveMap } from './index';

// Map source methods are browser/library mechanics; coordinates come from the
// actual public route. No video tick is needed after paused data arrives.
vi.mock('react-map-gl', () => ({
  default: React.forwardRef(() => <div />),
  LinearInterpolator: class {},
}));

it('places a paused marker at the observed position after late coordinates load', () => {
  let map;
  const props = { currentRoute: publicRoute, offset: 20500, dispatch: vi.fn() };
  const view = render(<DriveMap {...props} ref={(value) => { map = value; }} />);
  const marker = { setData: vi.fn() };
  const path = { setData: vi.fn() };
  act(() => { map.map = { getMap: () => ({ getSource: (name) => name === 'seekPoint' ? marker : path }) }; });
  view.rerender(<DriveMap {...props} currentRoute={{ ...publicRoute, driveCoords: publicCoords }}
    ref={(value) => { map = value; }} />);
  expect(marker.setData).toHaveBeenLastCalledWith({
    type: 'Point',
    coordinates: publicCoords[20].map((coordinate, index) => (coordinate + publicCoords[21][index]) / 2),
  });
  expect(path.setData).toHaveBeenCalled();
});
