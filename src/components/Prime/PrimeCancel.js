import React, { Component } from 'react';
import { View } from 'react-native';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import X from '../../theme';

import * as BillingApi from '../../api/billing';
import { fetchDeviceSubscription } from '../../actions/async/Devices';
import { Assets } from '../../constants';
import Page from '../../components/Page';

class PrimeCancel extends Component {
  constructor(props) {
    super(props);

    this.cancelPrime = this.cancelPrime.bind(this);
    this.state = {
      error: null,
      success: false,
      isLoading: false,
    };
  }

  cancelPrime() {
    this.setState({ isLoading: true });
    let { dongleId } = this.props.navigation.state.params;
    BillingApi.cancelPrime(dongleId).then((resp) => {
      if (resp.success) {
        console.log(this.props.fetchDeviceSubscription(dongleId));
        this.props.fetchDeviceSubscription(dongleId).then(() => this.props.navigation.pop(2));
      } else if (resp.error) {
        this.setState({ error: resp.description });
      } else {
        this.setState({error: 'Could not cancel due to unknown error. Please try again.'})
      }
      this.setState({ isLoading: false });
    }).catch((err) => {
      console.log(err.message);
      this.setState({ error: 'Could not cancel due to unknown error. Please try again.' });
      this.setState({ isLoading: false });
    });
  }

  render() {
    let { dongleId } = this.props.navigation.state.params;
    let { goBack, navigate } = this.props.navigation;

    let goBackFn = goBack.bind(null, null);
    return (
      <Page
        headerIconLeftAsset={ Assets.iconChevronLeft }
        headerIconLeftAction={ goBackFn }>
        <X.Text color='white' weight='semibold'>Cancel comma prime</X.Text>
        <X.Text color='white'>Device: { dongleId }</X.Text>
        <X.Text color='white'>We're sorry to see you go.</X.Text>
        <X.Text color='white' style={ Styles.cancelExplainerText }>Cancelling will immediately suspend billing and comma prime membership benefits.</X.Text>
        { !this.state.success &&
          <X.Button
            onPress={ this.cancelPrime }
            isDisabled={ this.state.isLoading }
            style={ Styles.cancelButton }>Cancel</X.Button>
        }
        { this.state.success &&
          <View>
            <X.Text color='white' weight='semibold'>Cancelled subscription.</X.Text>
            <X.Button isDisabled={ this.state.isLoading } onPress={ () => this.props.navigation.pop(2) } style={ Styles.cancelButton }>Continue</X.Button>
          </View>
        }
        { this.state.error && <X.Text color='white' style={ Styles.cancelExplainerText }>{ this.state.error }</X.Text> }
      </Page>
    );
  }
}

let stateToProps = Obstruction({});
let dispatchToProps = function(dispatch) {
  return ({
    fetchDeviceSubscription: async function(dongleId) {
      await dispatch(fetchDeviceSubscription(dongleId));
    }
  });
}
export default connect(stateToProps, dispatchToProps)(PrimeCancel);
