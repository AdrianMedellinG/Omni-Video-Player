import { Capacitor } from '@capacitor/core';

export function getNativePlatform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

export function isCapacitorAndroid() {
  return getNativePlatform() === 'android';
}

export function isWebOS() {
  return Boolean(
    typeof window !== 'undefined'
    && (import.meta.env.MODE === 'webos' || window.PalmSystem || window.webOS?.platform?.tv || window.webOS?.tv),
  );
}

export function exitWebOSApp() {
  try {
    if (typeof window.webOS?.platformBack === 'function') {
      window.webOS.platformBack();
      return;
    }
    window.close();
  } catch {
    window.history.back();
  }
}
