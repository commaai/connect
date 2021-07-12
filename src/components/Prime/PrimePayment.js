import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { Button } from '@material-ui/core';
import stripe from '../../api/stripe'
import { Elements, CardElement, ElementsConsumer } from '@stripe/react-stripe-js';

import { billing as Billing } from '@commaai/comma-api';
import Colors from '../../colors';

class PrimePayment extends Component {
  constructor(props) {
    super(props);

    this.state = {
      card: null,
      activating: false,
    };

    this.handleCardInput = this.handleCardInput.bind(this);
    this.submitPayment = this.submitPayment.bind(this);
    this.tokenize = this.tokenize.bind(this);
    this.activate = this.activate.bind(this);
    this.updatePayment = this.updatePayment.bind(this);
  }

  static defaultProps = {
    buttonText: 'Activate',
    onError: () => {},
    onActivated: (_) => {},
  }

  handleCardInput(card) {
    this.setState({ card: card });
    if (card.error) {
      this.props.onError(card.error.message);
    } else {
      this.props.onError();
    }
  }

  submitPayment() {
    const { elements } = this.props;
    const cardElement = elements.getElement(CardElement);

    let activateFunc = this.props.isUpdate ? this.updatePayment : this.activate;

    this.setState({ activating: true });
    activateFunc(cardElement).then((res) => {
      this.setState({ activating: false });
    }).catch((err) => {
      this.setState({ activating: false });
      this.props.onError(err.message);
    });
  }

  async tokenize(cardElement) {
    const { stripe } = this.props;
    const resp = await stripe.createToken(cardElement);
    if (resp.error) {
      throw new Error("An error occured while creating payment token");
    }
    return resp.token.id;
  }

  async activate(cardElement) {
    const { dongleId, simId } = this.props;
    const token = await this.tokenize(cardElement);
    let payResp;
    try {
      payResp = await Billing.payForPrime(dongleId, simId, token);
    } catch(err) {
      console.log('server error', err);
      throw new Error('An error occurred');
    }
    if ('error' in payResp) {
      if (payResp['error'] === "Subscription already active") {
        this.props.onActivated(payResp);
        return;
      } else if (payResp['error'] === 'Payment failed') {
        throw new Error('Card declined');
      } else if (payResp['error'] === 'Invalid SIM') {
        throw new Error('Invalid SIM. Make sure you have an unactivated comma SIM inserted');
      } else {
        console.log('unknown error', payResp);
        throw new Error(payResp.error);
      }
    } else if (payResp['success']) {
      this.props.onActivated(payResp);
      return;
    } else {
      // wtf
      console.log('unknown error', payResp);
      throw new Error('An error occurred');
    }
  }

  async updatePayment(cardElement) {
    const token = await this.tokenize(cardElement);
    let payResp;
    try {
      payResp = await Billing.updatePaymentMethod(token);
    } catch(err) {
      console.log('server error', err);
      throw new Error('An error occurred');
    }
    if (payResp.error) {
      let err = new Error();
      if (typeof payResp.error === 'string') {
        err.message = payResp.error;
      } else {
        err.message = 'Server error. Please try again';
      }
      throw err;
    }
    this.props.onActivated(payResp);
  }

  render() {
    const canCheckout = this.state.card && this.state.card.complete && !this.state.activating &&
      (this.props.simId || this.props.isUpdate);

    let buttonText = this.props.isUpdate ? 'Update' : 'Activate now';
    if (this.state.activating) {
      buttonText = this.props.isUpdate ? 'Updating...' : 'Activating...';
    }

    return (
      <>
        <CardElement onChange={ this.handleCardInput } options={{
          style: {
            base: {
              fontSize: '16px',
              color: Colors.white,
              '::placeholder': {
                color: Colors.lightGrey500,
              },
            },
          },
        }} />
        <Button size="large" disabled={ !canCheckout || this.props.disabled }
          className={ this.props.activateButtonClass } onClick={ this.submitPayment }>
          { buttonText }
        </Button>
        { this.props.onCancel && <Button className={ this.props.cancelButtonClass }
          onClick={ this.props.onCancel } size="large" variant="outlined">
          Cancel subscription
        </Button> }
      </>
    );
  }
}

const InjectedCheckoutForm = (props) => {
  return (
    <Elements stripe={ stripe }>
      <ElementsConsumer>
        {({elements, stripe}) => (
          <PrimePayment elements={ elements } stripe={ stripe } {...props} />
        )}
      </ElementsConsumer>
    </Elements>
  );
};

let stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
});

export default connect(stateToProps)(InjectedCheckoutForm);
