import React from 'react';
import { IconButton, Typography } from '@material-ui/core';
import Colors from '../../colors';
import { ArrowBackBold } from '../../icons';

const Navigation = ({ classes, onClose, deviceName, isLandscape }) => {
  if (isLandscape) {
    return (
      <div style={{ position: 'absolute', left: 8, top: 8, zIndex: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconButton
          className={classes.backButton}
          onClick={onClose}
          style={{ width: 32, height: 32, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
        >
          <ArrowBackBold style={{ fontSize: 18 }} />
        </IconButton>
        <div style={{
          borderRadius: 20,
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 500,
          color: Colors.white,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
        }}>
          {deviceName}
        </div>
      </div>
    );
  }

  return (
    <div className={classes.header}>
      <IconButton className={classes.backButton} onClick={onClose}>
        <ArrowBackBold style={{ fontSize: 20 }} />
      </IconButton>
      <Typography className={classes.headerTitle}>{deviceName}</Typography>
    </div>
  );
};

export default Navigation;
