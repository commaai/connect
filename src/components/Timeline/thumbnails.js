import React from 'react';
import { partial } from 'ap';

const gutter = 0;

function renderImage(imgStyles, data, i) {
  if (data.blank) {
    return (
      <div
        key={i}
        style={{
          ...imgStyles,
          width: imgStyles.width * data.length,
        }}
      />
    );
  }
  return (
    <div
      key={i}
      style={{
        ...imgStyles,
        width: imgStyles.width * data.length,
        marginLeft: gutter,
        backgroundSize: `${Math.max(100, Math.round(1200 / data.length))}% 100%`,
        backgroundImage: `url(${data.url})`
      }}
    />
  );
}

export default function Thumbnails(props) {
  const { thumbnail } = props;
  const imgStyles = {
    display: 'inline-block',
    height: thumbnail.height,
    width: (1164 / 874) * thumbnail.height,
  };
  const imgCount = Math.ceil(thumbnail.width / imgStyles.width);
  imgStyles.marginRight = gutter / 2;

  const imgArr = [];
  let currentSegment = null;

  if (!Number.isFinite(imgCount)) {
    return [];
  }
  for (let i = 0; i < imgCount; ++i) {
    const offset = props.percentToOffset((i + 0.5) / imgCount);
    const segment = props.getCurrentSegment(offset);
    if (!segment) {
      if (currentSegment && !currentSegment.blank) {
        imgArr.push(currentSegment);
        currentSegment = null;
      }
      if (!currentSegment) {
        currentSegment = {
          blank: true,
          length: 0
        };
      }
      currentSegment.length += 1;
    } else {
      let seconds = Math.floor((offset - segment.routeOffset) / 10000) * 10;
      const url = `${segment.url}/${segment.segment}/sprite.jpg`;
      seconds %= 60;

      if (currentSegment && (currentSegment.blank || currentSegment.segment !== segment.segment)) {
        imgArr.push(currentSegment);
        currentSegment = null;
      }

      if (!currentSegment) {
        currentSegment = {
          segment: segment.segment,
          startOffset: seconds,
          length: 0,
          url
        };
      }

      currentSegment.length += 1;
      currentSegment.endOffset = seconds;
    }
  }

  if (currentSegment) {
    imgArr.push(currentSegment);
  }

  return imgArr.map(partial(renderImage, imgStyles));
}
