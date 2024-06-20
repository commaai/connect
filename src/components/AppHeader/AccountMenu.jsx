import React, { useCallback, useMemo } from 'react';
import dayjs from 'dayjs';

import {
  Divider,
  ListItem,
  Menu,
  MenuItem,
} from '@material-ui/core';

import MyCommaAuth from '@commaai/my-comma-auth';

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

const AccountMenu = ({ profile, open, anchorEl, onClose, ...rest }) => {
  const version = useMemo(() => <Version />, []);

  const onLogOut = useCallback(() => {
    onClose();
    logOut();
  }, [onClose]);

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorEl={anchorEl}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      {...rest}
    >
      <ListItem className="text-white pt-3 pb-4 px-4 flex-col items-start gap-2">
        <span className="font-bold">{profile.email}</span>
        <span className="text-xs text-[#ffffff66]">{profile.user_id}</span>
        {version}
      </ListItem>
      <Divider />
      <MenuItem
        className="py-3 px-4"
        component="a"
        href="https://useradmin.comma.ai/"
        target="_blank"
      >
        Manage Account
      </MenuItem>
      <MenuItem
        className="py-3 px-4"
        onClick={onLogOut}
      >
        Log out
      </MenuItem>
    </Menu>
  );
};

export default AccountMenu;
