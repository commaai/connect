import React, { createRef, useEffect } from 'react';
import { withStyles } from '@material-ui/core/styles';

const styles = () => ({
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  placeholder: {
    position: 'absolute',
    zIndex: 1,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },
  hdImage: {
    position: 'absolute',
    zIndex: 2,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // TODO: add attributes
    // backgroundPosition: 'center',
    // backgroundSize: 'cover',
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },
  overlay: {
    position: 'absolute',
    zIndex: 3,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },
  fadeIn: {
    opacity: 1,
  },
});

/* eslint-disable react/jsx-props-no-spreading */
const BackgroundImage = (props) => {
  const hdImageRef = createRef();
  const placeholderRef = createRef();
  const overlayRef = createRef();
  const { placeholder, classes, className, src, children, overlay, ...rest } = props;

  useEffect(() => {
    const newImage = document.createElement('img');
    const hdImageEl = hdImageRef.current;
    const placeholderEl = placeholderRef.current;
    const overlayEl = overlayRef.current;
    newImage.src = src;
    newImage.onload = () => {
      hdImageEl.setAttribute('style', `background-image: url(${src})`);
      hdImageEl.classList.add(classes.fadeIn);
      overlayEl.classList.add(classes.fadeIn);
    };
    newImage.onerror = () => {
      placeholderEl.classList.add(classes.fadeIn);
      overlayEl.classList.add(classes.fadeIn);
    };

    return () => {
      newImage.remove();
    };
  }, []);

  return (
    <div
      className={`${classes.root} ${className || ''}`}
      {...rest}
    >
      <div className={classes.hdImage} ref={hdImageRef} />
      <div
        className={classes.placeholder}
        style={{ backgroundImage: `url(${placeholder})` }}
        ref={placeholderRef}
      >
        {children}
      </div>
      <div className={classes.overlay} ref={overlayRef}>{overlay}</div>
    </div>
  );
};

export default withStyles(styles)(BackgroundImage);
