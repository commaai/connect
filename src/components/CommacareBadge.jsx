import React from 'react';
import { withStyles } from '@material-ui/core';

import Colors from '../colors';
import CommacareIcon from '../icons/commacare.png';

const COMMACARE_URL = 'https://comma.ai/connect#what-is-commacare';

const styles = () => ({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 14px 6px 12px',
    borderRadius: 12,
    border: `1px solid ${Colors.green300}`,
    color: Colors.green300,
    fontWeight: 600,
    letterSpacing: '0.04em',
    lineHeight: 1,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    '&:hover': {
      backgroundColor: 'rgba(81, 191, 135, 0.1)',
    },
  },
  pillIcon: {
    width: 24,
    marginRight: 12,
  },
});

const CommacareBadge = ({ classes, size = 22, style, variant = 'icon' }) => {
  if (variant === 'pill') {
    return (
      <a
        className={classes.pill}
        style={style}
        href={COMMACARE_URL}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={CommacareIcon} alt="" className={classes.pillIcon} />
        commacare
      </a>
    );
  }
  return (
    <img src={CommacareIcon} alt="commacare" style={{ width: size, verticalAlign: 'middle', ...style }} />
  );
};

export default withStyles(styles)(CommacareBadge);
