import { thumbnailAt } from './thumbnails';

vi.mock('../../api/backend', () => ({
  api: { routeAssets: { thumbnail: (route, segment) => `thumb/${route.fullname}/${segment}` } },
}));

const route = { fullname: 'dongle|route' };

describe('thumbnailAt', () => {
  it('picks the segment sprite by minute', () => {
    expect(thumbnailAt(route, 59_999).url).toBe('thumb/dongle|route/0');
    expect(thumbnailAt(route, 60_000).url).toBe('thumb/dongle|route/1');
    expect(thumbnailAt(route, 125_000).segmentNum).toBe(2);
  });

  it('picks the image by 5 second steps and clamps at the last one', () => {
    expect(thumbnailAt(route, 0).imageIndex).toBe(0);
    expect(thumbnailAt(route, 4_999).imageIndex).toBe(0);
    expect(thumbnailAt(route, 5_000).imageIndex).toBe(1);
    expect(thumbnailAt(route, 900_000).imageIndex).toBe(11);
  });
});
