import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import moment from 'moment';

import { billing as BillingApi } from '@commaai/comma-api'
import PrimePayment from './PrimePayment';
import stripe from '../../api/stripe';

import { withStyles, Typography, Button } from '@material-ui/core';

const styles = () => ({
});

class PrimeManage extends Component {
  constructor(props) {
    super(props);
    this.state ={
      savingPaymentMethod: false,
      savedPaymentMethod: false,
      error: null,
      paymentMethodChangedAndValid: false,
    };

    this._handleSavePaymentMethod = this._handleSavePaymentMethod.bind(this);
    this._handleChangePaymentMethod = this._handleChangePaymentMethod.bind(this);
  }

  componentDidMount() {
    this.props.dispatch(primeFetchSubscription(this.props.dongleId));
    this.props.dispatch(primeFetchPaymentMethod());
  }

  placeholderCard() {
    const { paymentMethod } = this.props;
    return {
      number: '0000 '.repeat(3) + paymentMethod.last4,
      expiry: paymentMethod.exp_month + '/' + paymentMethod.exp_year.toString().substring(2, 4),
      cvc: 'CVC'
    };
  }

  _handleSavePaymentMethod = async (card, useNativePay) => {
    // Keyboard.dismiss();
    // this.setState({ savingPaymentMethod: true, savedPaymentMethod: false });
    // try {
    //   let stripeToken;
    //   if (useNativePay) {
    //     stripeToken = await tokenizeNativePay();
    //   } else {
    //     stripeToken = await tokenizeCard(card);
    //   }
    //   const paymentMethod = await BillingApi.updatePaymentMethod(stripeToken.tokenId);
    //   if (paymentMethod.error) {
    //     let err = new Error();
    //     if (typeof paymentMethod.error === 'string') {
    //       err.message = paymentMethod.error;
    //     } else {
    //       err.message = 'Server error. Please try again';
    //     }
    //     throw err;
    //   }
    //   stripe.completeNativePayRequest();
    //   this.setState({
    //     paymentMethod,
    //     savingPaymentMethod: false,
    //     savedPaymentMethod: true,
    //     paymentMethodChangedAndValid: false
    //   });
    // } catch(err) {
    //   stripe.cancelNativePayRequest();
    //   console.log(err.stack);
    //   this.setState({ error: err.message, savingPaymentMethod: false });
    // }
  }

  _handleChangePaymentMethod = (card, useNativePay) => {
    // let nativePayChanged = useNativePay !== (this.state.paymentMethod.tokenization_method === 'apple_pay');
    // let cardChanged = card && (this.placeholderCard().number !== card.values.number || this.placeholderCard().expiry != card.values.expiry || this.placeholderCard().cvc != card.values.cvc);
    // let valid = ((card && card.valid) || useNativePay);

    // this.setState({
    //   paymentMethodChangedAndValid: valid && (cardChanged || nativePayChanged),
    //   savedPaymentMethod: false,
    //   error: null,
    // });
  }

  render() {
    const { dongleId, subscription, paymentMethod } = this.props;
    if (!subscription) {
      return ( <></> );
    }
    let { error, savedPaymentMethod, savingPaymentMethod, paymentMethodChangedAndValid } = this.state;
    let joinDate = moment.unix(subscription.subscribed_at).format('MMMM Do, YYYY');
    let nextPaymentDate = moment.unix(subscription.next_charge_at).format('MMMM Do, YYYY');

    return (
      <div>
        <div>
          <Typography>comma prime</Typography>
        </div>
        <div>
          <div>
            <div>
              <div>
                <Typography>Joined:</Typography>
                <Typography>{ joinDate }</Typography>
              </div>
            </div>
            <div>
              <div>
                <div>
                  <Typography>Next payment:</Typography>
                  <Typography>{ nextPaymentDate }</Typography>
                </div>
              </div>
              <div>
                <div>
                  <Typography>Amount:</Typography>
                  <Typography>$24.00</Typography>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div>
          <PrimePayment
            placeholderCard={ this.placeholderCard() }
            useNativePay={ paymentMethod.tokenization_method == 'apple_pay' }
            submitText={ savingPaymentMethod ? 'Updating...' : 'Update payment method' }
            submitDisabled={ !(paymentMethodChangedAndValid || savingPaymentMethod) }
            chooseDisabled={ savingPaymentMethod }
            onChange={ this._handleChangePaymentMethod }
            onSubmit={ this._handleSavePaymentMethod }
          />
          { savedPaymentMethod &&
            <div>
              <img source={ Assets.iconCheckmark } />
            </div> }
          { error &&
            <div>
              <div>
                <img source={ Assets.iconError } />
              </div>
              <Typography>{ error }</Typography>
            </div> }
          <Button onClick={ () => navigate('PrimeCancel', { dongleId }) }>
            <Typography>Cancel subscription</Typography>
          </Button>
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

export default connect(stateToProps)(withStyles(styles)(PrimeManage));
