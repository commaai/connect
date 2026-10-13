import React from 'react';
import { connect } from 'react-redux';
import { Typography } from '@material-ui/core';

import { selectDevice } from '../actions';
import { filterRegularClick } from '../utils';

const NotFound = ({ dongleId, dispatch }) => (
  <div style={{ padding: 32, textAlign: 'center', color: 'white' }}>
    <Typography variant="title">Page not found</Typography>
    <a href={dongleId ? `/${dongleId}` : '/'} style={{ color: 'white' }}
      onClick={filterRegularClick(() => dispatch(selectDevice(dongleId)))}>
      Back to dashboard
    </a>
  </div>
);

export default connect()(NotFound);
