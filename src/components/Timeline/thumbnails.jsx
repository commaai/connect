import { useEffect, useRef, useState } from 'react';

import { getSegmentNumber } from '../../utils';
import { api } from '../../api/backend';

// A run of frames from one segment's sprite, fetched only once it comes into sight: a long
// drive's storyboard is wider than the screen, and its images would compete with the video.
function SpriteStrip({ url, style }) {
  const ref = useRef(null);
  const [inSight, setInSight] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (inSight) {
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInSight(true);
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [inSight]);
  return (
    <div
      ref={ref}
      className="thumbnailImage images"
      role="img"
      style={inSight ? { ...style, backgroundImage: `url(${url})` } : style}
    />
  );
}

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
      const seconds = Math.floor(offset / 1000);
      const imageIndex = Math.max(0, Math.min(Math.floor(seconds / 5), 11));
      const segmentNum = getSegmentNumber(route, offset);
      const url = api.routeAssets.thumbnail(route, segmentNum);

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
      <SpriteStrip
        key={i}
        url={data.url}
        style={{
          ...imgStyles,
          width: imgStyles.width * data.length,
          backgroundSize: `auto ${imgStyles.height * 1.2}px`,
          backgroundRepeat: 'repeat-x',
          backgroundPositionX: `-${data.startImage * imgStyles.width}px`,
        }}
      />
    )));
}
