import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import ShopButton from './shopButton';
import greyPandaTsp from '../../static/grey-panda-tsp.png';

const styles = theme => {
  return {
    root: {
      height: '96px',
      padding: '12px 0',
    },
    rowFill: {
      height: '100%',
    },
    image: {
      display: 'block',
      height: '72px'
    },
    block: {
      display: 'block',
    },
  }
};

class GreyPandaUpsellRow extends Component {
  render () {
    return (
      <Grid container xs={12} className={ this.props.classes.root }>
        <Grid item xs={6}>
          <Grid container alignItems='center' justify='center' className={ this.props.classes.rowFill }>
            <img src={ greyPandaTsp } className={ this.props.classes.image } />
          </Grid>
        </Grid>
        <Grid item xs={6}>
          <Grid container alignItems='center' justify='center' className={ this.props.classes.rowFill }>
            <Grid item xs={12}>
              <Typography align='center' className={ this.props.classes.block }>
                Upgrade to a Grey Panda and help improve openpilot
              </Typography>
            </Grid>
            <ShopButton link="https://comma.ai/shop/products/panda-obd-ii-dongle/?ref=explorer" />
          </Grid>
        </Grid>
      </Grid>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(GreyPandaUpsellRow));
