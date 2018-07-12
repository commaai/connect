import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import ShopButton from './shopButton';

const styles = theme => {
  return {
    root: {
      paddingTop: '48px'
    },
    eon: {
      display: 'block',
      width: '100%',
    },
    content: {
      padding: '50px 12px',
    }
  }
};

class EonUpsell extends Component {
  render () {
    return (
      <Grid container xs={12} className={ this.props.classes.root }>
        <Grid item xs={6}>
          <img src='https://comma.ai/eon-offroad-transparent-01.png'
               className={ this.props.classes.eon } />
        </Grid>
        <Grid container xs={6} justify='center' className={ this.props.classes.content }>
          <Grid item xs={12}>
            <Typography align='center'>Unlock driving annotations with an EON</Typography>
          </Grid>
          <ShopButton link="https://comma.ai/shop/products/eon-dashcam-devkit/?ref=explorer" />
        </Grid>
      </Grid>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(EonUpsell));
