import React, { Component } from 'react';
import Grid from '@material-ui/core/Grid';

import DeviceList from './deviceList';
import VideoPreview from './video';
import Header from './header';
import LogStream from './logstream';

export default class HomePage extends Component {
  render() {
    return (
      <div>
        <Header />
        <Grid container>
          <Grid item xs={12}>
            <VideoPreview />
          </Grid>
          <Grid item xs={12}>
            <LogStream />
          </Grid>
        </Grid>
      </div>
    );
  }
}
