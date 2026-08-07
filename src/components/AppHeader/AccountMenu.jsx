import React, { useCallback, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Switch } from '@material-ui/core';

import MyCommaAuth from '@commaai/my-comma-auth';

import { USERADMIN_URL_ROOT } from '../../api';
import { getDeveloperToolsEnabled, setDeveloperToolsEnabled } from '../../userSettings';

const logOut = async () => {
  await MyCommaAuth.logOut();
  if (window.location) {
    window.location = window.location.origin;
  }
};

const Version = () => {
  const sha = import.meta.env.VITE_APP_GIT_SHA;
  const timestamp = import.meta.env.VITE_APP_GIT_TIMESTAMP;

  let content = ['Version: '];

  if (sha) {
    const commitUrl = `https://github.com/commaai/connect/commit/${sha}`;
    content.push(<a key="0" className="text-blue-400 underline" href={commitUrl} target="_blank" rel="noreferrer">{sha.substring(0, 7)}</a>);

    if (timestamp) {
      const buildDate = dayjs(timestamp).fromNow();
      content.push(`, ${buildDate}`);
    }
  } else {
    content.push('dev');
  }

  return <span className="text-xs text-[#ffffff66]">{content}</span>
};

const AccountMenu = ({ profile, open, onClose }) => {
  const version = useMemo(() => <Version />, []);
  const [developerToolsEnabled, setDeveloperToolsState] = useState(getDeveloperToolsEnabled);

  const onLogOut = useCallback(() => {
    onClose();
    logOut();
  }, [onClose]);

  const onDeveloperToolsChange = useCallback((event) => {
    const enabled = event.target.checked;
    setDeveloperToolsState(enabled);
    setDeveloperToolsEnabled(enabled);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 mt-1 z-50 w-56 sm:w-64 rounded bg-[#30373B] shadow-lg overflow-hidden">
        <div className="flex flex-col items-start gap-2 px-4 pt-3 pb-4">
          <span className="font-bold text-white">{profile.email}</span>
          <span className="text-xs text-[#ffffff66]">{profile.user_id}</span>
          {version}
        </div>
        <div className="h-px bg-white/10" />
        <a
          className="block px-4 py-3 text-white hover:bg-white/10"
          href={USERADMIN_URL_ROOT}
          target="_blank"
          rel="noreferrer"
          onClick={onClose}
        >
          Manage account
        </a>
        <label className="flex w-full cursor-pointer items-center justify-between px-4 py-2 text-white hover:bg-white/10">
          <span>Developer tools</span>
          <Switch
            checked={developerToolsEnabled}
            color="primary"
            inputProps={{ 'aria-label': 'Enable developer tools' }}
            onChange={onDeveloperToolsChange}
          />
        </label>
        <button
          className="block w-full px-4 py-3 text-left text-white hover:bg-white/10 cursor-pointer"
          onClick={onLogOut}
        >
          Log out
        </button>
      </div>
    </>
  );
};

export default AccountMenu;
