import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Slide from '@material-ui/core/Slide';
import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';

import Timelineworker from '../../timeline';

const styles = theme => {
  return {
    root: {
      margin: theme.spacing.unit * 2
    },
    floatingBox: {
      padding: theme.spacing.unit * 2,
      borderRadius: theme.spacing.unit
    },
    expansion: {
      backgroundColor: theme.palette.grey[800]
    },
    expanded: {
      minHeight: 'initial',
      margin: '0px 0',
      backgroundColor: theme.palette.grey[999]
    },
  };
};

class Dashboard extends Component {
  constructor (props) {
    super(props);

    this.renderDevice = this.renderDevice.bind(this);
    this.handleChange = this.handleChange.bind(this);
  }

  handleChange (dongleId) {
    Timelineworker.selectDevice(dongleId);
  }

  render() {
    var devices = this.props.devices;
    var dongleId = this.props.selectedDevice;
    var found = !dongleId;

    devices.forEach(function (device) {
      if (device.dongle_id === dongleId) {
        found = true;
      }
    });

    if (!found) {
      devices.push({
        dongle_id: dongleId,
        shared: true
      });
    }

    return (
      <div className={ this.props.classes.root }>
        <Grid container spacing={ 24 } >
          <Grid item xs={ 6 } >
            <Paper className={ this.props.classes.floatingBox }>
              <Typography variant='headline'>
                Your Devices
              </Typography>
              { this.props.devices.map(this.renderDevice) }
            </Paper>
          </Grid>
          <Grid item xs={ 6 } >
            <Paper className={ this.props.classes.floatingBox }>
              metadata and stuff...
            </Paper>
          </Grid>
        </Grid>
      </div>
    );
  }

  renderDevice (device) {
    return (
      <ExpansionPanel
        classes={{
          expanded: this.props.classes.expanded
        }}
        key={ device.dongle_id }
        expanded={ this.props.selectedDevice === device.dongle_id }
        onChange={ partial(this.handleChange, device.dongle_id) }
        className={ this.props.classes.expansion }
        >
        <ExpansionPanelSummary>
          <Typography>{ device.alias || device.dongle_id }</Typography>
        </ExpansionPanelSummary>
      </ExpansionPanel>
    );
  }
}

const stateToProps = Obstruction({
  devices: 'workerState.devices',
  selectedDevice: 'workerState.dongleId'
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));
