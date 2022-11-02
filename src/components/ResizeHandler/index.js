import { useEffect } from 'react';
import PropTypes from 'prop-types';

const ResizeHandler = (props) => {
  let resizeTimeout;

  const handleResize = () => {
    if (resizeTimeout) {
      window.clearTimeout(resizeTimeout);
    }

    resizeTimeout = window.setTimeout(() => {
      props.onResize(window.innerWidth, window.innerHeight);
      resizeTimeout = null;
    }, 150);
  };

  useEffect(() => {
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }
    }
  });

  return null;
};

ResizeHandler.propTypes = {
  onResize: PropTypes.func.isRequired,
};

export default ResizeHandler;
