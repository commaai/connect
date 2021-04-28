import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { Button } from '@material-ui/core';
import stripe from '../../api/stripe'
import { Elements, CardElement, ElementsConsumer } from '@stripe/react-stripe-js';

import { billing as Billing } from '@commaai/comma-api';

class PrimePayment extends Component {
  constructor(props) {
    super(props);

    this.state ={
      card: null,
    };

    this.handleCardInput = this.handleCardInput.bind(this);
    this.submitPayment = this.submitPayment.bind(this);
  }

  static defaultProps = {
    onError: () => {},
  }

  handleCardInput(card) {
    this.setState({ card: card });
    if (card.error) {
      this.props.onError(card.error);
    }
  }

  submitPayment() {
    const { stripe, elements } = this.props;
    const cardElement = elements.getElement(CardElement);

    this.activate(cardElement).then((res) => {
      console.log(res);
    }).catch((err) => {
      console.log(err);
      this.props.onError(err.message);
    });
  }

  async activate(cardElement) {
    console.log('activating', this.props);
    const { stripe, dongleId, simId } = this.props;
    const token = await stripe.createToken(cardElement);
    if (token.error) {
      console.log(token.error);
      throw new Error("An error occured while creating payment token");
    }
    let payResp;
    try {
      payResp = await Billing.payForPrime(dongleId, simId, token.token.id);
    } catch(err) {
      console.log('server error', err);
      throw new Error('An error occurred');
    }
    if ('error' in payResp) {
      if (payResp['error'] === "Subscription already active") {
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
      await this.props.primeActivated(dongleId);
      return { payResp };
    } else {
      // wtf
      console.log('unknown error', payResp);
      throw new Error('An error occurred');
    }
  }

  render() {
    const canCheckout = this.state.card && this.state.card.complete && this.props.simId;
    return (
      <>
        <CardElement onChange={ this.handleCardInput } options={{
          style: {
            base: {
              color: '#fff',
            },
          },
        }} />
        <Button size="large" variant="outlined" disabled={ !canCheckout || this.props.disabled }
          style={{ marginTop: 20 }} onClick={ this.submitPayment }>
          Activate
        </Button>
      </>
    );
  }
}

const InjectedCheckoutForm = (props) => {
  return (
    <Elements stripe={ stripe }>
      <ElementsConsumer>
        {({elements, stripe}) => (
          <PrimePayment elements={ elements } stripe={ stripe } disabled={ props.disabled }
            onError={ props.onError } simId={ props.simId } dongleId={ props.dongleId } />
        )}
      </ElementsConsumer>
    </Elements>
  );
};

let stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
});

export default connect(stateToProps)(InjectedCheckoutForm);
