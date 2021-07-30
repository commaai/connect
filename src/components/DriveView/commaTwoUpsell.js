import React, { Component } from 'react';

import { withStyles, Button, Typography } from '@material-ui/core';

import ResizeHandler from '../ResizeHandler';

const styles = () => ({
  eon: {
    maxWidth: '100%',
    width: 400,
  },
  content: {
    textAlign: 'center',
    minWidth: 120,
  },
  imageContainer: {
  },
  shopLink: {
    display: 'inline-block',
    marginTop: 8,
    textDecoration: 'none',
  },
  pairInstructions: {
    minWidth: 300,
    maxWidth: 750,
    minHeight: 150,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    textAlign: 'center',
    '& p:first-child': {
      fontWeight: 600,
    },
  },
  upsell: {
    display: 'flex',
    alignContent: 'center',
  },
});

class CommaTwoUpsell extends Component {
  constructor(props) {
    super(props);
    this.state = {
      windowWidth: window.innerWidth,
    };
  }

  render() {
    const { classes, hook } = this.props;
    const { windowWidth } = this.state;

    const containerPadding = windowWidth > 520 ? 36 : 16;

    return (
      <>
        <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
        <div className={ classes.pairInstructions } style={{ padding: `8px ${containerPadding}px` }}>
          <Typography>Already own a comma device?</Typography>
          <Typography>Scan the QR code on the device with your phone</Typography>
        </div>
        <div className={ classes.upsell } style={{ padding: `8px ${containerPadding}px` }}>
          <div className={classes.imageContainer}>
            <img src="https://comma.ai/two-onroad-transparent-01.png" className={classes.eon} />
          </div>
          <div className={classes.content}>
            <Typography>{ hook }</Typography>
            <a href="https://comma.ai/shop/products/comma-two-devkit/?ref=explorer" target="_blank"
              className={classes.shopLink}>
              <Button variant="outlined">Shop</Button>
            </a>
          </div>
        </div>
      </>
    );
  }
}

export default withStyles(styles)(CommaTwoUpsell);
