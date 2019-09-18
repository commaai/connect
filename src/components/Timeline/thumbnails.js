import React from 'react';
import Segments from '../../timeline/segments';
import cx from 'classnames';

export default function Thumbnails (props) {
  const { thumbnail } = props;
  const imgStyles = {
    display: 'inline-block',
    height: thumbnail.height,
    width: (1164 / 874) * thumbnail.height,
  };
  var imgCount = Math.ceil(thumbnail.width / imgStyles.width);
  var gutter = 0;
  var blankImages = 0;
  imgStyles.marginRight = gutter / 2;

  var imgArr = [];
  var currentSegment = null;

  if (!isFinite(imgCount)) {
    return [];
  }
  for (let i = 0; i < imgCount; ++i) {
    let offset = props.percentToOffset((i + 0.5) / imgCount);
    let segment = props.getCurrentSegment(offset);
    if (!segment || !Segments.hasCameraAtOffset(segment, offset)) {
      if (currentSegment && !currentSegment.blank) {
        imgArr.push(currentSegment);
        currentSegment = null;
      }
      if (!currentSegment) {
        currentSegment = {
          blank: true,
          length: blankImages
        };
      }
      currentSegment.length = ++blankImages;
      continue;
    }
    blankImages = 0;

    let seconds = Math.floor((offset - segment.routeOffset) / 10000) * 10;
    let url = `${segment.url}/${segment.segment}/sprite.jpg`;
    seconds = seconds % 60;

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

    currentSegment.length++;
    currentSegment.endOffset = seconds;
  }

  return imgArr.map(renderImage);

  function renderImage (data, i) {
    if (data.blank) {
      return (
        <div
          key={ i }
          style={{
            ...imgStyles,
            width: imgStyles.width * data.length,
          }}
          />
      );
    }
    return (
      <div
        key={ i }
        style={{
          ...imgStyles,
          width: imgStyles.width * data.length,
          marginLeft: gutter,
          backgroundSize: Math.max(100, Math.round(1200 / data.length)) + '% 100%',
          backgroundImage: 'url(' + data.url + ')'
        }} />
    );
  }
}
