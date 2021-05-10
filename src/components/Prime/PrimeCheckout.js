import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import moment from 'moment';
import { deviceTypePretty } from '../../utils';
import { fetchSimInfo } from './util';
import PrimeChecklist from './PrimeChecklist';
import { billing as Billing } from '@commaai/comma-api';

import { withStyles, Typography } from '@material-ui/core';
import ErrorIcon from '@material-ui/icons/ErrorOutline';
import PrimePayment from './PrimePayment';

const styles = () => ({
  primeBox: {
    display: 'flex',
    overflowY: 'auto',
    height: 'calc(100vh - 64px)',
    flexDirection: 'column',
  },
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
  },
  paymentElement: {
    maxWidth: 400,
  },
  activateButton: {
    marginTop: 20,
    background: '#fff',
    borderRadius: 30,
    color: '#404B4F',
    textTransform: 'none',
    width: 200,
    '&:hover': {
      background: '#fff',
      color: '#404B4F',
    },
    '&:disabled': {
      background: '#bbb',
      color: '#404B4F',
    },
  }
});

class PrimeCheckout extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
      simInfo: null,
      simInfoLoading: false,
      activated: null,
      new_subscription: null,
    };

    this.onPrimeActivated = this.onPrimeActivated.bind(this);
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
    if (this.props.subscription) {
      return moment.unix(this.props.subscription.trial_end).format("MMMM Do")
    } else {
      return null;
    }
  }

  claimEndDate() {
    if (this.props.subscription && this.props.subscription.trial_claim_end) {
      return moment.unix(this.props.subscription.trial_claim_end).format("MMMM Do")
    } else {
      return null;
    }
  }

  onPrimeActivated(resp) {
    this.setState({ activated: resp, error: null });
    Billing.getSubscription(this.props.dongleId).then((subscription) => {
      this.setState({ new_subscription: subscription });
    });
  }

  render() {
    const { classes, device } = this.props;
    const { new_subscription } = this.state;

    const alias = device.alias || deviceTypePretty(device.device_type);

    let chargeText = ['You will be charged $24.00 today and monthly thereafter.'];
    if (this.isTrialClaimable()) {
      chargeText = [`Fill in your payment information to claim your trial.`,
        `You will be charged $24.00 on ${this.firstChargeDate()} and monthly thereafter.`];
      if (this.claimEndDate()) {
        chargeText.push(`Offer only valid until ${this.claimEndDate()}.`);
      }
    }

    let successMsg = ['comma prime activated'];
    if (this.state.activated) {
      if (this.state.activated.already_active) {
        successMsg = ['comma prime is already active for this device.\nYou have not been charged for another subscription.'];
      } else if (new_subscription && new_subscription.is_prime_sim) {
        successMsg.push('Connectivity will be enabled as soon as activation propagates to your local cell tower. Rebooting your device may help.');
      }
    }

    const simId = this.state.simInfo ? this.state.simInfo.sim_id : null;

    return (
      <div className={ classes.primeBox }>
        <div className={ classes.primeContainer }>
          <Typography variant="title">comma prime</Typography>
          <Typography className={ classes.introLine }>Become a comma prime member today for only $24/month</Typography>
          <PrimeChecklist />
        </div>
        <div className={ classes.primeContainer }>
          <Typography variant="title">checkout</Typography>
          { this.state.activated && <div className={ classes.overviewBlockSuccess }>
            { successMsg.map((msg, i) => {
              return <Typography variant="body1" key={ i }>{ msg }</Typography>
            }) }
          </div> }
          { this.state.error && <div className={ classes.overviewBlockError }>
            <ErrorIcon />
            <Typography noWrap>{ this.state.error }</Typography>
          </div> }
          { this.state.simInfoLoading && <div className={ classes.overviewBlockLoading }>
            <Typography noWrap>Fetching SIM data</Typography>
          </div> }
          <div className={ classes.overviewBlock }>
            <Typography variant="subheading">Device</Typography>
            <div className={ classes.deviceBlock }>
              <Typography variant="body2">{ alias }</Typography>
              <Typography variant="caption" className={classes.deviceId}>({ device.dongle_id })</Typography>
            </div>
          </div>
          <div className={ classes.overviewBlock }>
            { chargeText.map((txt, i) => {
              return <Typography key={i}>{ txt }</Typography>
            }) }
          </div>
          <div className={ classes.overviewBlock + " " + classes.paymentElement }>
            <PrimePayment disabled={ Boolean(this.state.activated) } simId={ simId }
              onActivated={ this.onPrimeActivated } activateButtonClass={ classes.activateButton }
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

export default connect(stateToProps)(withStyles(styles)(PrimeCheckout));

