import { offsetNearest, segmentLines } from '.';

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

describe('offsetNearest', () => {
  // out along y = 0 and back the same way, 10s each way
  const coords = {};
  for (let second = 0; second <= 20; second++) {
    coords[second] = [second <= 10 ? second * 0.001 : (20 - second) * 0.001, 0];
  }

  it('finds the closest point of the drive', () => {
    expect(offsetNearest(coords, [0.003, 0.00001], 2000)).toEqual(3000);
  });

  it('picks the pass closest in time where the drive goes the same way twice', () => {
    expect(offsetNearest(coords, [0.003, 0], 2000)).toEqual(3000);
    expect(offsetNearest(coords, [0.003, 0], 16000)).toEqual(17000);
  });

  it('handles a drive without coordinates', () => {
    expect(offsetNearest({}, [0, 0], 0)).toBeNull();
  });
});
