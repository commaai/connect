import React, { Component } from 'react';
import { withStyles, Typography } from '@material-ui/core';

const styles = (theme) => ({
  divider: {
    display: 'flex',
    flexDirecton: 'row',
    padding: '8px',
    alignItems: 'center',
    textAlign: 'center',
  },
  line: {
    flexGrow: 1,
    height: '1px',
    background: '#fff',
  },
  heading: {
    fontWeight: 500,
    padding: '0 10px',
  },
});

class DriveListDivider extends Component {
  render() {
    const { classes, date } = this.props;

    return (
      <div className={ classes.divider }>
        <div className={ classes.line } />
        <Typography className={ classes.heading }>
          { date }
        </Typography>
        <div className={ classes.line } />
      </div>
    );
  }
}

export default withStyles(styles)(DriveListDivider);
