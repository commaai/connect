/**
 * comma SetupEonPairing Screen
 */

import React, { Component } from 'react';
import qs from 'query-string';
import { View, Vibration, Linking, Platform } from 'react-native';
import { connect } from 'react-redux';
import { withNavigation } from 'react-navigation';
import Permissions, { PERMISSIONS, RESULTS } from 'react-native-permissions';
import { RNCamera } from 'react-native-camera';
import { Assets } from '../../constants';
import X from '../../theme';
import Styles from './SetupStyles';
import { Page, Alert, Spinner } from '../../components';
import { pilotPair, fetchDevices, fetchDevice } from '../../actions/async/Devices';

const PERMISSION_CAMERA = Platform.select({
  android: PERMISSIONS.ANDROID.CAMERA,
  ios: PERMISSIONS.IOS.CAMERA,
});

class SetupEonPairing extends Component {

  constructor(props) {
    super(props);
    this.state = {
      wantsCameraPermissions: false,
      hasCameraPermissions: false,
      deniedCameraPermission: false,
      attemptingPair: false,
    };
    this.handleConfirmPressed = this.handleConfirmPressed.bind(this);
    this.handleDismissPressed = this.handleDismissPressed.bind(this);
    this.handleScannedQRCode = this.handleScannedQRCode.bind(this);
  }

  componentDidMount() {
    Permissions.check(PERMISSION_CAMERA).then(response => {
      switch (response) {
        case RESULTS.DENIED:
          break;
        case RESULTS.UNAVAILABLE:
        case RESULTS.BLOCKED:
          this.setState({ deniedCameraPermission: true })
          break;
        case RESULTS.LIMITED:
        case RESULTS.GRANTED:
          this.setState({ hasCameraPermissions: true })
          break;
      }
    })
  }

  handleConfirmPressed() {
    this.setState({ wantsCameraPermissions: true });
  };

  handleDismissPressed() {
    this.props.navigation.navigate('AppDrawer');
  }

  handleViewSetupGuidePressed = () => {
    Linking.openURL('https://comma.ai/setup');
  }

  handleScannedQRCode(e) {
    let code = null;
    if (e.data) {
      code = e.data;
    } else if (e.barcodes && e.barcodes.length && e.barcodes[0].data) {
      code = e.barcodes[0].data;
    } else {
      return;
    }
    Vibration.vibrate();

    this.setState({
      attemptingPair: true,
    });

    let pairToken;
    try {
      if (code.startsWith('https://')) {
        pairToken = qs.parse(code.split('?')[1]).pair;
      } else {
        let qrDataSplit = code.split('--');
        pairToken = qrDataSplit.slice(2).join('--');
      }
    } catch (err) {
      this.setState({ pairError: `Could not parse QR: ${err.message}` });
      return;
    }

    if (pairToken) {
      this.props.pilotPair(pairToken, this.props.navigation)
        .catch(err => this.setState({ attemptingPair: false, pairError: `Unable to pair: ${err.message}` }));
    } else {
      this.setState({ attemptingPair: false, pairError: 'Invalid QR code detected' });
    }
  }

  render() {
    const { navigate } = this.props.navigation;
    const { wantsCameraPermissions, hasCameraPermissions, deniedCameraPermission, attemptingPair,
      pairError } = this.state;

    if (attemptingPair) {
      return (
        <View style={ Styles.setupEonPairingContainer }>
          <Spinner spinnerMessage='Pairing Device...' />
        </View>
      )
    } else if (pairError) {
      return (
        <Page headerIconLeftAsset={ Assets.iconChevronLeft } headerIconLeftAction={ () => navigate('AppDrawer') }>
          <View style={ Styles.setupEonPairingContainer }>
            <X.Entrance style={ { height: '100%' } }>
              <Alert title='Error' message={ pairError } confirmButtonAction={ () => this.setState({ pairError: null }) }
                confirmButtonTitle='Try again' />
            </X.Entrance>
          </View>
        </Page>
      );
    } else if (deniedCameraPermission) {
      return (
        <Page
          headerIconLeftAsset={ Assets.iconChevronLeft }
          headerIconLeftAction={ () => navigate('AppDrawer') }>
          <View style={ Styles.setupEonPairingContainer }>
            <X.Entrance style={ { height: '100%' } }>
              <Alert
                title='Camera Access'
                message='Camera access is denied, go to settings to give access'
                confirmButtonAction={ this.handleDismissPressed }
                confirmButtonTitle='Ok' />
            </X.Entrance>
          </View>
        </Page>
      );
    } else if (wantsCameraPermissions || hasCameraPermissions) {
      return (
        <Page
          headerIconLeftAsset={ Assets.iconChevronLeft }
          headerIconLeftAction={ () => navigate('AppDrawer') }>
          <View style={ Styles.setupEonPairingContainer }>
            <X.Entrance style={ Styles.setupEonPairingCamera }>
              <RNCamera
                ref={ ref => this.cameraRef = ref }
                style={ { flex: 1, width: '119%', marginLeft: '-9.5%' } }
                onBarCodeRead={ (!attemptingPair && Platform.OS !== 'android') ? this.handleScannedQRCode : null }
                barCodeTypes={[ RNCamera.Constants.BarCodeType.qr ]}
                onGoogleVisionBarcodesDetected={
                  (!attemptingPair && Platform.OS === 'android') ? this.handleScannedQRCode : null }
                googleVisionBarcodeType={ RNCamera.Constants.GoogleVisionBarcodeDetection.BarcodeType.QR_CODE }
                captureAudio={ false } />
            </X.Entrance>
            <View style={ Styles.setupEonPairingInstruction }>
              <X.Text
                color='white'
                size='big'
                weight='semibold'>
                Pair Your Device
              </X.Text>
              <X.Text
                color='lightGrey'
                style={ Styles.setupEonPairingInstructionText }>
                Place the QR code from your device during setup within the frame.
              </X.Text>
              <X.Button
                size='tiny'
                color='borderless'
                onPress={ this.handleViewSetupGuidePressed }>
                View Setup Guide
              </X.Button>
            </View>
          </View>
        </Page>
      );
    } else {
      return (
        <Page
          headerIconLeftAsset={ Assets.iconChevronLeft }
          headerIconLeftAction={ () => navigate('AppDrawer') }>
          <View style={ Styles.setupEonPairingContainer }>
            <X.Entrance style={ { height: '100%' } }>
              <Alert
                title='Camera Access'
                message='We need camera access so you can finish setting up your device'
                dismissButtonAction={ this.handleDismissPressed }
                confirmButtonAction={ this.handleConfirmPressed }
                dismissButtonTitle='Not now'
                confirmButtonTitle='Yes!' />
            </X.Entrance>
          </View>
        </Page>
      )
    }
  }

}

function mapStateToProps(state) {
  const { devices } = state;
  return {
    devices,
  };
}

function mapDispatchToProps(dispatch) {
  return ({
    pilotPair: function(pairToken, navigation) {
      return dispatch(pilotPair(pairToken)).then((dongleId) => {
        dispatch(fetchDevices());
        return Promise.all([
          dispatch(fetchDevice(dongleId)),
        ]);
      }).then(([device]) => {
        navigation.navigate('AppDrawer');
      })
    }
  })
}

export default connect(mapStateToProps, mapDispatchToProps)(withNavigation(SetupEonPairing));
