import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import ShopButton from './shopButton';

const styles = (theme) => ({
  root: {
    height: '96px',
    padding: '12px 0',
  },
  rowFill: {
    height: '100%',
    textAlign: 'center'
  },
  image: {
    display: 'inline-block',
    height: '72px',
    width: 'auto'
  }
});

class GreyPandaUpsellRow extends Component {
  render() {
    return (
      <Grid container className={this.props.classes.root}>
        <Grid item xs={6} className={this.props.classes.rowFill}>
          <img src="/images/grey-panda-tsp.png" className={this.props.classes.image} />
        </Grid>
        <Grid item xs={6} className={this.props.classes.rowFill}>
          <Typography>
            Upgrade to a Grey Panda and help improve openpilot
          </Typography>
          <ShopButton link="https://comma.ai/shop/products/panda-obd-ii-dongle/?ref=explorer" />
        </Grid>
      </Grid>
    );
  }
}

export default withStyles(styles)(GreyPandaUpsellRow);
