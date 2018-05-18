import React, { Component } from 'react';
import Grid from '@material-ui/core/Grid';
import Minimap from './minimap';
import VideoPreview from './video';

export default class HomePage extends Component {
  render() {
    return (
      <div className="App">
        <Grid container spacing={24}>
          <Grid item xs={7}>
            <Minimap />
          </Grid>
          <Grid item xs={5}>
            <VideoPreview />
          </Grid>
        </Grid>
      </div>
    );
  }
}
