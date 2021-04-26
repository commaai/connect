import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import moment from 'moment';
import { billing as BillingApi } from '@commaai/comma-api'
import PrimePayment from './PrimePayment';
import stripe, { tokenizeNativePay, tokenizeCard } from '../../api/stripe';

import { withStyles, Typography, Button } from '@material-ui/core';

const styles = () => ({

});

class PrimeActivationPayment extends Component {
  constructor(props) {
    super(props);

    this.state = {
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


  _handlePaymentSubmit = (card, useNativePay) => {
    const { dongleId, simInfo } = this.props.navigation.state.params;
    this.props.navigation.navigate('PrimeActivationSpinner',
      {
        message: 'Activating...',
        nextScreen: 'PrimeActivationDone',
        unskippable: true,
        loadFn: () => this.activate(dongleId, simInfo, card, useNativePay),
        dongleId,
      }
    );
  }

  async activate(dongleId, simInfo, card, useNativePay) {
    try {
      let stripeToken;
      if (useNativePay) {
        console.log('using native pay');
        if (this.isTrialClaimable()) {
          let firstCharge = this.firstChargeDate();
          console.log({firstCharge});
          stripeToken = await tokenizeNativePay({ label: `comma prime trial ${firstCharge}` });
        } else {
          stripeToken = await tokenizeNativePay();
        }
      } else {
        stripeToken = await tokenizeCard(card);
      }
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
      stripe.cancelNativePayRequest();
      console.log(err.message);
      this.props.navigation.navigate('PrimeActivationPayment', { dongleId, simInfo, error: err.message });
      throw err;
    }
  }

  subscription() {
    const { dongleId } = this.props.navigation.state.params;
    return this.props.subscriptions[dongleId];
  }

  isTrialClaimable() {
    return this.subscription() && this.subscription().trial_claimable;
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
    const { error } = this.props.navigation.state.params;
    const { card, deviceSupportsNativePay, canUseNativePay, useNativePay } = this.state;

    let chargeText = 'Your card will be charged $24.00 today and monthly thereafter.';
    if (this.isTrialClaimable()) {
      chargeText = `Add a card to claim your trial.
      Your card will be charged $24.00 on ${this.firstChargeDate()} and monthly thereafter.`;
      if (this.claimEndDate()) {
        chargeText += `\nOffer only valid until ${this.claimEndDate()}.`;
      }
    }

    return (
      <div style={{width: '100%', height: '100%'}}>
        <Typography>Activate comma prime</Typography>
        { error ?
          <div style={ [Styles.section, Styles.paymentError] }>
            <Typography color='white' size='small' style={ Styles.paymentErrorText }>{ error }</Typography>
            <Typography>You have not been charged.</Typography>
          </div>
          :
          <div style={ Styles.section }>
            <Typography color='white' size='small' style={ Styles.chargeText }>{ chargeText }</Typography>
          </div>
        }
        <div style={ [Styles.section, Styles.fullWidthSection, Styles.paymentSection ] }>
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
  dongleId: 'workerState.dongleId',
  subscription: 'prime.subscription',
  paymentMethod: 'prime.paymentMethod',
});

export default connect(stateToProps)(withStyles(styles)(PrimeActivationPayment));

