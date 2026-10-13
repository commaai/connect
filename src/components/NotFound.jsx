import React from 'react';
import { connect } from 'react-redux';
import { Typography } from '@material-ui/core';

import { selectDevice } from '../actions';
import { filterRegularClick } from '../utils';

const NotFound = ({ dongleId, dispatch }) => (
  <div className="p-8 text-center text-white">
    <Typography variant="title">Page not found</Typography>
    <a href={dongleId ? `/${dongleId}` : '/'} className="underline"
      onClick={filterRegularClick(() => dispatch(selectDevice(dongleId)))}>
      Back to dashboard
    </a>
  </div>
);

export default connect()(NotFound);
