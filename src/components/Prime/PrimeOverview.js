import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import moment from 'moment';
import { deviceTypePretty } from '../../utils';
import { fetchSimInfo } from './util';
import PrimeChecklist from './PrimeChecklist';

import { withStyles, Typography } from '@material-ui/core';
import ErrorIcon from '@material-ui/icons/ErrorOutline';
import InfoIcon from '@material-ui/icons/InfoOutline';
import PrimePayment from './PrimePayment';

const styles = () => ({
  primeContainer: {
    padding: '16px 48px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#fff',
  },
  primeBlock: {
    marginTop: 10,
  },
  moreInfoContainer: {
    '& p': { display: 'inline' },
    '& button': { display: 'inline', marginLeft: '15px' },
  },
  introLine: {
    lineHeight: '36px',
  },
  checkList: {
    marginLeft: 10,
    marginBottom: 10,
  },
  checkListItem: {
    padding: '5px 0',
    '& svg': { margin: 0 },
  },
  deviceId: {
    color: '#525E66',
    fontFamily: 'MaisonNeueMono',
  },
  leftMargin: {
    marginLeft: 10,
  },
  deviceBlock: {
    marginLeft: 10,
    '& aside': { display: 'inline', marginRight: 5, },
    '& span': { display: 'inline', },
  },
  overviewBlock: {
    marginTop: 20,
  },
  overviewBlockError: {
    marginTop: 15,
    padding: 10,
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  overviewBlockLoading: {
    marginTop: 15,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  overviewBlockSuccess: {
    marginTop: 15,
    padding: 10,
    backgroundColor: 'rgba(0, 255, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  paymentElement: {
    maxWidth: 400,
  },
});

class PrimeOverview extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
      simInfo: null,
      simInfoLoading: false,
      activated: null,
    };
  }

  componentDidMount() {
    this.setState({ simInfoLoading: true });
    fetchSimInfo(this.props.dongleId).then((result) => {
      this.setState({ simInfo: result.simInfo, simInfoLoading: false });
    }).catch((err) => {
      this.setState({ error: err.message, simInfoLoading: false });
    });
  }

  isTrialClaimable() {
    return this.props.subscription && this.props.subscription.trial_claimable;
  }

  firstChargeDate() {
    if (this.subscription()) {
      return moment.unix(this.subscription().trial_end).format("MMMM Do")
    } else {
      return null;
    }
  }

  claimEndDate() {
    if (this.subscription() && this.subscription().trial_claim_end) {
      return moment.unix(this.subscription().trial_claim_end).format("MMMM Do")
    } else {
      return null;
    }
  }

  render() {
    const { classes, device } = this.props;

    const alias = device.alias || deviceTypePretty(device.device_type);

    let chargeText = 'You will be charged $24.00 today and monthly thereafter.';
    if (this.isTrialClaimable()) {
      chargeText = `Continue to checkout to claim your trial.
      You will be charged $24.00 on ${this.firstChargeDate()} and monthly thereafter.`;
      if (this.claimEndDate()) {
        chargeText += `\nOffer only valid until ${this.claimEndDate()}.`;
      }
    }

    let successMsg = '';
    if (this.state.activated) {
      if (this.state.activated.already_active) {
        successMsg = 'comma prime is already active for this device.\nYou have not been charged for another subscription.';
      } else {
        successMsg = 'comma prime activated';
      }
    }

    const simId = this.state.simInfo ? this.state.simInfo.sim_id : null;

    return (
      <div>
        <div className={ classes.primeContainer }>
          <Typography variant="title">comma prime</Typography>
          <Typography className={ classes.introLine }>Become a comma prime member today for only $24/month</Typography>
          <PrimeChecklist />
        </div>
        <div className={ classes.primeContainer }>
          <Typography variant="title">checkout</Typography>
          { this.state.activated && <div className={ classes.overviewBlockSuccess }>
            <Typography>{ successMsg }</Typography>
            <Typography>
              Connectivity will be enabled as soon as activation propagates to your local cell tower.
              Rebooting your device may help.
            </Typography>
          </div> }
          { this.state.error && <div className={ classes.overviewBlockError }>
            <ErrorIcon />
            <Typography noWrap>{ this.state.error }</Typography>
          </div> }
          { this.state.simInfoLoading && <div className={ classes.overviewBlockLoading }>
            <InfoIcon />
            <Typography noWrap>Fetching SIM data</Typography>
          </div> }
          <div className={ classes.overviewBlock }>
            <Typography variant="subheading">device</Typography>
            <div className={ classes.deviceBlock }>
              <Typography variant="body2">{ alias }</Typography>
              <Typography variant="caption" className={classes.deviceId}>({ device.dongle_id })</Typography>
            </div>
          </div>
          <div className={ classes.overviewBlock }>
            <Typography>{ chargeText }</Typography>
          </div>
          <div className={ classes.overviewBlock + " " + classes.paymentElement }>
            <PrimePayment disabled={ Boolean(this.state.activated) } simId={ simId }
              onActivated={ (msg) => this.setState({ activated: msg, error: null }) }
              onError={ (err) => this.setState({ error: err }) } />
          </div>
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  device: 'workerState.device',
  subscription: 'workerState.subscription',
});

export default connect(stateToProps)(withStyles(styles)(PrimeOverview));
