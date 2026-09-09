import { useEffect, useRef } from 'react';
import { exitTizenApp, isSamsungTizen } from './tizenRuntime.js';
import { isCapacitorAndroid, isWebOS } from '../platform/runtime.js';

const MEDIA_KEYS = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaRewind',
  'MediaFastForward',
  'MediaTrackPrevious',
  'MediaTrackNext',
  'ChannelUp',
  'ChannelDown',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'PictureSize',
];

const KEY_CODE_NAMES = {
  13: 'Enter',
  37: 'ArrowLeft',
  38: 'ArrowUp',
  39: 'ArrowRight',
  40: 'ArrowDown',
  10009: 'Back',
  19: 'MediaPause',
  412: 'MediaRewind',
  413: 'MediaStop',
  415: 'MediaPlay',
  417: 'MediaFastForward',
  406: 'ColorF3Blue',
  404: 'ColorF1Green',
  405: 'ColorF2Yellow',
  10140: 'PictureSize',
  10232: 'MediaTrackPrevious',
  10233: 'MediaTrackNext',
  10252: 'MediaPlayPause',
  427: 'ChannelUp',
  428: 'ChannelDown',
  461: 'Back',
  179: 'MediaPlayPause',
};

const NORMALIZED_NAMES = {
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Return: 'Enter',
  OK: 'Enter',
  Exit: 'Back',
  XF86Back: 'Back',
  XF86Exit: 'Back',
  XF86PlayBack: 'MediaPlayPause',
  XF86AudioPlay: 'MediaPlay',
  XF86AudioPause: 'MediaPause',
  XF86AudioStop: 'MediaStop',
  XF86AudioRewind: 'MediaRewind',
  XF86AudioForward: 'MediaFastForward',
  XF86AudioNext: 'MediaFastForward',
  XF86PreviousChapter: 'MediaTrackPrevious',
  XF86NextChapter: 'MediaTrackNext',
  BrowserBack: 'Back',
  Backspace: 'Back',
};

function normalizeKeyName(event, keyMap) {
  const mapped = keyMap[event.keyCode] || KEY_CODE_NAMES[event.keyCode] || event.key || event.code;
  return NORMALIZED_NAMES[mapped] || mapped || KEY_CODE_NAMES[event.keyCode];
}

function isNativelyFocusable(element) {
  const tag = element.tagName?.toLowerCase();
  return tag === 'button'
    || tag === 'input'
    || tag === 'select'
    || tag === 'textarea'
    || element.hasAttribute('href')
    || element.tabIndex >= 0;
}

function focusables() {
  const selector = [
    '[data-tv-focusable="true"]',
    'button:not([disabled])',
    'select:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    '[role="button"]',
    '[role="combobox"]',
    '[role="slider"]',
  ].join(',');

  return [...document.querySelectorAll(selector)]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const disabled = element.disabled
        || element.getAttribute('aria-disabled') === 'true'
        || element.closest('[aria-disabled="true"], .Mui-disabled');

      if (!disabled && !isNativelyFocusable(element)) {
        element.tabIndex = 0;
      }

      return !disabled
        && rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none';
    });
}

function clearRemoteFocus() {
  document.querySelectorAll('.tv-remote-focused').forEach((element) => {
    element.classList.remove('tv-remote-focused');
  });
}

function markRemoteFocus(element) {
  if (!element) return;
  clearRemoteFocus();
  element.classList.add('tv-remote-focused');
  element.closest?.('.MuiInputBase-root, .MuiButtonBase-root, .MuiSlider-root')
    ?.classList.add('tv-remote-focused');
}

function focusElement(element) {
  if (!element) return;
  element.focus();
  markRemoteFocus(element);
}

function handleRemoteKey(name, event, handlers) {
  if (name === 'ArrowLeft') {
    event.preventDefault();
    moveFocus('left');
    return true;
  }
  if (name === 'ArrowRight') {
    event.preventDefault();
    moveFocus('right');
    return true;
  }
  if (name === 'ArrowUp') {
    if (handleChannelKey('up', event, handlers)) return true;
    event.preventDefault();
    moveFocus('up');
    return true;
  }
  if (name === 'ArrowDown') {
    if (handleChannelKey('down', event, handlers)) return true;
    event.preventDefault();
    moveFocus('down');
    return true;
  }
  if (name === 'Enter') {
    if (handlers.onEnter?.() === false) {
      event.preventDefault();
      return true;
    }

    const active = document.activeElement;
    if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') {
      event.preventDefault();
      if (active.form?.requestSubmit) active.form.requestSubmit();
      else active.form?.submit?.();
    } else if (active?.click) {
      event.preventDefault();
      active.click();
    }
    return true;
  }
  if (name === 'Back') {
    event.preventDefault();
    if (handlers.onBack) handlers.onBack();
    else if (isSamsungTizen()) exitTizenApp();
    else window.history.back();
    return true;
  }

  if (name === 'MediaPlayPause') {
    event.preventDefault();
    handlers.onPlayPause?.();
  } else if (name === 'MediaPlay') {
    event.preventDefault();
    handlers.onPlay?.();
  } else if (name === 'MediaPause') {
    event.preventDefault();
    handlers.onPause?.();
  } else if (name === 'MediaStop') {
    event.preventDefault();
    handlers.onStop?.();
  } else if (name === 'MediaRewind') {
    event.preventDefault();
    handlers.onRewind?.();
  } else if (name === 'MediaFastForward') {
    event.preventDefault();
    handlers.onFastForward?.();
  } else if (name === 'MediaTrackPrevious') {
    event.preventDefault();
    (handlers.onTrackPrevious || handlers.onRewind)?.();
  } else if (name === 'MediaTrackNext') {
    event.preventDefault();
    (handlers.onTrackNext || handlers.onFastForward)?.();
  } else if (name === 'ChannelUp') {
    handleChannelKey('up', event, handlers);
  } else if (name === 'ChannelDown') {
    handleChannelKey('down', event, handlers);
  } else if (name === 'ColorF1Green') {
    event.preventDefault();
    handlers.onAudioNext?.();
  } else if (name === 'ColorF2Yellow') {
    event.preventDefault();
    handlers.onSubtitleNext?.();
  } else if (name === 'ColorF3Blue' || name === 'PictureSize') {
    event.preventDefault();
    handlers.onFullscreen?.();
  } else {
    return false;
  }

  return true;
}

