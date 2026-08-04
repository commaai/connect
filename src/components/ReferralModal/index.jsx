import React, { useMemo, useState } from 'react';
import { Button, IconButton, Modal, Paper, Typography, withStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import ContentCopyIcon from '@material-ui/icons/ContentCopy';
import ShareIcon from '@material-ui/icons/Share';

import Colors from '../../colors';

const styles = (theme) => ({
  paper: {
    position: 'absolute',
    width: 460,
    maxWidth: 'calc(100% - 32px)',
    maxHeight: 'calc(100% - 32px)',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    overflowY: 'auto',
    outline: 'none',
    borderRadius: 16,
    color: Colors.white,
    backgroundColor: Colors.grey900,
    border: `1px solid ${Colors.white12}`,
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.7)',
  },
  closeButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    color: Colors.white50,
  },
  hero: {
    padding: '36px 32px 28px',
    textAlign: 'center',
    background: `linear-gradient(180deg, ${Colors.primeBlue800}, ${Colors.grey900})`,
    borderBottom: `1px solid ${Colors.white08}`,
    [theme.breakpoints.down('xs')]: { padding: '34px 20px 24px' },
  },
  eyebrow: {
    color: Colors.lightBlue800,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 10,
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.15,
    letterSpacing: -0.5,
    [theme.breakpoints.down('xs')]: { fontSize: 26 },
  },
  subtitle: { marginTop: 10, color: Colors.white70, fontSize: 15 },
  value: { marginTop: 17, color: Colors.white50, fontSize: 12 },
  content: { padding: '24px 32px 28px', [theme.breakpoints.down('xs')]: { padding: '22px 20px 24px' } },
  steps: { marginBottom: 22 },
  step: { display: 'flex', alignItems: 'flex-start', marginBottom: 14, '&:last-child': { marginBottom: 0 } },
  stepNumber: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 26px',
    height: 26,
    marginRight: 12,
    borderRadius: 13,
    color: Colors.white,
    backgroundColor: Colors.primeBlue50,
    fontSize: 12,
    fontWeight: 700,
  },
  stepTitle: { fontSize: 14, fontWeight: 600, lineHeight: 1.2 },
  stepText: { marginTop: 3, color: Colors.white50, fontSize: 12, lineHeight: 1.4 },
  label: { marginBottom: 8, fontSize: 13, fontWeight: 600 },
  linkRow: { display: 'flex', gap: 8 },
  link: {
    flex: 1,
    minWidth: 0,
    padding: '11px 12px',
    borderRadius: 8,
    overflow: 'hidden',
    color: Colors.white60,
    backgroundColor: Colors.grey950,
    border: `1px solid ${Colors.white12}`,
    fontSize: 13,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  iconButton: { minWidth: 44, padding: 0, color: Colors.white, backgroundColor: Colors.grey600, '&:hover': { backgroundColor: Colors.grey400 } },
  shareButton: {
    width: '100%',
    marginTop: 10,
    padding: '10px 16px',
    borderRadius: 8,
    color: Colors.white,
    backgroundColor: Colors.primeBlue50,
    textTransform: 'none',
    fontWeight: 600,
    '&:hover': { backgroundColor: Colors.primeBlue200 },
  },
  buttonIcon: { marginRight: 8, fontSize: 18 },
  terms: { marginTop: 16, color: Colors.white30, fontSize: 10, lineHeight: 1.5 },
});

const ReferralModal = ({ classes, open, onClose, userId }) => {
  const [copied, setCopied] = useState(false);
  const referralLink = useMemo(() => `https://comma.ai/ref/${userId || 'YOUR-CODE'}`, [userId]);

  const copyLink = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(referralLink);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = referralLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Get 3 months of comma prime',
        text: 'Use my link and we’ll each get three months of comma prime—a $72 value—or $50.',
        url: referralLink,
      });
    } else {
      await copyLink();
    }
  };

  return (
    <Modal aria-labelledby="referral-modal-title" open={open} onClose={onClose}>
      <Paper className={classes.paper}>
        <IconButton aria-label="close referral program" className={classes.closeButton} onClick={onClose}>
          <CloseIcon />
        </IconButton>
        <div className={classes.hero}>
          <Typography className={classes.eyebrow}>comma referral</Typography>
          <Typography id="referral-modal-title" className={classes.title}>$72 for you.<br />$72 for a friend.</Typography>
          <Typography className={classes.subtitle}>You’ll each get 3 months of comma prime—or choose $50.</Typography>
          <Typography className={classes.value}>prime is a $72 value · $24/month × 3 months</Typography>
        </div>
        <div className={classes.content}>
          <div className={classes.steps}>
            <div className={classes.step}>
              <span className={classes.stepNumber}>1</span>
              <div><Typography className={classes.stepTitle}>Share your link</Typography><Typography className={classes.stepText}>Send it to a friend who’s new to comma.</Typography></div>
            </div>
            <div className={classes.step}>
              <span className={classes.stepNumber}>2</span>
              <div><Typography className={classes.stepTitle}>They get a comma</Typography><Typography className={classes.stepText}>Your friend purchases and pairs an eligible device.</Typography></div>
            </div>
            <div className={classes.step}>
              <span className={classes.stepNumber}>3</span>
              <div><Typography className={classes.stepTitle}>You both choose a reward</Typography><Typography className={classes.stepText}>Get three months of prime or choose $50 instead.</Typography></div>
            </div>
          </div>
          <Typography className={classes.label}>Your referral link</Typography>
          <div className={classes.linkRow}>
            <Typography className={classes.link}>{referralLink}</Typography>
            <Button aria-label="copy referral link" className={classes.iconButton} onClick={copyLink}>
              {copied ? <CheckIcon /> : <ContentCopyIcon />}
            </Button>
          </div>
          <Button className={classes.shareButton} onClick={shareLink}>
            <ShareIcon className={classes.buttonIcon} />
            {copied ? 'Link copied' : 'Share with a friend'}
          </Button>
          <Typography className={classes.terms}>Valid for eligible first-time customer purchases. Rewards activate after device pairing and are non-transferable. The prime reward has no cash value. Returns or cancellations void both rewards. Additional terms may apply.</Typography>
        </div>
      </Paper>
    </Modal>
  );
};

export default withStyles(styles)(ReferralModal);
