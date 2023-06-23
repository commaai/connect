import React, { Component } from 'react';

import { Typography, withStyles } from '@material-ui/core';

import ResizeHandler from '../ResizeHandler';
import AddDevice from '../Dashboard/AddDevice';

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
      maxWidth: '100%',
    },
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
  addDeviceContainer: {
    marginTop: 10,
    width: '80%',
    maxWidth: 250,
    margin: '0 auto',
  },
});

class NoDeviceUpsell extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
    };

    this.onResize = this.onResize.bind(this);
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes } = this.props;
    const { windowWidth } = this.state;

    const containerPadding = windowWidth > 520 ? 36 : 16;

    return (
      <>
        <ResizeHandler onResize={this.onResize} />
        <div className={ classes.pairInstructions } style={{ padding: `8px ${containerPadding}px` }}>
          <Typography>Pair your device</Typography>
          <Typography>
            Pair your comma device by scanning the QR code on the device
          </Typography>
          <div className={ classes.addDeviceContainer }>
            <AddDevice buttonText="add new device" />
          </div>
        </div>
        <div className={classes.imageContainer}>
          <picture>
            <source type="image/webp" srcSet="/images/c3-nav.webp" />
            <source type="image/png" srcSet="/images/c3-nav.png" />
            <img alt="comma three" />
          </picture>
        </div>
      </>
    );
  }
}

export default withStyles(styles)(NoDeviceUpsell);
