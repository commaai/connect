import React, { useState, useEffect } from 'react';
import { Typography, Button } from '@material-ui/core';
import Refresh from '@material-ui/icons/Refresh';
import InfoOutline from '@material-ui/icons/InfoOutline';
import BatteryFull from '@material-ui/icons/BatteryFull';
import Colors from '../../colors';
import { isChrome, isFirefox, isSafari, isIos } from '../../utils/browser';
import { getDeviceBaseUrl } from '../../utils/bodyteleop';

function getSslInstructions() {
  if (isSafari()) {
    return [
      'Make sure Body ignition is ON',
      'Click "Open Trust Page"',
      'Tap "Show Details"',
      'Tap "visit this website"',
      'Tap "Visit Website" to confirm',
    ];
  }
  if (isFirefox()) {
    return [
      'Make sure Body ignition is ON',
      'Click "Open Trust Page"',
      'Click "Advanced\u2026"',
      'Click "Accept Risk and Continue"',
    ];
  }
  if (isChrome() && isIos()) {
    return [
      'Make sure Body ignition is ON',
      'Click "Open Trust Page"',
      'Tap "Advanced"',
      'Tap "Proceed to ... (unsafe)"',
    ];
  }
  return [
    'Make sure Body ignition is ON',
    'Click "Open Trust Page"',
    'Click "Advanced"',
    'Click "Proceed to ... (unsafe)"',
  ];
}

const SslTrustDialog = ({ classes, directAddress, isLandscape }) => {
  const trustUrl = `${getDeviceBaseUrl(directAddress)}/trust`;
  const steps = getSslInstructions();

  return (
    <div className={classes.connectOverlay} style={{ overflow: 'auto' }}>
      <div className={classes.connectContent} style={{
        maxWidth: isLandscape ? 520 : 380,
        width: '90%',
        background: Colors.grey900,
        borderRadius: 16,
        padding: isLandscape ? 16 : 24,
        gap: isLandscape ? 10 : 16,
        margin: 'auto',
      }}>
        <Typography style={{ fontSize: isLandscape ? 16 : 18, fontWeight: 600 }}>
          Trust Device Certificate
        </Typography>
        <Typography style={{ fontSize: isLandscape ? 12 : 14, color: Colors.white60, lineHeight: 1.5, textAlign: 'center' }}>
          Your browser needs to trust this local network device&apos;s self-signed cert
          before connecting. Follow these steps:
        </Typography>
        <div style={{
          textAlign: 'left',
          background: Colors.white08,
          borderRadius: 12,
          padding: isLandscape ? '8px 12px' : '12px 16px',
          width: '100%',
        }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: i < steps.length - 1 ? (isLandscape ? 2 : 6) : 0 }}>
              <span style={{ fontSize: isLandscape ? 12 : 14, color: Colors.white40, fontWeight: 600, minWidth: 16 }}>{i + 1}.</span>
              <span style={{ fontSize: isLandscape ? 12 : 14, color: Colors.white70, lineHeight: 1.4 }}>{step}</span>
            </div>
          ))}
        </div>
        <Button
          className={classes.connectButton}
          onClick={() => window.open(trustUrl, '_blank')}
          disableRipple
        >
          Open Trust Page
        </Button>
        <Typography style={{ fontSize: isLandscape ? 10 : 12, color: Colors.white40, wordBreak: 'break-all', textAlign: 'center' }}>
          {trustUrl}
        </Typography>
        <Typography style={{ fontSize: isLandscape ? 12 : 14, color: Colors.white70 }}>
          After accepting, this page will connect automatically.
        </Typography>
      </div>
    </div>
  );
};

const ConnectOverlay = ({ classes, connectionState, error, statusMessage, connectProgress, onConnect }) => {
  const connecting = connectionState === 'connecting';
  const failed = connectionState === 'failed';

  return (
    <div className={classes.connectOverlay}>
      <div className={classes.connectContent}>
        {connecting ? (
          <>
            <div className={classes.progressBar}>
              <div className={classes.progressFill} style={{ width: `${connectProgress || 0}%` }} />
            </div>
            <span className={classes.progressLabel}>{statusMessage || 'Connecting...'}</span>
          </>
        ) : failed ? (
          <Button
            className={`${classes.connectButton} ${classes.connectButtonFailed}`}
            onClick={onConnect}
            disableRipple
          >
            <Refresh style={{ fontSize: 20 }} />
            Retry
          </Button>
        ) : null}
        {error && <div className={classes.errorBanner}>{error}</div>}
        {!connecting && (
          <div className={classes.infoBanner}>
            <InfoOutline style={{ fontSize: 16 }} />
            <span>Body must be powered on and started.</span>
          </div>
        )}
      </div>
    </div>
  );
};

