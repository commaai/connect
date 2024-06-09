import React, { useCallback } from 'react';

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

const AccountMenu = ({ profile, open, anchorEl, onClose, ...rest }) => {
  const onLogOut = useCallback(() => {
    onClose();
    logOut();
  }, [onClose]);

  const shortenGitHash = fullHash => fullHash ? fullHash.substring(0, 7) : '';

  const gitCommitHash = process.env.REACT_APP_GIT_COMMIT_HASH_PLACEHOLDER || '';
  const shortGitCommitHash = shortenGitHash(gitCommitHash);
  const gitCommitUrl = gitCommitHash ? `https://github.com/commaai/openpilot/commit/${shortGitCommitHash}` : '';

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorEl={anchorEl}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      {...rest}
    >
      <ListItem className="text-white py-3 px-4 flex-col items-start">
        <span className="font-bold">{profile.email}</span>
        <span className="text-xs text-[#ffffff66] pt-2">{profile.user_id}</span>
        <span className="text-xs text-[#ffffff66] pt-2">
          Version: <a href={gitCommitUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }} >{shortGitCommitHash}</a>
        </span>
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
