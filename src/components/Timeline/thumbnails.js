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
  let currentRoute = null;

  if (!Number.isFinite(imgCount)) {
    return [];
  }
  for (let i = 0; i < imgCount; ++i) {
    const offset = props.percentToOffset((i + 0.5) / imgCount);
    const route = props.getCurrentRoute(offset);
    if (!route) {
      if (currentRoute && !currentRoute.blank) {
        imgArr.push(currentRoute);
        currentRoute = null;
      }
      if (!currentRoute) {
        currentRoute = {
          blank: true,
          length: 0
        };
      }
      currentRoute.length += 1;
    } else {
      // 12 per file, 5s each
      let seconds = Math.floor((offset - route.offset) / 1000);
      let segmentNum = null;
      for (let i = 0; i < route.segment_offsets.length; i++) {
        if (offset >= route.segment_offsets[i] &&
          (i === route.segment_offsets.length - 1 || offset < route.segment_offsets[i+1]))
        {
          segmentNum = i;
          break;
        }
      }
      const url = `${route.url}/${segmentNum}/sprite.jpg`;
      seconds %= 60;

      if (currentRoute && (currentRoute.blank || currentRoute.segmentNum !== route.segmentNum)) {
        imgArr.push(currentRoute);
        currentRoute = null;
      }

      const imageIndex = Math.floor(seconds / 5);

      if (currentRoute) {
        if (imageIndex === currentRoute.endImage + 1) {
          currentRoute.endImage = imageIndex;
        } else {
          imgArr.push(currentRoute);
          currentRoute = null;
        }
      }

      if (!currentRoute) {
        currentRoute = {
          segmentNum: segmentNum,
          startOffset: seconds,
          startImage: imageIndex,
          endImage: imageIndex,
          length: 0,
          url
        };
      }

      currentRoute.length += 1;
      currentRoute.endOffset = seconds;
    }
  }

  if (currentRoute) {
    imgArr.push(currentRoute);
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
