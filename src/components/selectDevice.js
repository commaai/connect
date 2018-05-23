import React, { Component } from 'react';
import Grid from '@material-ui/core/Grid';

import DeviceList from './deviceList';
import Header from './header';

export default class HomePage extends Component {
  render() {
    return (
      <div>
        <Header />
        <Grid container>
          <Grid item xs={12}>
            <DeviceList />
          </Grid>
        </Grid>
      </div>
    );
  }
}
