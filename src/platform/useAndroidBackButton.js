import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { isCapacitorAndroid } from './runtime.js';

export function useAndroidBackButton(handler) {
  useEffect(() => {
    if (!isCapacitorAndroid()) return undefined;

    let disposed = false;
    let listener = null;

    CapacitorApp.addListener('backButton', handler).then((handle) => {
      if (disposed) handle.remove();
      else listener = handle;
    });

    return () => {
      disposed = true;
      listener?.remove?.();
    };
  }, [handler]);
}
