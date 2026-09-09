import { useCallback, useEffect, useMemo, useState } from 'react';

export const SUBTITLE_PREFERENCES_STORAGE_KEY = 'universal-player.subtitle-preferences.v2';

export const SUBTITLE_SIZE_PRESETS = [
  { value: 'small', label: 'Pequeño', fontSize: '30px', sampleSize: 16 },
  { value: 'medium', label: 'Medio', fontSize: '38px', sampleSize: 20 },
  { value: 'large', label: 'Grande', fontSize: '48px', sampleSize: 24 },
];

export const SUBTITLE_STYLE_PRESETS = [
  {
    value: 'clear',
    label: 'Claro',
    color: '#fff',
    backgroundColor: 'transparent',
    textShadow: 'none',
    sampleColor: '#111',
    sampleBackground: '#fff',
  },
  {
    value: 'contrast',
    label: 'Contraste',
    color: '#ffeb3b',
    backgroundColor: '#000',
    textShadow: 'none',
    sampleColor: '#ffeb3b',
    sampleBackground: '#000',
  },
  {
    value: 'dark',
    label: 'Oscuro',
    color: '#111',
    backgroundColor: 'rgba(255,255,255,.9)',
    textShadow: 'none',
    sampleColor: '#fff',
    sampleBackground: '#444',
  },
  {
    value: 'shadow',
    label: 'Sombra paralela',
    color: '#fff',
    backgroundColor: 'transparent',
    textShadow: '0 2px 4px #000, 1px 1px 2px #000, -1px -1px 2px #000',
    sampleColor: '#fff',
    sampleBackground: '#5a5e6b',
  },
];

export const DEFAULT_SUBTITLE_APPEARANCE = {
  size: 'medium',
  style: 'shadow',
};

function findSize(value) {
  return SUBTITLE_SIZE_PRESETS.find((preset) => preset.value === value)?.value || DEFAULT_SUBTITLE_APPEARANCE.size;
}

function findStyle(value) {
  return SUBTITLE_STYLE_PRESETS.find((preset) => preset.value === value)?.value || DEFAULT_SUBTITLE_APPEARANCE.style;
}

export function normalizeSubtitleAppearance(value) {
  return {
    size: findSize(value?.size),
    style: findStyle(value?.style),
  };
}

function inferSize(fontSize) {
  const raw = Array.isArray(fontSize) ? fontSize[fontSize.length - 1] : fontSize;
  const numeric = Number.parseFloat(String(raw));
  if (!Number.isFinite(numeric)) return DEFAULT_SUBTITLE_APPEARANCE.size;
  if (numeric <= 26) return 'small';
  if (numeric <= 33) return 'medium';
  return 'large';
}

function inferStyle(color, backgroundColor) {
  const normalizedColor = String(color || '').toLowerCase().replace(/\s/g, '');
  const normalizedBackground = String(backgroundColor || '').toLowerCase().replace(/\s/g, '');
  if (normalizedColor.includes('ffeb3b') || normalizedColor.includes('yellow')) return 'contrast';
  if (normalizedColor === '#111' || normalizedColor === '#000' || normalizedBackground.includes('255,255,255')) return 'dark';
  if (!normalizedBackground || normalizedBackground === 'transparent') return 'clear';
  return 'shadow';
}

export function inferSubtitleAppearance({ subtitleColor, subtitleFontSize, subtitleBackgroundColor } = {}) {
  return normalizeSubtitleAppearance({
    size: inferSize(subtitleFontSize),
    style: inferStyle(subtitleColor, subtitleBackgroundColor),
  });
}

function readStoredAppearance() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SUBTITLE_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeSubtitleAppearance(parsed?.appearance || parsed);
  } catch {
    return null;
  }
}

function writeStoredAppearance(appearance) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SUBTITLE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, appearance: normalizeSubtitleAppearance(appearance) }),
    );
  } catch {
    // La reproducción no debe fallar si Tizen no permite guardar la preferencia.
  }
}

export function getSubtitleAppearanceStyles(appearance) {
  const normalized = normalizeSubtitleAppearance(appearance);
  const sizePreset = SUBTITLE_SIZE_PRESETS.find((preset) => preset.value === normalized.size);
  const stylePreset = SUBTITLE_STYLE_PRESETS.find((preset) => preset.value === normalized.style);
  return {
    ...normalized,
    fontSize: sizePreset.fontSize,
    color: stylePreset.color,
    backgroundColor: stylePreset.backgroundColor,
    textShadow: stylePreset.textShadow,
  };
}

export function useSubtitleAppearance(initialValues = {}) {
  const [storedAppearance] = useState(() => readStoredAppearance());
  const [appearance, setAppearance] = useState(() => (
    storedAppearance || inferSubtitleAppearance(initialValues)
  ));
  const [customized, setCustomized] = useState(Boolean(storedAppearance));

  const updateAppearance = useCallback((next) => {
    setCustomized(true);
    setAppearance((current) => normalizeSubtitleAppearance({ ...current, ...next }));
  }, []);

  const styles = useMemo(() => {
    if (customized) return getSubtitleAppearanceStyles(appearance);
    return {
      ...getSubtitleAppearanceStyles(appearance),
      fontSize: initialValues.subtitleFontSize || getSubtitleAppearanceStyles(appearance).fontSize,
      color: initialValues.subtitleColor || getSubtitleAppearanceStyles(appearance).color,
      backgroundColor: initialValues.subtitleBackgroundColor || getSubtitleAppearanceStyles(appearance).backgroundColor,
    };
  }, [appearance, customized, initialValues.subtitleBackgroundColor, initialValues.subtitleColor, initialValues.subtitleFontSize]);

  // Se guarda solo la preferencia, nunca los datos ni el contenido de las pistas.
  useEffect(() => {
    writeStoredAppearance(appearance);
  }, [appearance]);

  return { appearance, styles, updateAppearance };
}
