import { useCallback, useEffect, useState } from 'react';

function getElectronApi() {
  if (typeof window === 'undefined') return null;
  return window.electronAPI || null;
}

export function useElectronPip(enabled = true) {
  const [active, setActiveState] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const api = getElectronApi();
    const isSupported = Boolean(enabled && api?.isElectron && api?.togglePipMode);
    setSupported(isSupported);

    if (!isSupported) {
      setActiveState(false);
      return undefined;
    }

    let disposed = false;
    api.getPipMode?.()
      .then((state) => {
        if (!disposed) setActiveState(Boolean(state?.active));
      })
      .catch(() => {});

    const unsubscribe = api.onPipModeChange?.((state) => {
      if (!disposed) setActiveState(Boolean(state?.active));
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [enabled]);

  const setActive = useCallback((value) => {
    const api = getElectronApi();
    if (!enabled || !api?.setPipMode) return Promise.resolve({ active: false, supported: false });
    return api.setPipMode(Boolean(value));
  }, [enabled]);

  const toggle = useCallback(() => {
    const api = getElectronApi();
    if (!enabled || !api?.togglePipMode) return Promise.resolve({ active: false, supported: false });
    return api.togglePipMode();
  }, [enabled]);

  return { active, supported, setActive, toggle };
}
