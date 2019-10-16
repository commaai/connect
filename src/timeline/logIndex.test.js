/* eslint-env jest */
import { findMonoTime, createIndex } from './logIndex';
import rlogData from '../../partial-rlog';

// export function findMonoTime (index, monoTime, start, end) {
describe('findMonoTime', () => {
  it('can binary search correctly', () => {
    const exampleIndex = {
      index: [
        [123],
        [234],
        [456],
        [567],
        [567],
        [678]
      ]
    };
    expect(findMonoTime(exampleIndex, 123)).toBe(0);
    expect(findMonoTime(exampleIndex, 0)).toBe(0);
    expect(findMonoTime(exampleIndex, 124)).toBe(1);

    expect(findMonoTime(exampleIndex, 678)).toBe(5);
    expect(findMonoTime(exampleIndex, 679)).toBe(5);
  });
  it('can binary search on real index files', () => {
    const index = createIndex(rlogData);
    expect(findMonoTime(index, 1342337)).toBe(86);
  });
});

describe('createIndex', () => {
  it('builds sorted index', () => {
    const index = createIndex(rlogData);

    expect(index).toBeTruthy();
    expect(index.index.length).toBe(92);
    expect(index.index[0][0]).toBe(1335234);
    let lastMonoTime = index.index[0][0];
    index.index.forEach((i) => {
      expect(i[0]).toBeGreaterThanOrEqual(lastMonoTime);
      [lastMonoTime] = i;
    });
  });
});
