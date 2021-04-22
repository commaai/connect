import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import * as BillingApi from '../../api/billing';
import { fetchDevice } from '../../actions/async/Devices';
import PrimePayment from '../../components/PrimePayment';
import stripe, { tokenizeNativePay, tokenizeCard } from '../../api/stripe';
import { PortableSpinner } from '../../components';

class PrimeManage extends Component {
  constructor(props) {
    super(props);
    this.state ={
      paymentMethod: null,
      savingPaymentMethod: false,
      savedPaymentMethod: false,
      error: null,
      paymentMethodChangedAndValid: false,
    };
  }

  componentDidMount() {
    let { dongleId } = this.props.navigation.state.params;
    BillingApi.getPaymentMethod().then(paymentMethod => this.setState({paymentMethod}));
  }

  placeholderCard() {
    const { paymentMethod } = this.state;
    return {
      number: '0000 '.repeat(3) + paymentMethod.last4,
      expiry: paymentMethod.exp_month + '/' + paymentMethod.exp_year.toString().substring(2, 4),
      cvc: 'CVC'
    };
  }

  _handleSavePaymentMethod = async (card, useNativePay) => {
    Keyboard.dismiss();
    this.setState({ savingPaymentMethod: true, savedPaymentMethod: false });
    try {
      let stripeToken;
      if (useNativePay) {
        stripeToken = await tokenizeNativePay();
      } else {
        stripeToken = await tokenizeCard(card);
      }
      const paymentMethod = await BillingApi.updatePaymentMethod(stripeToken.tokenId);
      if (paymentMethod.error) {
        let err = new Error();
        if (typeof paymentMethod.error === 'string') {
          err.message = paymentMethod.error;
        } else {
          err.message = 'Server error. Please try again';
        }
        throw err;
      }
      stripe.completeNativePayRequest();
      this.setState({
        paymentMethod,
        savingPaymentMethod: false,
        savedPaymentMethod: true,
        paymentMethodChangedAndValid: false
      });
    } catch(err) {
      stripe.cancelNativePayRequest();
      console.log(err.stack);
      this.setState({ error: err.message, savingPaymentMethod: false });
    }
  }

  _handleChangePaymentMethod = (card, useNativePay) => {
    let nativePayChanged = useNativePay !== (this.state.paymentMethod.tokenization_method === 'apple_pay');
    let cardChanged = card && (this.placeholderCard().number !== card.values.number || this.placeholderCard().expiry != card.values.expiry || this.placeholderCard().cvc != card.values.cvc);
    let valid = ((card && card.valid) || useNativePay);

    this.setState({
      paymentMethodChangedAndValid: valid && (cardChanged || nativePayChanged),
      savedPaymentMethod: false,
      error: null,
    });
  }

  render() {
    let { navigate } = this.props.navigation;
    let { dongleId } = this.props.navigation.state.params;
    let subscription = this.props.subscriptions[dongleId];
    if (!subscription) { return null; }
    let { error, paymentMethod, savedPaymentMethod, savingPaymentMethod, paymentMethodChangedAndValid } = this.state;
    let goBackFn = this.props.navigation.goBack.bind(null, null);
    let joinDate = moment.unix(subscription.subscribed_at).format('MMMM Do, YYYY');
    let nextPaymentDate = moment.unix(subscription.next_charge_at).format('MMMM Do, YYYY');

    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "position" : null} style={ { flex: 1, position: 'relative', backgroundColor: 'black' } }>
        <Page
          headerIconLeftAsset={ Assets.iconChevronLeft }
          headerIconLeftAction={ goBackFn }
          headerStyle={ Styles.primeManagePageHeader }
          style={ Styles.primeManageContainer }>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{width: '100%', height: '100%' }}>
              <View style={ Styles.primeManageHeader }>
                <X.Text color='white' weight='bold' size='big' style={ Styles.primeManageTitle }>comma prime</X.Text>
              </View>
              <View style={ Styles.primeManageSub }>
                <View>
                  <View style={ Styles.primeManageSubInfo }>
                    <View>
                      <X.Text color='lightGrey' style={ Styles.primeManageSubInfoText }>Joined:</X.Text>
                      <X.Text color='white'  style={ Styles.primeManageSubInfoText }>{ joinDate }</X.Text>
                    </View>
                  </View>
                  <View style={ Styles.primeManageSubRow }>
                    <View style={ Styles.primeManageSubInfo }>
                      <View>
                        <X.Text color='lightGrey' style={ Styles.primeManageSubInfoText }>Next payment:</X.Text>
                        <X.Text color='white' style={ Styles.primeManageSubInfoText }>{ nextPaymentDate }</X.Text>
                      </View>
                    </View>
                    <View style={ Styles.primeManageSubInfo }>
                      <View>
                        <X.Text color='lightGrey' style={ Styles.primeManageSubInfoText }>Amount:</X.Text>
                        <X.Text color='white' style={ Styles.primeManageSubInfoText }>$24.00</X.Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
              { paymentMethod ?
                <View style={ Styles.primeManagePaymentContainer } >
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
                    <View style={ Styles.primeManagePaymentSuccessIcon}>
                      <X.Image source={ Assets.iconCheckmark } />
                    </View> }
                  { error &&
                    <View style={ Styles.primeManagePaymentError }>
                      <View style={ Styles.primeManagePaymentErrorIcon }>
                        <X.Image source={ Assets.iconError } />
                      </View>
                      <X.Text color='red'>{ error }</X.Text>
                    </View> }
                  <X.Button size='tiny' color='borderless' onPress={ () => navigate('PrimeCancel', { dongleId }) }>
                    <X.Text color='black' size='small' style={ { textAlign: 'center' } }>
                      Cancel subscription
                    </X.Text>
                  </X.Button>
                </View>
              :
                <View style={ Styles.primeManageSpinnerContainer }>
                  <PortableSpinner
                    spinnerMessage={ '' }
                    static={ false }
                    style={ Styles.spinner }
                    textStyle={ Styles.spinnerText }/>
                </View>
            }
            </View>
          </TouchableWithoutFeedback>
        </Page>
      </KeyboardAvoidingView>
    );
  }
}

let stateToProps = Obstruction({
  subscriptions: 'devices.subscriptions',
});
let dispatchToProps = function(dispatch) {
  return ({
    fetchDevice: function(dongleId) {
      dispatch(fetchDevice(dongleId))
    }
  });
}
export default connect(stateToProps, dispatchToProps)(withNavigation(PrimeManage));