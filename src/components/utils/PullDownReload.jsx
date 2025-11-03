import { withStyles } from '@material-ui/core';
import ReplayIcon from '@material-ui/icons/Replay';
import { useCallback, useEffect, useRef, useState } from 'react';

import Colors from '../../colors';
import { isIos } from '../../utils/browser.js';

const styles = () => ({
  root: {
    position: 'absolute',
    zIndex: 5050,
    top: -48,
    left: 'calc(50% - 24px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    backgroundColor: Colors.grey100,
    borderRadius: 24,
  },
});

const PullDownReload = ({ classes }) => {
  const [startY, setStartY] = useState(null);
  const [reloading, setReloading] = useState(false);
  const dragEl = useRef(null);

  const touchStart = useCallback((ev) => {
    if (document.scrollingElement.scrollTop !== 0 || ev.defaultPrevented) {
      return;
    }

    setStartY(ev.touches[0].pageY);
  }, []);

  const touchMove = useCallback(
    (ev) => {
      const el = dragEl.current;
      if (startY === null || !el) {
        return;
      }

      const top = Math.min((ev.touches[0].pageY - startY) / 2 - 48, 32);
      el.style.transition = 'unset';
      el.style.top = `${top}px`;
      if (ev.touches[0].pageY - startY > 0) {
        ev.preventDefault();
      } else {
        setStartY(null);
        el.style.transition = 'top 0.1s';
        el.style.top = '-48px';
      }
    },
    [startY],
  );

  const touchEnd = useCallback(() => {
    const el = dragEl.current;
    if (startY === null || !el) {
      return;
    }

    const top = parseInt(el.style.top.substring(0, el.style.top.length - 2), 10);
    if (top >= 32 && !reloading) {
      setReloading(true);
      window.location.reload();
    } else {
      setStartY(null);
      el.style.transition = 'top 0.1s';
      el.style.top = '-48px';
    }
  }, [startY, reloading]);

  useEffect(() => {
    if (window && window.navigator) {
      const isStandalone = window.navigator.standalone === true;
      if (isIos() && isStandalone) {
        document.addEventListener('touchstart', touchStart, { passive: false });
        document.addEventListener('touchmove', touchMove, { passive: false });
        document.addEventListener('touchend', touchEnd, { passive: false });

        return () => {
          document.removeEventListener('touchstart', touchStart);
          document.removeEventListener('touchmove', touchMove);
          document.removeEventListener('touchend', touchEnd);
        };
      }
    }
  }, [touchStart, touchMove, touchEnd]);

  return (
    <div className={classes.root} ref={dragEl}>
      <ReplayIcon />
    </div>
  );
};

export default withStyles(styles)(PullDownReload);
