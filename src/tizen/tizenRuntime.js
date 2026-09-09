export function isSamsungTizen() {
  return Boolean(
    typeof window !== 'undefined'
    && window.webapis?.avplay
    && window.tizen,
  );
}

export function getAvplay() {
  if (!isSamsungTizen()) return null;
  return window.webapis.avplay;
}

export function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

export function exitTizenApp() {
  try {
    window.tizen?.application?.getCurrentApplication()?.exit();
  } catch (error) {
    console.warn('No se pudo cerrar la app Tizen:', error);
  }
}
