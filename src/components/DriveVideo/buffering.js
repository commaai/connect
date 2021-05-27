import React from 'react';
import CircularProgress from '@material-ui/core/CircularProgress';
import Typography from '@material-ui/core/Typography';

export default function Buffering(props) {
  const parts = [];
  if (props.isBufferingVideo) {
    parts.push('video');
  }
  if (props.isBufferingData) {
    parts.push('data');
  }
  const message = `Buffering ${parts.join(' and ')}`;
  return (
    <div
      style={{
        zIndex: 50,
        position: 'absolute',
        height: '100%',
        width: '100%',
        backgroundColor: '#16181Aaa',
      }}
    >
      <div style={{
        position: 'relative',
        textAlign: 'center',
        top: 'calc(50% - 25px)'
      }}
      >
        <CircularProgress
          color="secondary"
          thickness={6}
          size={50}
        />
      </div>
      <div style={{
        position: 'relative',
        textAlign: 'center',
        top: '50%',
      }}
      >
        <Typography>
          { message }
        </Typography>
      </div>
    </div>
  );
}
