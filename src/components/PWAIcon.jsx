import React, { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import {
  CircularProgress,
  IconButton,
  Tooltip,
} from '@material-ui/core';

import { CheckCircle, Download } from '../icons';

const intervalMS = 60 * 60 * 1000;  // 1 hour

const PWAIcon = ({ immediate }) => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedrefresh: () => {
      console.debug('[PWA] Update available');
      if (immediate) {
        updateServiceWorker(true);
      }
    },
    onOfflineReady: () => {
      console.debug('[PWA] Ready to work offline');
    },
    onRegistered: (registration) => {
      console.debug('[PWA] Service worker registered');

      if (registration) {
        // Check for updates regularly
        setInterval(() => {
          console.debug('[PWA] Checking for updates');
          registration.update();
        }, intervalMS);
      }
    },
    onRegisterError: (error) => {
      console.error('[PWA]', error);
    },
  });
  const [installing, setInstalling] = useState(false);

  if (immediate) {
    return null;
  }

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) {
    return <div className="w-12" />;
  }

  let title;
  let icon;
  let callback;
  if (needRefresh) {
    title = 'Install update';
    icon = <Download className="w-7 h-7 text-[rgba(128,255,128,0.5)]" />;
    callback = () => {
      setInstalling(true);
      updateServiceWorker(true);
    };
  } else if (offlineReady) {
    title = 'No updates available';
    icon = <CheckCircle className="w-6 h-6 text-[rgba(255,255,255,0.5)]" />;
    callback = close;
  }

  return (
    <Tooltip
      className="w-12 flex justify-center self-center"
      title={<span className="text-xs">{title}</span>}
    >
      <IconButton
        className="animate-fadein"
        onClick={callback}
        disabled={installing}
      >
        {installing ? (
          <CircularProgress className="flex text-[rgba(128,255,128,0.5)]" size={24} />
        ) : icon}
      </IconButton>
    </Tooltip>
  );
};

export default PWAIcon;
