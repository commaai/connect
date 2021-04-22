import React, { Component } from 'react';
import {CardElement} from '@stripe/react-stripe-js';

class PrimePayment extends Component {
  static defaultProps = {
    submitText: 'Save payment method',
    chooseDisabled: false,
    onChange: () => {},
    onSubmit: () => {},
  };

  constructor(props) {
    super(props);

    console.log(props);
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
      <div>
        <CardElement onChange={ this._handleCardInput } />
        <Button
          style={ Styles.primePaymentInfoDetailsSubmit }
          textColor='white'
          onPress={ () => this.props.onSubmit(card, useNativePay) }
          isDisabled={ this.props.submitDisabled !== undefined ? this.props.submitDisabled : !((card && card.valid) || useNativePay) }>
          { this.props.submitText }
        </Button>
      </div>
    );
  }
}

export default PrimePayment;