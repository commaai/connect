import { segmentLines } from '.';

describe('segmentLines', () => {
  it('splits the drive into one line per segment, joined end to start', () => {
    const coords = {};
    for (let second = 0; second < 150; second += 30) {
      coords[second] = [second, 0];
    }

    const { features } = segmentLines(coords);
    expect(features.map((f) => f.properties.segment)).toEqual([0, 1, 2]);
    expect(features[0].geometry.coordinates).toEqual([[0, 0], [30, 0], [60, 0]]);
    expect(features[1].geometry.coordinates).toEqual([[60, 0], [90, 0], [120, 0]]);
    expect(features[2].geometry.coordinates).toEqual([[120, 0]]);
  });

  it('handles a drive without coordinates', () => {
    expect(segmentLines({}).features).toEqual([]);
  });
});