const PortraitConnectArea = ({ classes, connectionState, error, statusMessage, connectProgress, batteryLevel, showSslTrust, directAddress, onConnect }) => {
  const connecting = connectionState === 'connecting';
  const failed = connectionState === 'failed';

  const dotColor = connectionState === 'connecting' ? '#facc15'
    : connectionState === 'connected' ? Colors.green50
    : connectionState === 'failed' ? Colors.red50
    : Colors.grey400;

  return (
    <div className={classes.portraitContent} style={{ overflow: 'auto' }}>
      {showSslTrust ? (
        <SslTrustDialog classes={classes} directAddress={directAddress} />
      ) : (
        <div className={classes.statusRow}>
          <div className={classes.statusLeft}>
            <div className={classes.statusDot} style={{ backgroundColor: dotColor, width: 10, height: 10 }} />
            <Typography style={{ fontSize: 14, textTransform: 'capitalize' }}>{connectionState}</Typography>
          </div>
          {batteryLevel !== null && (
            <div className={classes.batteryPill}>
              <BatteryFull style={{ fontSize: 18, color: Colors.white70 }} />
              <Typography style={{ fontSize: 14 }}>{batteryLevel}%</Typography>
            </div>
          )}
        </div>
      )}
      {error && (
        <div style={{ borderRadius: 8, background: 'rgba(220,38,38,0.15)', padding: 12, fontSize: 14, color: '#fca5a5' }}>
          {error}
        </div>
      )}
      {connecting ? (
        <>
          <div className={classes.progressBar} style={{ width: '100%' }}>
            <div className={classes.progressFill} style={{ width: `${connectProgress || 0}%` }} />
          </div>
          <Typography style={{ fontSize: 12, color: Colors.white50, textAlign: 'center' }}>
            {statusMessage || 'Connecting...'}
          </Typography>
        </>
      ) : failed ? (
        <Button
          variant="contained"
          className={classes.portraitButton}
          style={{ background: Colors.red400, color: Colors.white }}
          onClick={onConnect}
        >
          Retry
        </Button>
      ) : null}
      <div className={classes.infoBox}>
        <div className={classes.infoRow}>
          <InfoOutline style={{ fontSize: 18 }} />
          <span>The comma body must be powered on and ignition must be started to connect.</span>
        </div>
      </div>
    </div>
  );
};

const Video = ({
  classes, videoRef, isLandscape, connectionState, error, statusMessage,
  connectProgress, showSslTrust, directAddress, onConnect, batteryLevel,
}) => {
  const [videoAspectRatio, setVideoAspectRatio] = useState('16/9');
  const connected = connectionState === 'connected';

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onResize = () => {
      if (video.videoWidth && video.videoHeight) {
        setVideoAspectRatio(`${video.videoWidth}/${video.videoHeight}`);
      }
    };
    video.addEventListener('resize', onResize);
    return () => video.removeEventListener('resize', onResize);
  }, [videoRef, isLandscape]);

  if (isLandscape) {
    return (
      <>
        <video ref={videoRef} autoPlay playsInline muted className={classes.video} />
        {!connected && (
          showSslTrust
            ? <SslTrustDialog classes={classes} directAddress={directAddress} isLandscape />
            : <ConnectOverlay
                classes={classes}
                connectionState={connectionState}
                error={error}
                statusMessage={statusMessage}
                connectProgress={connectProgress}
                onConnect={onConnect}
              />
        )}
      </>
    );
  }

  // Portrait
  return connected ? (
    <div style={{ position: 'relative', background: Colors.black, flexShrink: 0 }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', aspectRatio: videoAspectRatio, display: 'block' }}
      />
      {/* Stats overlay is rendered by StatusBar as a sibling */}
    </div>
  ) : (
    <PortraitConnectArea
      classes={classes}
      connectionState={connectionState}
      error={error}
      statusMessage={statusMessage}
      connectProgress={connectProgress}
      batteryLevel={batteryLevel}
      showSslTrust={showSslTrust}
      directAddress={directAddress}
      onConnect={onConnect}
    />
  );
};

export default Video;
