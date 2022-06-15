import React from 'react';

export default function Thumbnails(props) {
  const { thumbnail } = props;
  const imgStyles = {
    display: 'inline-block',
    height: thumbnail.height,
    width: (128/80) * thumbnail.height,
  };
  const imgCount = Math.ceil(thumbnail.width / imgStyles.width);

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
      // 12 per file, 5s each
      let seconds = Math.floor((offset - segment.routeOffset) / 1000);
      const url = `${segment.url}/${segment.segment}/sprite.jpg`;
      seconds %= 60;

      if (currentSegment && (currentSegment.blank || currentSegment.segment !== segment.segment)) {
        imgArr.push(currentSegment);
        currentSegment = null;
      }

      const imageIndex = Math.floor(seconds / 5);

      if (currentSegment) {
        if (imageIndex === currentSegment.endImage + 1) {
          currentSegment.endImage = imageIndex;
        } else {
          imgArr.push(currentSegment);
          currentSegment = null;
        }
      }

      if (!currentSegment) {
        currentSegment = {
          segment: segment.segment,
          startOffset: seconds,
          startImage: imageIndex,
          endImage: imageIndex,
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

  return imgArr.map((data, i) =>
    data.blank ?
      <div key={i} className="thumbnailImage blank" style={{
        ...imgStyles,
        width: imgStyles.width * data.length
      }} />
    :
      <div key={i} className="thumbnailImage images" style={{
        ...imgStyles,
        width: imgStyles.width * data.length,
        backgroundSize: `auto ${imgStyles.height*1.2}px`,
        backgroundRepeat: 'repeat-x',
        backgroundImage: `url(${data.url})`,
        backgroundPositionX: `-${data.startImage * imgStyles.width}px`,
      }} />
  );
}
