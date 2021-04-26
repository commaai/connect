import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, Button } from '@material-ui/core';
import stripe from '../../api/stripe'
import { Elements, CardElement } from '@stripe/react-stripe-js';

const styles = () => ({
});

class PrimePayment extends Component {
  // static defaultProps = {
  //   submitText: 'Save payment method',
  //   chooseDisabled: false,
  //   onChange: () => {},
  //   onSubmit: () => {},
  // };

  constructor(props) {
    super(props);

    this.state ={
      card: null,
    };
  }

  _handleCardInput = (card) => {
    this.props.onChange(card, false);
    this.setState({ card });
  }

  render() {
    const { card } = this.state;

    return (
      <Elements stripe={stripe}>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
              },
            },
            onChange: this._handleCardInput
          }}
          />
        <Button
          onClick={ () => this.props.onSubmit(card, useNativePay) }
          disabled={ this.props.submitDisabled !== undefined ? this.props.submitDisabled : !((card && card.valid) || useNativePay) }>
          { this.props.submitText }
        </Button>
      </Elements>
    );
  }
}

let stateToProps = Obstruction({
  paymentMethod: 'prime.paymentMethod',
});

export default connect(stateToProps)(withStyles(styles)(PrimePayment));
