import { headingBetween, offsetNearest, segmentLabelPoints, segmentLines } from '.';

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

describe('segmentLabelPoints', () => {
  it('puts one label halfway along each segment', () => {
    const coords = {};
    for (let second = 0; second < 150; second += 30) {
      coords[second] = [second, 0];
    }

    const { features } = segmentLabelPoints(segmentLines(coords));
    expect(features.map((f) => f.properties.segment)).toEqual([0, 1, 2]);
    expect(features.map((f) => f.geometry.coordinates)).toEqual([[30, 0], [90, 0], [120, 0]]);
  });
});

describe('offsetNearest', () => {
  const coords = {};
  for (let second = 0; second <= 10; second++) {
    coords[second] = [second * 0.001, 0];
  }

  it('finds the closest point of the drive', () => {
    expect(offsetNearest(coords, [0.003, 0.00001])).toEqual(3000);
  });

  it('handles a drive without coordinates', () => {
    expect(offsetNearest({}, [0, 0])).toBeNull();
  });
});

describe('headingBetween', () => {
  it('turns the car the way it drives, clockwise from north', () => {
    expect(headingBetween([0, 0], [0, 1])).toBe(0);
    expect(headingBetween([0, 0], [1, 0])).toBe(90);
    expect(headingBetween([0, 0], [0, -1])).toBe(180);
    expect(headingBetween([0, 0], [-1, 0])).toBe(-90);
  });

  it('has no heading for a car standing still', () => {
    expect(headingBetween([7, 45], [7, 45])).toBeNull();
  });
});
