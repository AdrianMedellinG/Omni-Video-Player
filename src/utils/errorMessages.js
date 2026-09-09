export const MAX_PLAYBACK_RETRIES = 5;

export function normalizeRetryCount(value, fallback = MAX_PLAYBACK_RETRIES) {
  const candidate = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : MAX_PLAYBACK_RETRIES;
  if (!Number.isFinite(candidate)) return Math.min(MAX_PLAYBACK_RETRIES, Math.max(0, Math.floor(safeFallback)));
  return Math.min(MAX_PLAYBACK_RETRIES, Math.max(0, Math.floor(candidate)));
}

export function normalizeRetryDelay(value, fallback = 3000) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(0, candidate);
}

function getRawErrorText(payload) {
  const error = payload?.error || payload;
  if (!error) return '';
  return String(error.message || error.details || error.reason || error);
}

export function getSafePlaybackErrorMessage(payload, locale = 'en') {
  const error = payload?.error || payload;
  const rawText = getRawErrorText(payload);
  const status = Number(
    error?.status
      || error?.statusCode
      || error?.response?.status
      || error?.response?.code
      || error?.networkDetails?.response?.status
      || error?.networkDetails?.response?.code
      || payload?.status
      || payload?.statusCode,
  );
  const notFound = status === 404 || /\b404\b|not found|no encontrado|not available/i.test(rawText);
  const isSpanish = String(locale).toLowerCase().startsWith('es');

  if (notFound) return isSpanish ? 'No se encontró el recurso.' : 'The resource could not be found.';
  return isSpanish ? 'No es posible reproducir este contenido.' : 'This content cannot be played.';
}
