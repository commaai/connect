import React from 'react';
import { CircularProgress, Typography } from '@material-ui/core';

import { ErrorOutline } from '../../icons';

/**
 * @param {object} props
 * @param {boolean} props.loading
 * @param {string} props.error
 */
const VideoOverlay = ({ loading, error }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: '#FFFFFF' }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

export default VideoOverlay;
