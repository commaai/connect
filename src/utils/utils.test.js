/* eslint-env jest */
import { formatDriveDuration } from '.';

describe('formatDriveDuration', () => {
  it('formats duration correctly', () => {
    // 1 hour, 59 minutes, 59 seconds
    const one = 1 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;
    const oneFormatted = formatDriveDuration(one);
    expect(oneFormatted).toEqual('1 hr 59 min');

    // 59 minutes, 59 seconds
    const two = 59 * 60 * 1000 + 59 * 1000;
    const twoFormatted = formatDriveDuration(two);
    expect(twoFormatted).toEqual('59 min');

    // 60 seconds
    const three = 60 * 1000;
    const threeFormatted = formatDriveDuration(three);
    expect(threeFormatted).toEqual('1 min');

    // 59 seconds
    const four = 59 * 1000;
    const fourFormatted = formatDriveDuration(four);
    expect(fourFormatted).toEqual('0 min');
  });
});
