import MyCommaAuth from '@commaai/my-comma-auth';
import { Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Clear } from '@mui/icons-material';
import localforage from 'localforage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import Colors from '../../colors';
import { IosShareIcon } from '../../icons';
import { isIos } from '../../utils/browser.js';

const PopupBox = styled('div')({
  margin: '0 auto',
  borderRadius: 22,
  padding: '12px 20px',
  color: Colors.white,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: Colors.grey500,
  border: `1px solid ${Colors.grey700}`,
});

const HideButton = styled(Clear)({
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
});

const Title = styled(Typography)({
  lineHeight: '31px',
  fontSize: 20,
  fontWeight: 600,
});

const ShareIconImg = styled('img')({
  display: 'inline',
  verticalAlign: 'text-bottom',
  margin: '0 3px',
});

const IosPwaPopup = () => {
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
      <PopupBox className="xs:w-fit">
        <HideButton onClick={hide} />
        <Title>Add to home screen</Title>
        <Typography>
          Install this webapp on your home screen: <br />
          tap <ShareIconImg src={IosShareIcon} width={35 / 2.2} height={44 / 2.2} alt="share" /> and then &lsquo;Add to Home Screen&rsquo;
        </Typography>
      </PopupBox>
    </div>
  );
};

export default IosPwaPopup;
