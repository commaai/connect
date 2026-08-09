import { getSegmentNumber } from '../utils';

// A segment's sprite.jpg holds 12 frames, one every 5 seconds, each 128x80 with
// a black border below it (hence the 1.2 background-size multiplier).
const FRAMES_PER_SPRITE = 12;
const SECONDS_PER_FRAME = 5;
const FRAME_ASPECT = 128 / 80;
const FRAME_BORDER_SCALE = 1.2;

/**
 * Tile a thumbnail strip with sprite frames.
 *
 * Consecutive images that come from the same sprite and are consecutive frames
 * within it are merged into a single tile, drawn with a repeating background so
 * one element covers several frames.
 *
 * @param {{ width: number, height: number }} thumbnail measured strip size
 * @param {(percent: number) => number} percentToOffset maps 0..1 across the strip to a route offset
 * @param {object|null} route
 * @returns {object[]} tiles, in order, covering the strip left to right
 */
export function thumbnailTiles(thumbnail, percentToOffset, route) {
  const height = thumbnail.height;
  const width = FRAME_ASPECT * height;
  const imgCount = Math.ceil(thumbnail.width / width);

  if (!Number.isFinite(imgCount)) {
    return [];
  }

  const groups = [];
  let curr = null;

  for (let i = 0; i < imgCount; ++i) {
    const offset = percentToOffset((i + 0.5) / imgCount);
    if (!route) {
      if (curr && !curr.blank) {
        groups.push(curr);
        curr = null;
      }
      if (!curr) {
        curr = { blank: true, length: 0 };
      }
      curr.length += 1;
    } else {
      const seconds = Math.floor(offset / 1000);
      const imageIndex = Math.max(0, Math.min(Math.floor(seconds / SECONDS_PER_FRAME), FRAMES_PER_SPRITE - 1));
      const segmentNum = getSegmentNumber(route, offset);
      const url = `${route.url}/${segmentNum}/sprite.jpg`;

      if (curr && (curr.blank || curr.segmentNum !== segmentNum)) {
        groups.push(curr);
        curr = null;
      }

      if (curr) {
        if (imageIndex === curr.endImage + 1) {
          curr.endImage = imageIndex;
        } else {
          groups.push(curr);
          curr = null;
        }
      }

      if (!curr) {
        curr = {
          segmentNum,
          startOffset: seconds,
          startImage: imageIndex,
          endImage: imageIndex,
          length: 0,
          url,
        };
      }

      curr.length += 1;
      curr.endOffset = seconds;
    }
  }

  if (curr) {
    groups.push(curr);
  }

  return groups.map((data) => (data.blank
    ? {
      blank: true,
      className: 'thumbnailImage blank',
      height,
      width: width * data.length,
      backgroundImage: null,
      backgroundSize: null,
      backgroundPositionX: null,
    }
    : {
      blank: false,
      className: 'thumbnailImage images',
      height,
      width: width * data.length,
      backgroundImage: `url(${data.url})`,
      backgroundSize: `auto ${height * FRAME_BORDER_SCALE}px`,
      backgroundPositionX: `-${data.startImage * width}px`,
    }));
}
