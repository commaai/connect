import { Button, CircularProgress, Typography } from '@material-ui/core';

export default function VideoStatus({ loading, error, blocked, onRetry, onPlay }) {
  if (!loading && !error && !blocked) return null;
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 p-3">
      {loading && !error && !blocked && <CircularProgress size={24} />}
      {(error || blocked) && (
        <>
          <Typography>{error || 'Tap Play to start video.'}</Typography>
          <Button variant="outlined" onClick={error ? onRetry : onPlay}>
            {error ? 'Retry' : 'Play video'}
          </Button>
        </>
      )}
    </div>
  );
}
