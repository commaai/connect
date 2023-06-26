import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { Link } from 'react-router-dom';

import Drawer from '@material-ui/core/Drawer';

import DeviceList from '../Dashboard/DeviceList';

import { selectDevice } from '../../actions';

class AppDrawer extends Component {
  constructor(props) {
    super(props);

    this.handleDeviceSelected = this.handleDeviceSelected.bind(this);
    this.toggleDrawerOff = this.toggleDrawerOff.bind(this);
  }

  handleDeviceSelected(dongleId) {
    this.props.dispatch(selectDevice(dongleId));
    this.toggleDrawerOff();
  }

  toggleDrawerOff() {
    this.props.handleDrawerStateChanged(false);
  }

  render() {
    const { classes, isPermanent, drawerIsOpen, selectedDongleId } = this.props;

    return (
      <Drawer
        open={ isPermanent || drawerIsOpen }
        onClose={this.toggleDrawerOff}
        variant={ isPermanent ? 'permanent' : 'temporary' }
        PaperProps={{ style: { width: this.props.width, top: 'auto' } }}
      >
        <div className="h-full w-full flex flex-col bg-[linear-gradient(180deg,_#1B2023_0%,_#111516_100%)]">
          { !isPermanent
            && (
              <Link to="/" className="items-center flex min-h-[64px] no-underline">
                <img alt="comma" src="/images/comma-white.png" className="h-[34px] mx-7" />
                <p className="text-xl font-extrabold">connect</p>
              </Link>
            )}
          { isPermanent && <div style={{ height: 24 }} /> }
          <DeviceList
            selectedDevice={ selectedDongleId }
            handleDeviceSelected={this.handleDeviceSelected}
            headerHeight={ 64 + (isPermanent ? 24 + 16 : 0) }
          />
        </div>
      </Drawer>
    );
  }
}

const stateToProps = Obstruction({
  selectedDongleId: 'dongleId',
  device: 'device',
});

export default connect(stateToProps)(AppDrawer);
