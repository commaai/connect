import React, { Component } from 'react';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';

const styles = (theme) => ({
  shopLink: {
    textDecoration: 'none',
  }
});

class ShopButton extends Component {
  render() {
    return (
      <a href={this.props.link} target="_blank" className={this.props.classes.shopLink}>
        <Button variant="outlined">
          Shop
        </Button>
      </a>
    );
  }
}

export default withStyles(styles)(ShopButton);
