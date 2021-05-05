import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import moment from 'moment';

import { billing as Billing} from '@commaai/comma-api'
import PrimePayment from './PrimePayment';
import { deviceTypePretty } from '../../utils';
import Timelineworker from '../../timeline';

import ErrorIcon from '@material-ui/icons/ErrorOutline';
import { withStyles, Typography, Button, Modal, Paper } from '@material-ui/core';

import { primeFetchSubscription, selectDevice } from '../../actions';

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
  cancelModalButton: {
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
  paymentElement: {
    maxWidth: 450,
  },
  activateButton: {
    marginTop: 20,
    background: '#fff',
    borderRadius: 30,
    color: '#404B4F',
    textTransform: 'none',
    width: 200,
    '&:hover': {
      background: '#fff',
      color: '#404B4F',
    },
    '&:disabled': {
      background: '#bbb',
      color: '#404B4F',
    },
  },
  cancelButton: {
    marginTop: 20,
    width: 200,
    textTransform: 'none',
    borderRadius: 30,
    float: 'right',
  },
});

class PrimeManage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      cancelError: null,
      cancelModal: false,
      canceling: false,
    };

    this.cancelPrime = this.cancelPrime.bind(this);
    this.modalClose = this.modalClose.bind(this);
    this.onPaymentUpdated = this.onPaymentUpdated.bind(this);
  }

  cancelPrime() {
    this.setState({ canceling: true });
    Billing.cancelPrime(this.props.dongleId).then((resp) => {
      if (resp.success) {
        this.setState({ canceling: false, cancelError: null, cancelSuccess: 'Cancelled subscription.' });
      } else if (resp.error) {
        this.setState({ canceling: false, cancelError: resp.description });
      } else {
        this.setState({ canceling: false, cancelError: 'Could not cancel due to unknown error. Please try again.'})
      }
    }).catch((err) => {
      this.setState({ canceling: false, cancelError: 'Could not cancel due to unknown error. Please try again.' });
    });
  }

  modalClose() {
    if (this.state.cancelSuccess) {
      this.props.dispatch(primeFetchSubscription(this.props.dongleId));
      this.props.dispatch(selectDevice(this.props.dongleId));
    } else {
      this.setState({ cancelModal: false });
    }
  }

  onPaymentUpdated(paymentMethod) {
    Timelineworker.primeGetPaymentMethod(paymentMethod);
    this.setState({ activated: true, error: null });
  }

  render() {
    const { dongleId, subscription, classes, device } = this.props;
    if (!subscription) {
      return ( <></> );
    }

    let paymentMethod = this.props.paymentMethod;
    if (!paymentMethod) {
      paymentMethod = {
        brand: "",
        last4: "0000",
      };
    }

    let joinDate = moment.unix(subscription.subscribed_at).format('MMMM Do, YYYY');
    let nextPaymentDate = moment.unix(subscription.next_charge_at).format('MMMM Do, YYYY');

    const alias = device.alias || deviceTypePretty(device.device_type);
    const simId = this.state.simInfo ? this.state.simInfo.sim_id : null;

    return (
      <>
        <div>
          <div className={ classes.primeContainer }>
            <Typography variant="title">comma prime</Typography>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">Device</Typography>
              <div className={ classes.manageItem }>
                <Typography variant="body2">{ alias }</Typography>
                <Typography variant="caption" className={classes.deviceId}>({ device.dongle_id })</Typography>
              </div>
            </div>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">Joined</Typography>
              <Typography className={ classes.manageItem }>{ joinDate }</Typography>
            </div>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">Payment method</Typography>
              <Typography className={ classes.manageItem }>
                { paymentMethod.brand } •••• •••• •••• { paymentMethod.last4 }
              </Typography>
            </div>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">Next payment</Typography>
              <Typography className={ classes.manageItem }>{ nextPaymentDate }</Typography>
            </div>
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">Amount</Typography>
              <Typography className={ classes.manageItem }>$24.00</Typography>
            </div>
          </div>
          <div className={ classes.primeContainer }>
            <Typography variant="title">Update payment method</Typography>
            { this.state.activated && <div className={ classes.overviewBlockSuccess }>
              <Typography>Payment updated</Typography>
            </div> }
            { this.state.error && <div className={ classes.overviewBlockError }>
              <ErrorIcon />
              <Typography noWrap>{ this.state.error }</Typography>
            </div> }
            <div className={ classes.overviewBlock + " " + classes.paymentElement }>
              <PrimePayment disabled={ Boolean(this.state.activated) } simId={ simId } isUpdate={ true }
                onActivated={ this.onPaymentUpdated } activateButtonClass={ classes.activateButton }
                onError={ (err) => this.setState({error: err}) }
                onCancel={ () => this.setState({ cancelModal: true }) } cancelButtonClass={ classes.cancelButton } />
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
            <Button variant="contained" className={ classes.cancelModalButton } onClick={ this.cancelPrime }
              disabled={ Boolean(this.state.cancelSuccess) }>
              { this.state.canceling ? 'Canceling...' : 'Cancel subscription' }
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
