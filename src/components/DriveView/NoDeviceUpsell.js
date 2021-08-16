import React, { Component } from 'react';

import { withStyles, Button, Typography } from '@material-ui/core';

import ResizeHandler from '../ResizeHandler';

const styles = () => ({
  content: {
    alignSelf: 'center',
    textAlign: 'center',
    minWidth: 120,
    '& p': {
      fontSize: '1rem',
      fontWeight: 600,
    },
  },
  imageContainer: {
    alignSelf: 'center',
    '& img': {
      width: 800,
      maxWidth: '100%'
    },
  },
  shopLink: {
    display: 'inline-block',
    marginTop: 8,
    marginLeft: 16,
    textDecoration: 'none',
  },
  pairInstructions: {
    alignSelf: 'center',
    maxWidth: 600,
    minHeight: 150,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    textAlign: 'center',
    '& p': {
      fontSize: '1rem',
      '&:first-child': { fontWeight: 600 },
    },
  },
});

class NoDeviceUpsell extends Component {
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
          <Typography>
            Pair your device by scanning the QR code on the device with any QR code scanner on your phone
          </Typography>
        </div>
        <div className={classes.content} style={{ padding: `8px ${containerPadding}px` }}>
          <Typography>
            Get started with comma three
            <a href="https://comma.ai/shop/products/three/?ref=explorer" target="_blank" className={classes.shopLink}>
              <Button variant="outlined">Shop</Button>
            </a>
          </Typography>
        </div>
        <div className={classes.imageContainer}>
          <img src="https://comma.ai/c3-nav.png" />
        </div>
      </>
    );
  }
}

export default withStyles(styles)(NoDeviceUpsell);
