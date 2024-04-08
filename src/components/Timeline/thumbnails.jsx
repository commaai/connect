import React from 'react';
import { getSegmentNumber } from '../../utils';

export default function Thumbnails(props) {
  const { thumbnail } = props;
  const imgStyles = {
    display: 'inline-block',
    height: thumbnail.height,
    width: (128 / 80) * thumbnail.height,
  };
  const imgCount = Math.ceil(thumbnail.width / imgStyles.width);

  const imgArr = [];
  let currSegment = null;

  if (!Number.isFinite(imgCount)) {
    return [];
  }
  const route = props.currentRoute;
  for (let i = 0; i < imgCount; ++i) {
    const offset = props.percentToOffset((i + 0.5) / imgCount);
    if (!route) {
      if (currSegment && !currSegment.blank) {
        imgArr.push(currSegment);
        currSegment = null;
      }
      if (!currSegment) {
        currSegment = {
          blank: true,
          length: 0,
        };
      }
      currSegment.length += 1;
    } else {
      // 12 per file, 5s each
      const seconds = Math.floor((offset - route.offset) / 1000);
      const imageIndex = Math.max(0, Math.min(Math.floor(seconds / 5), 11));
      const segmentNum = getSegmentNumber(route, offset);
      const url = `${route.url}/${segmentNum}/sprite.jpg`;

      if (currSegment && (currSegment.blank || currSegment.segmentNum !== segmentNum)) {
        imgArr.push(currSegment);
        currSegment = null;
      }

      if (currSegment) {
        if (imageIndex === currSegment.endImage + 1) {
          currSegment.endImage = imageIndex;
        } else {
          imgArr.push(currSegment);
          currSegment = null;
        }
      }

      if (!currSegment) {
        currSegment = {
          segmentNum,
          startOffset: seconds,
          startImage: imageIndex,
          endImage: imageIndex,
          length: 0,
          url,
        };
      }

      currSegment.length += 1;
      currSegment.endOffset = seconds;
    }
  }

  if (currSegment) {
    imgArr.push(currSegment);
  }

  return imgArr.map((data, i) => (data.blank
    ? (
      <div
        key={i}
        className="thumbnailImage blank"
        role="img"
        style={{
          ...imgStyles,
          width: imgStyles.width * data.length,
        }}
      />
    )
    : (
      <div
        key={i}
        className="thumbnailImage images"
        role="img"
        style={{
          ...imgStyles,
          width: imgStyles.width * data.length,
          backgroundSize: `auto ${imgStyles.height * 1.2}px`,
          backgroundRepeat: 'repeat-x',
          backgroundImage: `url(${data.url})`,
          backgroundPositionX: `-${data.startImage * imgStyles.width}px`,
        }}
      />
    )));
}
