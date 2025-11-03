import debounce from 'debounce';
import { useCallback, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

const VisibilityHandler = (props) => {
  const { onInit, onInterval, onVisible, minInterval, resetOnHidden, onDongleId } = props;
  const dongleId = useSelector((state) => state.dongleId);

  const prevVisibleCall = useRef(0);
  const intervalHandle = useRef(null);

  const onVisibilityEvent = useCallback((visible) => {
    const newDate = Date.now() / 1000;
    const dt = newDate - prevVisibleCall.current;
    if (visible && (!minInterval || dt > minInterval)) {
      prevVisibleCall.current = newDate;
      onVisible();
    }

    if (!visible && resetOnHidden) {
      prevVisibleCall.current = newDate;
    }
  }, [minInterval, onVisible, resetOnHidden]);

  const debouncedVisibilityEvent = useRef(debounce(onVisibilityEvent, 1000, true));

  const handleFocus = useCallback(() => {
    debouncedVisibilityEvent.current(true);
  }, []);

  const handleBlur = useCallback(() => {
    debouncedVisibilityEvent.current(false);
  }, []);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      debouncedVisibilityEvent.current(true);
    } else if (document.visibilityState === 'hidden') {
      debouncedVisibilityEvent.current(false);
    }
  }, []);

  // Mount effect
  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('focus', handleFocus);
    document.addEventListener('blur', handleBlur);
    prevVisibleCall.current = Date.now() / 1000;

    if (onInit) {
      onVisible();
    }
    if (onInterval) {
      intervalHandle.current = setInterval(handleVisibilityChange, onInterval * 1000);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('focus', handleFocus);
      document.removeEventListener('blur', handleBlur);
      if (intervalHandle.current) {
        clearInterval(intervalHandle.current);
        intervalHandle.current = null;
      }
    };
  }, [onInit, onInterval, onVisible, handleVisibilityChange, handleFocus, handleBlur]);

  // DongleId change effect
  const prevDongleId = useRef(dongleId);
  useEffect(() => {
    if (onDongleId && prevDongleId.current !== dongleId) {
      prevVisibleCall.current = Date.now() / 1000;
      onVisible();
    }
    prevDongleId.current = dongleId;
  }, [dongleId, onDongleId, onVisible]);

  return null;
};

export default VisibilityHandler;
