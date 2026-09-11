import { useCallback, useEffect, useState } from 'react';

function getElectronApi() {
  if (typeof window === 'undefined') return null;
  return window.electronAPI || null;
}

async function exitDocumentFullscreen() {
  if (typeof document === 'undefined') return;
  if (!document.fullscreenElement || typeof document.exitFullscreen !== 'function') return;
  await document.exitFullscreen().catch(() => {});
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

  const setActive = useCallback(async (value) => {
    const api = getElectronApi();
    if (!enabled || !api?.setPipMode) return Promise.resolve({ active: false, supported: false });
    if (value) await exitDocumentFullscreen();
    return api.setPipMode(Boolean(value));
  }, [enabled]);

  const toggle = useCallback(async () => {
    const api = getElectronApi();
    if (!enabled || !api?.togglePipMode) return Promise.resolve({ active: false, supported: false });
    if (!active) await exitDocumentFullscreen();
    return api.togglePipMode();
  }, [active, enabled]);

  return { active, supported, setActive, toggle };
}
