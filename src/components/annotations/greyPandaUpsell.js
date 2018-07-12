import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import greyPandaTsp from '../../static/grey-panda-tsp.png';

const styles = theme => {
  return {
    root: {
      height: '96px',
      padding: '12px 0',
    },
    image: {
      display: 'block',
      height: '100%',
    }
  }
};

class GreyPandaUpsellRow extends Component {
  render () {
    return (
      <Grid container xs={12} className={ this.props.classes.root }>
        <Grid item xs={6}>
          <img src={ greyPandaTsp } className={ this.props.classes.image } />
        </Grid>
        <Grid item xs={6}>
          <Typography>Buy a grey panda</Typography>
        </Grid>
      </Grid>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(GreyPandaUpsellRow));
