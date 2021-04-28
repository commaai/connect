import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import moment from 'moment';
import { billing as Billing } from '@commaai/comma-api'
import PrimePayment from './PrimePayment';
import stripe from '../../api/stripe';
import { primeFetchSubscription } from '../../actions';

import { withStyles, Typography, Button } from '@material-ui/core';

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
});

class PrimeActivationPayment extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
      card: {
        // values: {
        //   number: 4242424242424242,
        //   cvc: 111,
        //   expiry: '02/25',
        // },
        // valid: true,
      },
    };

    this.activate = this.activate.bind(this);
  }

  componentDidMount() {
    this.props.dispatch(primeFetchSubscription(this.props.dongleId));
  }

  _handlePaymentSubmit = (card) => {
    const { dongleId, simInfo } = this.props.navigation.state.params;
    this.props.navigation.navigate('PrimeActivationSpinner',
      {
        message: 'Activating...',
        nextScreen: 'PrimeActivationDone',
        unskippable: true,
        loadFn: () => this.activate(dongleId, simInfo, card),
        dongleId,
      }
    );
  }

  async activate(dongleId, simInfo, card) {
    try {
      let stripeToken;
      // stripeToken = await tokenizeCard(card);
      let payResp;
      try {
        payResp = await Billing.payForPrime(dongleId, simInfo.sim_id, stripeToken.tokenId);
      } catch(err) {
        console.log('server error', err);
        throw new Error('An error occurred');
      }
      if ('error' in payResp) {
        if (payResp['error'] === "Subscription already active") {
          stripe.cancelNativePayRequest();
          this.props.primeActivated(dongleId);
          return {payResp: {success: 1, already_active: true}};
        } else if (payResp['error'] === 'Payment failed') {
          throw new Error('Card declined');
        } else if (payResp['error'] === 'Invalid SIM') {
          throw new Error('Invalid SIM. Make sure you have an unactivated comma SIM inserted');
        } else {
          console.log('unknown error', payResp);
          throw new Error(payResp.error);
        }
      } else if (payResp['success']) {
        stripe.completeNativePayRequest();
        await this.props.primeActivated(dongleId);
        return { payResp };
      } else {
        console.log('unknown error', payResp);
        throw new Error('An error occurred');
      }
    } catch(err) {
      console.log(err.message);
      this.props.navigation.navigate('PrimeActivationPayment', { dongleId, simInfo, error: err.message });
      throw err;
    }
  }

  isTrialClaimable() {
    return this.props.subscription && this.subscription().trial_claimable;
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
    const { classes, subscription } = this.props;
    const { error, card } = this.state;

    let chargeText = 'Your card will be charged $24.00 today and monthly thereafter.';
    if (this.isTrialClaimable()) {
      chargeText = `Add a card to claim your trial.
      Your card will be charged $24.00 on ${this.firstChargeDate()} and monthly thereafter.`;
      if (this.claimEndDate()) {
        chargeText += `\nOffer only valid until ${this.claimEndDate()}.`;
      }
    }

    return (
      <div className={ classes.primeContainer }>
        <Typography variant="title">Activate comma prime</Typography>
        { error ?
          <div className={ classes.primeBlock }>
            <Typography>{ error }</Typography>
            <Typography>You have not been charged.</Typography>
          </div>
          :
          <div className={ classes.primeBlock }>
            <Typography>{ chargeText }</Typography>
          </div>
        }
        <div className={ classes.primeBlock }>
          <PrimePayment
            submitText='Activate'
            onSubmit={ this._handlePaymentSubmit }
          />
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  subscription: 'prime.subscription',
});

export default connect(stateToProps)(withStyles(styles)(PrimeActivationPayment));

