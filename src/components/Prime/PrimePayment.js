import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, Button, Typography, TextField } from '@material-ui/core';
import stripe from '../../api/stripe'
import { Elements, ElementsConsumer, CardNumberElement, CardExpiryElement, CardCvcElement } from '@stripe/react-stripe-js';

import { billing as Billing } from '@commaai/comma-api';
import Colors from '../../colors';
import ResizeHandler from '../ResizeHandler';

const styles = () => ({
  block: {
    marginBottom: 10,
  },
  stripeCardNumber: {
    '& > div': {
      padding: '10px 16px',
      border: `1px solid ${Colors.grey500}`,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
    }
  },
  stripeCardOther: {
    display: 'flex',
    '& > div': {
      flexGrow: 1,
      padding: '10px 16px',
      border: `1px solid ${Colors.grey500}`,
      borderTop: 'none',
      '&:first-child': {
        borderRight: 'none',
        borderBottomLeftRadius: 10,
      },
      '&:last-child': {
        borderBottomRightRadius: 10,
      },
    },
  },
  buttons: {
    marginTop: 10,
    background: '#fff',
    borderRadius: 18,
    color: '#404B4F',
    textTransform: 'none',
    width: 200,
    '&:hover': {
      backgroundColor: '#fff',
      color: '#404B4F',
    },
    '&:disabled': {
      backgroundColor: '#bbb',
      color: '#404B4F',
    },
    '&:disabled:hover': {
      backgroundColor: '#bbb',
      color: '#404B4F',
    }
  },
  cancelButton: {
    color: Colors.white,
    background: 'transparent',
    border: `1px solid ${Colors.grey500}`,
  },
  buttonsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  inputRoot: {
    border: `1px solid ${Colors.grey500}`,
    borderRadius: 10,
  },
  input: {
    padding: '10px 16px',
    '&::placeholder': { color: Colors.lightGrey500 },
  },
});

class PrimePayment extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      cardNumber: null,
      cardExpiry: null,
      cardCvc: null,
      zipCode: null,
      activating: false,
    };

    this.onResize = this.onResize.bind(this);
    this.handleCardInput = this.handleCardInput.bind(this);
    this.handleZipInput = this.handleZipInput.bind(this);
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

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  handleCardInput(card) {
    let state = {};
    state[card.elementType] = card;
    this.setState(state);

    if (card.error) {
      this.props.onError(card.error.message);
    } else {
      this.props.onError();
    }
  }

  handleZipInput(ev) {
    this.setState({ zipCode: ev.target.value });
  }

  submitPayment() {
    const { elements } = this.props;
    const cardNumberElement = elements.getElement(CardNumberElement);

    let activateFunc = this.props.isUpdate ? this.updatePayment : this.activate;

    this.setState({ activating: true });
    activateFunc(cardNumberElement).then((res) => {
      this.setState({ activating: false });
    }).catch((err) => {
      this.setState({ activating: false });
      this.props.onError(err.message);
    });
  }

  async tokenize(cardNumberElement) {
    const { stripe } = this.props;
    const resp = await stripe.createToken(cardNumberElement, {
      address_zip: this.state.zipCode,
    });
    if (resp.error) {
      throw new Error("An error occured while creating payment token");
    }
    return resp.token.id;
  }

  async activate(cardNumberElement) {
    const { dongleId, simId } = this.props;
    const token = await this.tokenize(cardNumberElement);
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
    const { classes, simId, isUpdate, disabled, onCancel } = this.props;
    const { activating, cardNumber, cardCvc, cardExpiry, zipCode, windowWidth } = this.state;

    const canCheckout = !activating && (simId || isUpdate) && cardNumber && cardNumber.complete &&
      cardCvc && cardCvc.complete && cardExpiry && cardExpiry.complete && zipCode && zipCode.length >= 3;

    let buttonText = isUpdate ? 'Update' : 'Activate now';
    if (activating) {
      buttonText = isUpdate ? 'Updating...' : 'Activating...';
    }

    const stripeStyle = {
      base: {
        fontSize: '16px',
        color: Colors.white,
        '::placeholder': { color: Colors.lightGrey500 },
      },
    };

    const buttonSmallStyle = windowWidth < 514 ? { width: '100%' } : {};

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <div className={ classes.block }>
          <Typography>Card information</Typography>
          <div className={ classes.stripeCardNumber }>
            <CardNumberElement onChange={ this.handleCardInput } options={{
              showIcon: true,
              style: stripeStyle,
            }} />
          </div>
          <div className={ classes.stripeCardOther }>
            <CardExpiryElement onChange={ this.handleCardInput } options={{ style: stripeStyle }} />
            <CardCvcElement onChange={ this.handleCardInput } options={{ style: stripeStyle }} />
          </div>
        </div>
        <div className={ classes.block }>
          <Typography>Zipcode</Typography>
          <TextField required style={{ maxWidth: '100%', width: 150 }} onChange={ this.handleZipInput }
            InputProps={{ classes: { root: classes.inputRoot, input: classes.input }}} placeholder="00000" />
        </div>
        <div className={ classes.buttonsContainer }>
          <Button disabled={ !canCheckout || disabled } className={ classes.buttons }
            onClick={ this.submitPayment } style={ buttonSmallStyle }>
            { buttonText }
          </Button>
          { onCancel &&
            <Button className={ `${classes.buttons} ${classes.cancelButton}` } onClick={ onCancel }
              style={ buttonSmallStyle }>
              Cancel subscription
            </Button> }
        </div>
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

export default connect(stateToProps)(withStyles(styles)(InjectedCheckoutForm));
