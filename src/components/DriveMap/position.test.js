import { buildCoordIndex, positionAtOffset } from './position';

describe('buildCoordIndex', () => {
  it('returns null for missing or empty coords', () => {
    expect(buildCoordIndex(null)).toBeNull();
    expect(buildCoordIndex(undefined)).toBeNull();
    expect(buildCoordIndex({})).toBeNull();
  });

  it('sorts string keys numerically', () => {
    const index = buildCoordIndex({ 10: [1, 1], 2: [0, 0], 100: [2, 2] });
    expect(index.times).toEqual([2, 10, 100]);
    expect(index.coords).toEqual([[0, 0], [1, 1], [2, 2]]);
  });
});

describe('positionAtOffset', () => {
  const index = buildCoordIndex({
    0: [0, 0],
    1: [10, 20],
    2: [20, 40],
    // gap: no fixes for seconds 3 through 9
    10: [100, 200],
  });

  it('returns null without coords or offset', () => {
    expect(positionAtOffset(null, 1000)).toBeNull();
    expect(positionAtOffset(index, null)).toBeNull();
    expect(positionAtOffset(index, NaN)).toBeNull();
  });

  it('returns exact fixes on whole seconds', () => {
    expect(positionAtOffset(index, 1000)).toEqual([10, 20]);
    expect(positionAtOffset(index, 10000)).toEqual([100, 200]);
  });

  it('interpolates between adjacent fixes', () => {
    expect(positionAtOffset(index, 1500)).toEqual([15, 30]);
  });

  it('interpolates across a gap instead of returning nothing', () => {
    // halfway between second 2 and second 10
    expect(positionAtOffset(index, 6000)).toEqual([60, 120]);
    // a seek landing inside the gap still moves the marker
    expect(positionAtOffset(index, 3000)).toEqual([30, 60]);
  });

  it('clamps before the first fix and after the last fix', () => {
    const late = buildCoordIndex({ 5: [1, 1], 6: [2, 2] });
    expect(positionAtOffset(late, 0)).toEqual([1, 1]);
    expect(positionAtOffset(late, 60000)).toEqual([2, 2]);
  });

  it('handles a single fix', () => {
    const single = buildCoordIndex({ 3: [7, 8] });
    expect(positionAtOffset(single, 0)).toEqual([7, 8]);
    expect(positionAtOffset(single, 9000)).toEqual([7, 8]);
  });
});
