import React from 'react';
import { IconButton, Typography } from '@material-ui/core';
import { ArrowBackBold } from '../../icons';

const Navigation = ({ onClose, deviceName, isLandscape }) => {
  if (isLandscape) {
    return (
      <div className="absolute left-2 top-2 z-20 flex items-center gap-1">
        <IconButton
          className="text-white p-2 w-8 h-8 bg-black/40 backdrop-blur-lg"
          onClick={onClose}
        >
          <ArrowBackBold style={{ fontSize: 18 }} />
        </IconButton>
        <div className="rounded-[20px] px-3 py-1 text-xs font-medium text-white bg-black/40 backdrop-blur-lg">
          {deviceName}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center px-3 py-2 bg-[#151819] border-b border-white/10 min-h-[48px] z-10">
      <IconButton className="text-white p-2" onClick={onClose}>
        <ArrowBackBold style={{ fontSize: 20 }} />
      </IconButton>
      <Typography className="text-base font-medium ml-2 flex-1">{deviceName}</Typography>
    </div>
  );
};

export default Navigation;
