import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

class PrimeActivationDone extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { navigate } = this.props.navigation;
    const { payResp, dongleId } = this.props.navigation.state.params;
    let subscription = this.props.subscriptions[dongleId];
    let successMsg = '';
    if (payResp.already_active) {
      successMsg = 'comma prime is already active for this device.\nYou have not been charged for another subscription.';
    } else if (subscription && subscription.is_prime_sim && subscription.trial_end == null) {
      successMsg = 'Connectivity will be enabled as soon as activation propagates to your local cell tower. Rebooting your device may help.';
    }
    return (
      <Page>
        <View style={{width: '100%', height: '100%'}}>
          <X.Text size='big' weight='semibold' color='white' style={ Styles.title }>
            comma prime activated
          </X.Text>
          <X.Text color='white' style={ Styles.activationSuccessText }>
            { successMsg }
          </X.Text>
          <X.Button color='borderless' style={ Styles.section } onPress={ () => navigate('AppDrawer') }>
              Continue
          </X.Button>
        </View>
      </Page>
    );
  }
}

const stateToProps = Obstruction({
  subscriptions: 'devices.subscriptions',
});
export default connect(stateToProps)(PrimeActivationDone);
