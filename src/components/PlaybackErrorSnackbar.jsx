import { Alert, Snackbar } from '@mui/material';
import { useEffect, useState } from 'react';
import { getSafePlaybackErrorMessage } from '../utils/errorMessages.js';

export default function PlaybackErrorSnackbar({
  error,
  retryAttempt = 0,
  maxRetries = 5,
  locale = 'en',
}) {
  const isRetrying = retryAttempt > 0;
  const [open, setOpen] = useState(Boolean(error) || isRetrying);
  const message = getSafePlaybackErrorMessage(error, locale);
  const isSpanish = String(locale).toLowerCase().startsWith('es');
  const displayMessage = isRetrying
    ? (isSpanish
      ? `Error de reproducción. Reintento ${retryAttempt} de ${maxRetries}...`
      : `Playback error. Retry ${retryAttempt} of ${maxRetries}...`)
    : message;

  useEffect(() => {
    if (error || retryAttempt > 0) setOpen(true);
    else setOpen(false);
  }, [error, retryAttempt]);

  if (!error && !isRetrying) return null;

  return (
    <Snackbar
      open={open}
      autoHideDuration={isRetrying ? null : 7000}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        position: 'absolute',
        left: '50%',
        right: 'auto',
        bottom: { xs: 24, md: 40 },
        transform: 'translateX(-50%)',
        width: 'min(92%, 560px)',
        zIndex: 20,
      }}
    >
      <Alert
        severity="error"
        variant="filled"
        onClose={() => setOpen(false)}
        sx={{
          width: '100%',
          justifyContent: 'center',
          textAlign: 'center',
          fontWeight: 700,
        }}
      >
        {displayMessage}
      </Alert>
    </Snackbar>
  );
}
