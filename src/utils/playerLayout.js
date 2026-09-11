import { useEffect, useState } from 'react';

const DEFAULT_LAYOUT = {
  width: 0,
  height: 0,
  density: 'regular',
  subtitleScale: 1,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readRect(element) {
  const rect = element?.getBoundingClientRect?.();
  const width = Math.round(rect?.width || 0);
  const height = Math.round(rect?.height || 0);
  return { width, height };
}

export function getPlayerLayoutDensity({ width = 0, height = 0 } = {}) {
  if (!width || !height) return DEFAULT_LAYOUT.density;

  const area = width * height;
  if (width < 360 || height < 220 || area < 95000) return 'mini';
  if (width < 620 || height < 340 || area < 205000) return 'compact';
  return 'regular';
}

export function getSubtitleScale({ width = 0, height = 0 } = {}) {
  if (!width || !height) return 1;
  const widthScale = width / 720;
  const heightScale = height / 405;
  return clamp(Math.min(widthScale, heightScale), 0.46, 1);
}

export function getPlayerLayout(rect = {}) {
  const width = Math.max(0, Math.round(rect.width || 0));
  const height = Math.max(0, Math.round(rect.height || 0));
  return {
    width,
    height,
    density: getPlayerLayoutDensity({ width, height }),
    subtitleScale: getSubtitleScale({ width, height }),
  };
}

function scaleNumericSize(value, unit, scale, minPx) {
  const normalizedUnit = unit || 'px';
  const min = normalizedUnit === 'px' ? minPx : minPx / 16;
  const next = clamp(value * scale, min, value);
  return `${Number(next.toFixed(2))}${normalizedUnit}`;
}

export function scaleSubtitleFontSize(fontSize, scale = 1, minPx = 12) {
  if (!fontSize || scale >= 0.995) return fontSize;
  if (typeof fontSize === 'number') return Math.max(minPx, Math.round(fontSize * scale));
  if (Array.isArray(fontSize)) {
    return fontSize.map((value) => scaleSubtitleFontSize(value, scale, minPx));
  }
  if (typeof fontSize === 'object') {
    return Object.fromEntries(
      Object.entries(fontSize).map(([key, value]) => [key, scaleSubtitleFontSize(value, scale, minPx)]),
    );
  }

  const text = String(fontSize).trim();
  const match = text.match(/^(-?\d+(?:\.\d+)?)(px|rem|em)$/i);
  if (!match) return text;
  return scaleNumericSize(Number(match[1]), match[2], scale, minPx);
}

export function getResponsiveSubtitleStyles(styles = {}, layout = DEFAULT_LAYOUT) {
  return {
    ...styles,
    fontSize: scaleSubtitleFontSize(styles.fontSize, layout.subtitleScale),
  };
}

export function usePlayerLayout(ref) {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === 'undefined') return undefined;

    let animationFrame = 0;
    const update = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        setLayout((current) => {
          const next = getPlayerLayout(readRect(element));
          if (
            current.width === next.width
            && current.height === next.height
            && current.density === next.density
            && current.subtitleScale === next.subtitleScale
          ) {
            return current;
          }
          return next;
        });
      });
    };

    update();

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(element);
    }
    window.addEventListener('resize', update);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);

  return layout;
}
