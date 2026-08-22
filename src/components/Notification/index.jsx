import { Button, Typography, withStyles } from '@material-ui/core';
import { Clear } from '@material-ui/icons';

import Colors from '../../colors';

const styles = () => ({
  card: {
    position: 'relative',
    boxSizing: 'border-box',
    width: 360,
    padding: '12px 16px',
    borderRadius: 22,
    border: `1px solid ${Colors.grey700}`,
    backgroundColor: Colors.grey500,
    color: Colors.white,
    '@media (max-width: 599px)': {
      width: '100%',
    },
  },
  header: {
    display: 'flex',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  title: {
    lineHeight: '31px',
    fontSize: 20,
    fontWeight: 600,
  },
  subtitle: {
    color: Colors.white90,
  },
  button: {
    marginLeft: 8,
    padding: '6px 24px',
    minWidth: 90,
    minHeight: 'unset',
    borderRadius: 15,
    color: Colors.white,
    backgroundColor: Colors.primeBlue50,
    textTransform: 'none',
    '&:hover': {
      color: Colors.white,
      backgroundColor: Colors.primeBlue200,
    },
  },
  dismiss: {
    position: 'absolute',
    left: -6,
    top: -8,
    width: 24,
    height: 24,
    padding: 5,
    border: `1px solid ${Colors.grey600}`,
    borderRadius: 12,
    backgroundColor: Colors.grey900,
    color: Colors.white,
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: Colors.grey700,
    },
  },
});

const Notification = ({
  buttonClassName = '', buttonText, classes, dismissLabel, heading, onButtonClick, onDismiss, subtitle,
}) => (
  <div className={classes.card}>
    <Clear aria-label={dismissLabel} className={classes.dismiss} onClick={onDismiss} />
    <div className={classes.header}>
      <Typography className={classes.title}>{heading}</Typography>
      <Button onClick={onButtonClick} className={`${classes.button} ${buttonClassName}`}>
        {buttonText}
      </Button>
    </div>
    <Typography className={classes.subtitle}>{subtitle}</Typography>
  </div>
);

export default withStyles(styles)(Notification);
