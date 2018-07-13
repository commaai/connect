import React, { Component } from 'react';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import ShopButton from './shopButton';

const styles = theme => {
  return {
    root: {
      display: 'flex',
      paddingTop: '48px'
    },
    eon: {
      display: 'block',
      width: '100%',
    },
    content: {
      padding: '50px 12px',
      textAlign: 'center'
    }
  }
};

class EonUpsell extends Component {
  render () {
    return (
      <div className={ this.props.classes.root }>
        <Grid item xs={6}>
          <img
            src='https://comma.ai/eon-offroad-transparent-01.png'
            className={ this.props.classes.eon } />
        </Grid>
        <Grid item xs={6} className={ this.props.classes.content }>
          <Typography>{ this.props.hook }</Typography>
          <ShopButton link="https://comma.ai/shop/products/eon-dashcam-devkit/?ref=explorer" />
        </Grid>
      </div>
    );
  }
}

export default withStyles(styles)(EonUpsell);
