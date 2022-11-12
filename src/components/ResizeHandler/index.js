import { useEffect } from 'react';
import PropTypes from 'prop-types';

const ResizeHandler = (props) => {
  const { onResize } = props;

  let resizeTimeout;
  const handleResize = () => {
    if (resizeTimeout) {
      window.clearTimeout(resizeTimeout);
    }

    resizeTimeout = window.setTimeout(() => {
      onResize(window.innerWidth, window.innerHeight);
      resizeTimeout = null;
    }, 150);
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }
    };
  }, [onResize]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return null;
};

ResizeHandler.propTypes = {
  onResize: PropTypes.func.isRequired,
};

export default ResizeHandler;
