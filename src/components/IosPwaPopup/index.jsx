import MyCommaAuth from '@commaai/my-comma-auth';
import { Typography } from '@mui/material';
import { withStyles } from '@mui/styles';
import { Clear } from '@mui/icons-material';
import localforage from 'localforage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import Colors from '../../colors';
import { IosShareIcon } from '../../icons';
import { isIos } from '../../utils/browser.js';

const styles = () => ({
  box: {
    margin: '0 auto',
    borderRadius: 22,
    padding: '12px 20px',
    color: Colors.white,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: Colors.grey500,
    border: `1px solid ${Colors.grey700}`,
  },
  hide: {
    cursor: 'pointer',
    padding: 5,
    fontSize: 20,
    position: 'relative',
    left: -30,
    top: -24,
    marginBottom: -32,
    height: 32,
    width: 32,
    borderRadius: 16,
    backgroundColor: Colors.grey900,
    color: Colors.white,
    border: `1px solid ${Colors.grey600}`,
  },
  title: {
    lineHeight: '31px',
    fontSize: 20,
    fontWeight: 600,
  },
  icon: {
    display: 'inline',
    verticalAlign: 'text-bottom',
    margin: '0 3px',
  },
});

const IosPwaPopup = ({ classes }) => {
  const [show, setShow] = useState(false);
  const windowEventsRef = useRef(0);
  const location = useLocation();

  const hide = useCallback(() => {
    try {
      localforage.setItem('hideIosPwaPopup', true);
    } catch (_err) {
      // pass
    }
    setShow(false);
  }, []);

  const onWindowClick = useCallback(() => {
    windowEventsRef.current += 1;
    if (windowEventsRef.current >= 3) {
      hide();
    }
  }, [hide]);

  // Check if popup should be shown on mount
  useEffect(() => {
    const checkShowPopup = async () => {
      if (window && window.navigator) {
        const isStandalone = window.navigator.standalone === true;
        if (isIos() && !isStandalone && MyCommaAuth.isAuthenticated()) {
          let isHidden;
          try {
            isHidden = await localforage.getItem('hideIosPwaPopup');
          } catch (_err) {
            isHidden = true;
          }
          setShow(!isHidden);
        }
      }
    };

    checkShowPopup();
  }, []);

  // Add/remove window click listener based on show state
  useEffect(() => {
    if (show) {
      window.addEventListener('click', onWindowClick);
      return () => {
        window.removeEventListener('click', onWindowClick);
      };
    }
  }, [show, onWindowClick]);

  // Hide on route change (after initial mount)
  const prevPathnameRef = useRef(location.pathname);
  useEffect(() => {
    if (prevPathnameRef.current !== location.pathname) {
      hide();
    }
    prevPathnameRef.current = location.pathname;
  }, [location.pathname, hide]);

  if (!show) {
    return null;
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 z-20">
      <div className={`${classes.box} xs:w-fit`}>
        <Clear className={classes.hide} onClick={hide} />
        <Typography className={classes.title}>Add to home screen</Typography>
        <Typography>
          Install this webapp on your home screen: <br />
          tap <img className={classes.icon} src={IosShareIcon} width={35 / 2.2} height={44 / 2.2} alt="share" /> and then &lsquo;Add to Home Screen&rsquo;
        </Typography>
      </div>
    </div>
  );
};

export default withStyles(styles)(IosPwaPopup);
