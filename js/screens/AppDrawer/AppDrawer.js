// App Drawer Screen
// ~~~~~~~~~~~~~~~~~

import React, { Component } from 'react';
import DeviceInfo from 'react-native-device-info';
import { NavigationActions } from 'react-navigation';
import { Linking, ScrollView, View } from 'react-native';
import { connect } from 'react-redux';
import { DrawerActions } from 'react-navigation-drawer';
import { signOut } from '../../actions/async/Auth';
import { Assets } from '../../constants';
import X from '../../theme';
import Styles from './AppDrawerStyles';

class AppDrawer extends Component {

  constructor(props) {
    super(props);
    this.state = {
      version: DeviceInfo.getReadableVersion()
    }
  }

  navigateToScreen = (routeName) => () => {
    const { navigation } = this.props;
    const navigateAction = NavigationActions.navigate({routeName});
    navigation.dispatch(navigateAction);
    navigation.dispatch(DrawerActions.closeDrawer())
  }

  render () {
    const { auth } = this.props;
    return (
      <View style={ Styles.appDrawer }>
        <View style={ Styles.appDrawerHeader }>
          { auth.user ? (
            <View>
              <View style={ Styles.appDrawerHeaderPhoto }>
                <X.Image source={ auth.user.photo ? { uri: auth.user.photo } : Assets.iconUser } />
              </View>
              <X.Text
                color='white'
                size='small'
                weight='semibold'
                style={ Styles.appDrawerHeaderName }>
                { (auth.user.email && !auth.user.email.includes('privaterelay.appleid.com')) ?
                  auth.user.email :
                  '' }
              </X.Text>
              { auth.user.full_name &&
                <X.Text
                  color='lightGrey'
                  size='small'
                  style={ Styles.appDrawerHeaderAlias }>
                  { auth.user.full_name }
                </X.Text>
              }
            </View>
          ) : null }
        </View>
        <View style={ Styles.appDrawerNavigation }>
          <X.Button
            color='borderless'
            size='full'
            style={ Styles.appDrawerButton }
            onPress={ () => Linking.openURL('https://my.comma.ai/') }>
            <X.Image
              source={ Assets.iconComma }
              style={ Styles.appDrawerButtonImage } />
            <X.Text
              color='white'
              size='small'
              weight='semibold'>
              Open explorer
            </X.Text>
          </X.Button>

          <X.Button
            color='borderless'
            size='full'
            style={ Styles.appDrawerButton }
            onPress={ this.navigateToScreen('SetupPairing') }>
            <X.Image
              source={ Assets.iconPlusCircle }
              style={ Styles.appDrawerButtonImage } />
            <X.Text
              color='white'
              size='small'
              weight='semibold'>
              Add a new device
            </X.Text>
          </X.Button>
        </View>
        <View style={ Styles.appDrawerFooter }>
          <X.Button
            color='borderless'
            size='full'
            onPress={ this.props.logout }
            style={ [Styles.appDrawerButton, Styles.appDrawerFooterButton] }>
            Log out
          </X.Button>
          <View style={ Styles.appDrawerFooterContext }>
            <X.Text
              color='lightGrey'
              size='small'>
              { this.state.version }
            </X.Text>
          </View>
        </View>
      </View>
    )
  }
}

function mapStateToProps(state) {
  const { auth } = state;
  return {
    auth,
  };
}

function mapDispatchToProps(dispatch) {
  return ({
    logout: () => {
      dispatch(signOut());
    },
  })
}

export default connect(mapStateToProps, mapDispatchToProps)(AppDrawer);
