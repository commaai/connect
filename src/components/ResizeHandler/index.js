import PropTypes from 'prop-types';
import { useCallback, useEffect, useRef } from 'react';

const ResizeHandler = (props) => {
  const { onResize } = props;

  const resizeTimeoutRef = useRef(null);

  const handleResize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      window.clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = window.setTimeout(() => {
      onResize(window.innerWidth, window.innerHeight);
      resizeTimeoutRef.current = null;
    }, 150);
  }, [onResize]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [handleResize]);

  return null;
};

ResizeHandler.propTypes = {
  onResize: PropTypes.func.isRequired,
};

export default ResizeHandler;
