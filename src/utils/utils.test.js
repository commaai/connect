/* eslint-env jest */
import { formatDriveDuration } from '.';

describe('formatDriveDuration', () => {
  it('formats duration correctly', () => {
    // 11 hours, 59 minutes, 59 seconds
    const one = 11 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;
    const oneFormatted = formatDriveDuration(one);
    expect(oneFormatted).toEqual('11 hr 59 min');

    // 1 hour, 59 minutes, 59 seconds
    const two = 1 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;
    const twoFormatted = formatDriveDuration(two);
    expect(twoFormatted).toEqual('1 hr 59 min');

    // 59 minutes, 59 seconds
    const three = 59 * 60 * 1000 + 59 * 1000;
    const threeFormatted = formatDriveDuration(three);
    expect(threeFormatted).toEqual('59 min');

    // 59 seconds
    const four = 59 * 1000;
    const fourFormatted = formatDriveDuration(four);
    expect(fourFormatted).toEqual('0 min');
  });
});
