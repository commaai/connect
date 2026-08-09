import { vi } from 'vitest';

import { thumbnailTiles } from './thumbnails-tiling';

const screenHeight = 1000;
const screenWidth = 1600;
const gutter = 20;
const percentToOffsetMock = vi.fn();
const mockRoute = {
  url: 'https://route.example/99c94dc769b5d96e|2018-04-09--10-10-00',
  offset: 1600,
  segment_numbers: Array.from(Array(4).keys()),
  segment_offsets: Array.from(Array(4).keys()).map((i) => i * 60),
};

const thumbnailBounds = {
  top: 100,
  bottom: screenHeight - (100 + 100), // top + height
  left: gutter,
  right: screenWidth - gutter,

  width: screenWidth - (gutter * 2),
  height: 100,
};

const heightWithBlackBorder = 120;
const frameWidth = (128 / 80) * thumbnailBounds.height;

describe('timeline thumbnails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    percentToOffsetMock.mockImplementation((percent) => Math.round(percent * 30000));
  });

  it('should check the segment for every image', () => {
    const tiles = thumbnailTiles(thumbnailBounds, percentToOffsetMock, mockRoute);

    expect(percentToOffsetMock.mock.calls.length).toBe(10);
    expect(tiles).toHaveLength(5);

    for (const tile of tiles) {
      expect(tile.className).toContain('thumbnailImage');

      const backgroundParts = tile.backgroundSize.split(' ');
      const height = Number(backgroundParts[1].replace('px', ''));
      expect(height).toBe(heightWithBlackBorder);
      // never stretch thumbnail images
      expect(backgroundParts[0]).toBe('auto');

      expect(tile.backgroundImage).toBe(`url(${mockRoute.url}/0/sprite.jpg)`);
    }
  });

  it('merges runs of consecutive frames and covers the whole strip', () => {
    const tiles = thumbnailTiles(thumbnailBounds, percentToOffsetMock, mockRoute);

    expect(tiles.map((tile) => tile.width)).toEqual([1, 3, 2, 3, 1].map((n) => n * frameWidth));
    expect(tiles.map((tile) => tile.backgroundPositionX))
      .toEqual([0, 0, 2, 3, 5].map((frame) => `-${frame * frameWidth}px`));

    const covered = tiles.reduce((sum, tile) => sum + tile.width, 0);
    expect(covered).toBeGreaterThanOrEqual(thumbnailBounds.width);
  });

  it('doesn\'t render before bounds are set', () => {
    const tiles = thumbnailTiles({
      width: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    }, percentToOffsetMock, mockRoute);

    expect(tiles).toHaveLength(0);
  });

  it('works when theres no blank at the end', () => {
    const route = {
      url: mockRoute.url,
      offset: 1600,
      segment_numbers: Array.from(Array(4).keys()),
      segment_offsets: Array.from(Array(4).keys()).map((i) => i * 60),
    };

    const tiles = thumbnailTiles(thumbnailBounds, percentToOffsetMock, route);

    expect(percentToOffsetMock.mock.calls.length).toBe(10);
    expect(tiles).toHaveLength(5);
    expect(tiles.every((tile) => !tile.blank)).toBe(true);

    for (const tile of tiles) {
      expect(tile.className).toContain('thumbnailImage');

      const backgroundParts = tile.backgroundSize.split(' ');
      const height = Number(backgroundParts[1].replace('px', ''));
      expect(height).toBe(heightWithBlackBorder);

      // never stretch thumbnail images
      expect(backgroundParts[0]).toBe('auto');
    }
  });

  it('works when it\'s supermegaskinny', () => {
    const tiles = thumbnailTiles({
      width: 0,
      height: 100,
      left: 10,
      right: 10,
      top: 100,
      bottom: 100,
    }, percentToOffsetMock, mockRoute);

    expect(tiles).toHaveLength(0);
    expect(percentToOffsetMock.mock.calls.length).toBe(0);
  });

  it('fills the strip with one blank tile without a route', () => {
    const tiles = thumbnailTiles(thumbnailBounds, percentToOffsetMock, null);

    expect(tiles).toHaveLength(1);
    expect(tiles[0].blank).toBe(true);
    expect(tiles[0].className).toBe('thumbnailImage blank');
    expect(tiles[0].backgroundImage).toBeNull();
    expect(tiles[0].width).toBe(10 * frameWidth);
  });
});