function moveFocus(direction) {
  const items = focusables();
  if (!items.length) return;

  const current = document.activeElement;
  const currentRect = current?.getBoundingClientRect?.();

  if (!currentRect || !items.includes(current)) {
    focusElement(items[0]);
    return;
  }

  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;

  const candidates = items
    .filter((item) => item !== current)
    .map((item) => {
      const rect = item.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;

      const valid = direction === 'left' ? dx < -4
        : direction === 'right' ? dx > 4
          : direction === 'up' ? dy < -4
            : dy > 4;

      if (!valid) return null;

      const primary = direction === 'left' || direction === 'right'
        ? Math.abs(dx)
        : Math.abs(dy);
      const secondary = direction === 'left' || direction === 'right'
        ? Math.abs(dy)
        : Math.abs(dx);

      return { item, score: primary + secondary * 2.5 };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);

  focusElement(candidates[0]?.item);
}

function getSupportedKeyMap() {
  const keyMap = {};
  try {
    for (const key of window.tizen.tvinputdevice.getSupportedKeys()) {
      keyMap[key.keyCode] = key.name;
    }
  } catch {
    // Las teclas obligatorias siguen llegando como KeyboardEvent.
  }
  return keyMap;
}

function registerRemoteKeys(keyMap) {
  const supportedNames = new Set(Object.values(keyMap));
  const keys = MEDIA_KEYS.filter((key) => supportedNames.size === 0 || supportedNames.has(key));

  try {
    window.tizen.tvinputdevice.registerKeyBatch(
      keys,
      () => {},
      () => {
        for (const key of keys) {
          try {
            window.tizen.tvinputdevice.registerKey(key);
          } catch {
            // Some keys are model/remote dependent.
          }
        }
      },
    );
  } catch (error) {
    for (const key of keys) {
      try {
        window.tizen.tvinputdevice.registerKey(key);
      } catch {
        // Some keys are model/remote dependent.
      }
    }
    console.warn('TVInputDevice no pudo registrar teclas opcionales:', error);
  }
}

export function useTvRemote({
  enabled = true,
  onPlayPause,
  onPlay,
  onPause,
  onStop,
  onRewind,
  onFastForward,
  onTrackPrevious,
  onTrackNext,
  onChannelUp,
  onChannelDown,
  channelNavigationEnabled,
  onAudioNext,
  onSubtitleNext,
  onFullscreen,
  onEnter,
  onBack,
} = {}) {
  const handlersRef = useRef({});
  handlersRef.current = {
    onPlayPause,
    onPlay,
    onPause,
    onStop,
    onRewind,
    onFastForward,
    onTrackPrevious,
    onTrackNext,
    onChannelUp,
    onChannelDown,
    channelNavigationEnabled,
    onAudioNext,
    onSubtitleNext,
    onFullscreen,
    onEnter,
    onBack,
  };

  useEffect(() => {
    if (!enabled) return undefined;
    const isTizen = isSamsungTizen();
    const isAndroid = isCapacitorAndroid();
    const isWebos = isWebOS();
    if (!isTizen && !isAndroid && !isWebos) return undefined;

    const keyMap = isTizen ? getSupportedKeyMap() : {};
    if (isTizen) registerRemoteKeys(keyMap);

    const onKeyDown = (event) => {
      const name = normalizeKeyName(event, keyMap);
      handleRemoteKey(name, event, handlersRef.current);
    };

    const onAndroidMediaKey = (event) => {
      if (!isAndroid) return;
      const name = event.detail?.key;
      if (name) handleRemoteKey(name, event, handlersRef.current);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('android-media-key', onAndroidMediaKey);
    const onFocusIn = (event) => {
      const item = event.target?.closest?.('[data-tv-focusable="true"]');
      if (item) markRemoteFocus(item);
    };

    window.addEventListener('focusin', onFocusIn);
    requestAnimationFrame(() => focusElement(focusables()[0]));

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('android-media-key', onAndroidMediaKey);
      window.removeEventListener('focusin', onFocusIn);
      clearRemoteFocus();
      if (isTizen) {
        try {
          window.tizen.tvinputdevice.unregisterKeyBatch(MEDIA_KEYS);
        } catch {
          // Ignore.
        }
      }
    };
  }, [enabled]);
}

function channelNavigationEnabled(handlers) {
  if (!handlers.channelNavigationEnabled) return false;
  return typeof handlers.channelNavigationEnabled === 'function'
    ? handlers.channelNavigationEnabled()
    : handlers.channelNavigationEnabled;
}

function handleChannelKey(direction, event, handlers) {
  if (!channelNavigationEnabled(handlers)) return false;
  const callback = direction === 'up' ? handlers.onChannelUp : handlers.onChannelDown;
  if (!callback || callback() === false) return false;
  event.preventDefault();
  event.stopImmediatePropagation?.();
  return true;
}
