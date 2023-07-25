/* eslint-disable no-console */
import React, { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { CircularProgress, IconButton, Tooltip } from '@material-ui/core';

import { CheckCircle, Download } from '../icons';

const intervalMS = 30 * 1000;  // 30 seconds

const PWAIcon = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onOfflineReady: () => {
      console.debug('[PWA] onOfflineReady');
    },
    onRegistered: (registration) => {
      console.debug('[PWA] Service worker registered');

      if (registration) {
        // Check for updates regularly
        setInterval(() => {
          registration.update();
        }, intervalMS);
      }
    },
    onRegisterError: (error) => {
      console.error('[PWA] onRegisterError', error);
    },
  });
  const [installing, setInstalling] = useState(false);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) {
    return null;
  }

  if (installing) {
    return (
      <div className="w-12 flex justify-center self-center">
        <CircularProgress className="flex text-[rgba(128,255,128,0.5)]" size={24} />
      </div>
    );
  }

  let title;
  let Icon;
  let color;
  let callback;
  if (needRefresh) {
    title = 'Install update';
    Icon = Download;
    color = 'text-[rgba(128,255,128,0.5)]';
    callback = () => {
      setInstalling(true);
      updateServiceWorker(true);
    };
  } else if (offlineReady) {
    title = 'No updates available';
    Icon = CheckCircle;
    color = 'text-[rgba(255,255,255,0.5)]';
    callback = close;
  }

  return (
    <Tooltip title={<span className="text-xs">{title}</span>}>
      <IconButton className="animate-fadein" onClick={callback}>
        <Icon className={`w-7 h-7 ${color}`} />
      </IconButton>
    </Tooltip>
  );
};

export default PWAIcon;
