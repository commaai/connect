/* eslint-disable no-console */
import React, { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { IconButton, Tooltip } from '@material-ui/core';

import { CheckCircle, Download } from '../icons';

const intervalMS = 60 * 60 * 1000;  // 1 hour

const PWAIcon = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onOfflineReady: () => {
      console.debug('[PWA] onOfflineReady');
    },
    onNeedRefresh: () => {
      console.debug('[PWA] onNeedRefresh');
    },
    onRegistered: (registration) => {
      console.debug('[PWA] onRegistered', registration);

      if (registration) {
        // Check for updates regularly
        setInterval(() => {
          registration.update();
        }, intervalMS);
      }
    },
    onRegisteredSW() {
      console.debug('[PWA] onRegisteredSW', ...arguments);  // eslint-disable-line prefer-rest-params
    },
    onRegisterError: (error) => {
      console.debug('[PWA] onRegisterError', error);
    },
  });
  const [installing, setInstalling] = useState(false);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  console.debug({
    offlineReady,
    needRefresh,
  });

  if (!offlineReady && !needRefresh) {
    return null;
  }

  if (installing) {
    // TODO: loading spinner
    return <span>Installing</span>;
  }

  let title;
  let Icon;
  let color;
  let callback;
  if (needRefresh) {
    title = 'Install update';
    Icon = Download;
    color = 'text-[rgba(128,_255,_128,_0.5)]';
    callback = () => {
      setInstalling(true);
      updateServiceWorker(true);
    };
  } else if (offlineReady) {
    title = 'No updates available';
    Icon = CheckCircle;
    color = 'text-[rgba(255,_255,_255,_0.5)]';
    callback = close;
  }

  return (
    <Tooltip title={<span className="text-xs">{title}</span>}>
      <IconButton onClick={callback}>
        <Icon className={`w-7 h-7 ${color}`} />
      </IconButton>
    </Tooltip>
  );
};

export default PWAIcon;
