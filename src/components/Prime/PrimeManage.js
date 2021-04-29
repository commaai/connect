import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import moment from 'moment';

import { billing as BillingApi } from '@commaai/comma-api'
import PrimePayment from './PrimePayment';
import { deviceTypePretty } from '../../utils';

import ErrorIcon from '@material-ui/icons/ErrorOutline';
import { withStyles, Typography, Button, Modal, Paper } from '@material-ui/core';

import { selectDevice } from '../../timeline/actions';

const styles = (theme) => ({
  primeContainer: {
    padding: '16px 48px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#fff',
  },
  primeBlock: {
    marginTop: 10,
  },
  overviewBlock: {
    marginTop: 20,
  },
  overviewBlockError: {
    marginTop: 15,
    padding: 10,
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  overviewBlockSuccess: {
    marginTop: 15,
    padding: 10,
    backgroundColor: 'rgba(0, 255, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  manageItem: {
    marginLeft: 10,
  },
  paymentElement: {
    maxWidth: 400,
  },
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
    left: '50%',
    top: '40%',
    transform: 'translate(-50%, -50%)',
    '& p': {
      marginTop: 10,
    },
  },
  closeButton: {
    marginTop: 10,
    float: 'right'
  },
  cancelButton: {
    marginTop: 10,
  },
  cancelError: {
    backgroundColor: 'rgba(255, 0, 0, 0.3)',
    marginTop: 10,
    padding: 10,
    '& p': { margin: 0 },
  },
  cancelSuccess: {
    backgroundColor: 'rgba(0, 255, 0, 0.3)',
    marginTop: 10,
    padding: 10,
    '& p': { margin: 0 },
  },
});

class PrimeManage extends Component {
  constructor(props) {
    super(props);
    this.state ={
      savingPaymentMethod: false,
      savedPaymentMethod: false,
      error: null,
      paymentMethodChangedAndValid: false,
      cancelModal: false,
    };

    this.cancelPrime = this.cancelPrime.bind(this);
    this.modalClose = this.modalClose.bind(this);
  }

  cancelPrime() {
    BillingApi.cancelPrime(this.props.dongleId).then((resp) => {
      if (resp.success) {
        this.setState({ cancelSuccess: 'Cancelled subscription.' });
      } else if (resp.error) {
        this.setState({ cancelError: resp.description });
      } else {
        this.setState({ cancelError: 'Could not cancel due to unknown error. Please try again.'})
      }
    }).catch((err) => {
      this.setState({ cancelError: 'Could not cancel due to unknown error. Please try again.' });
    });
  }

  modalClose() {
    if (this.state.cancelSuccess) {
      this.props.dispatch(selectDevice(this.props.dongleId));
    } else {
      this.setState({ cancelModal: false });
    }
  }

  render() {
    const { dongleId, subscription, paymentMethod, classes, device } = this.props;
    if (!subscription) {
      return ( <></> );
    }
    let { error, savedPaymentMethod, savingPaymentMethod, paymentMethodChangedAndValid } = this.state;
    let joinDate = moment.unix(subscription.subscribed_at).format('MMMM Do, YYYY');
    let nextPaymentDate = moment.unix(subscription.next_charge_at).format('MMMM Do, YYYY');

    const alias = device.alias || deviceTypePretty(device.device_type);
    const simId = this.state.simInfo ? this.state.simInfo.sim_id : null;
    const pm = this.props.paymentMethod;

    return (
      <>
        <div>
          <div className={ classes.primeContainer }>
            <Typography variant="title">comma prime</Typography>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">device</Typography>
              <div className={ classes.manageItem }>
                <Typography variant="body2">{ alias }</Typography>
                <Typography variant="caption" className={classes.deviceId}>({ device.dongle_id })</Typography>
              </div>
            </div>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">joined</Typography>
              <Typography className={ classes.manageItem }>{ joinDate }</Typography>
            </div>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">payment method</Typography>
              <Typography className={ classes.manageItem }>
                { pm.brand } •••• •••• •••• { paymentMethod.last4 }
              </Typography>
            </div>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">next payment</Typography>
              <Typography className={ classes.manageItem }>{ nextPaymentDate }</Typography>
            </div>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">amount</Typography>
              <Typography className={ classes.manageItem }>$24.00</Typography>
            </div>
          </div>
          <div className={ classes.primeContainer }>
            <Typography variant="title">update payment method</Typography>
            { this.state.activated && <div className={ classes.overviewBlockSuccess }>
              <Typography>payment updated</Typography>
            </div> }
            { this.state.error && <div className={ classes.overviewBlockError }>
              <ErrorIcon />
              <Typography noWrap>{ this.state.error }</Typography>
            </div> }
            <div className={ classes.overviewBlock + " " + classes.paymentElement }>
              <PrimePayment disabled={ Boolean(this.state.activated) } simId={ simId } isUpdate={ true }
                onActivated={ (msg) => this.setState({ activated: msg, error: null }) }
                onError={ (err) => this.setState({error: err}) }
                onCancel={ () => this.setState({ cancelModal: true }) } />
            </div>
          </div>
        </div>
        <Modal open={ this.state.cancelModal } onClose={ this.modalClose }>
          <Paper className={classes.modal}>
            <Typography variant="title">Cancel prime subscription</Typography>
            { this.state.cancelError && <div className={ classes.cancelError }>
              <Typography>{ this.state.cancelError }</Typography>
            </div> }
            { this.state.cancelSuccess && <div className={ classes.cancelSuccess }>
              <Typography>{ this.state.cancelSuccess }</Typography>
            </div> }
            <Typography>Device: {alias} ({ dongleId })</Typography>
            <Typography>We're sorry to see you go.</Typography>
            <Typography>
              Cancelling will immediately suspend billing and comma prime membership benefits.
            </Typography>
            <Button variant="contained" className={ classes.cancelButton } onClick={ this.cancelPrime }
              disabled={ this.state.cancelSuccess }>
              Cancel subscription
            </Button>
            <Button variant="contained" className={ classes.closeButton }
              onClick={ this.modalClose }>
              Close
            </Button>
          </Paper>
        </Modal>
      </>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  device: 'workerState.device',
  subscription: 'workerState.subscription',
  paymentMethod: 'workerState.paymentMethod',
});

export default connect(stateToProps)(withStyles(styles)(PrimeManage));
