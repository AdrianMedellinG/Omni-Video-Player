const aliases = {
  spa: 'es', es: 'es', esp: 'es',
  spanish: 'es', espanol: 'es', español: 'es', castellano: 'es',
  eng: 'en', en: 'en',
  english: 'en', ingles: 'en', inglés: 'en',
  fra: 'fr', fre: 'fr', fr: 'fr',
  french: 'fr', frances: 'fr', francés: 'fr', francais: 'fr', français: 'fr',
  deu: 'de', ger: 'de', de: 'de',
  german: 'de', aleman: 'de', alemán: 'de',
  ita: 'it', it: 'it',
  italian: 'it', italiano: 'it',
  por: 'pt', pt: 'pt',
  portuguese: 'pt', portugues: 'pt', portugués: 'pt', portuguesbr: 'pt',
  jpn: 'ja', ja: 'ja',
  japanese: 'ja', japones: 'ja', japonés: 'ja',
  kor: 'ko', ko: 'ko',
  korean: 'ko', coreano: 'ko',
  zho: 'zh', chi: 'zh', zh: 'zh',
  chinese: 'zh', chino: 'zh',
  rus: 'ru', ru: 'ru',
  russian: 'ru', ruso: 'ru',
  ara: 'ar', ar: 'ar',
  arabic: 'ar', arabe: 'ar', árabe: 'ar',
  hin: 'hi', hi: 'hi',
  hindi: 'hi',
  und: 'und',
};

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeLanguageCode(value) {
  if (!value) return '';
  const raw = normalizeToken(value).replace('_', '-');
  const base = raw.split('-')[0];
  return aliases[raw] || aliases[base] || '';
}

function getLanguageCodeFromText(value) {
  if (value === null || value === undefined) return '';
  const raw = normalizeToken(value).replace(/_/g, '-');
  if (!raw || /^(und|unknown|desconocido|null|undefined)$/i.test(raw)) return '';

  const direct = normalizeLanguageCode(raw);
  if (direct) return direct;

  const tokens = raw.split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    const normalized = normalizeLanguageCode(token);
    if (normalized) return normalized;
  }

  return '';
}

export function getTrackLanguageName(track = {}) {
  const candidates = [
    track.language,
    track.lang,
    track.srclang,
    track.languageHint,
    track.name,
    track.title,
    track.label,
    track.id,
    track.trackId,
  ];

  for (const candidate of candidates) {
    const code = getLanguageCodeFromText(candidate);
    if (code) return getLanguageName(code, '');
  }

  return '';
}

function stripLeadingLanguageMarker(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const match = text.match(/^([a-zA-Z\u00C0-\u024F]{2,16})(?:\s*[-_:]\s*|\s+)/);
  if (!match) return text;

  const code = getLanguageCodeFromText(match[1]);
  if (!code) return text;

  return text.slice(match[0].length).trim();
}

function startsWithLanguage(text, language) {
  const normalizedText = normalizeToken(text);
  const normalizedLanguage = normalizeToken(language);
  if (!normalizedText || !normalizedLanguage) return false;
  return normalizedText === normalizedLanguage || normalizedText.startsWith(`${normalizedLanguage} `);
}

function normalizeLeadingLanguageName(text, language) {
  if (!text || !language) return text;
  const parts = String(text).trim().split(/\s+/);
  const firstCode = getLanguageCodeFromText(parts[0]);
  const languageCode = getLanguageCodeFromText(language);

  if (firstCode && languageCode && firstCode === languageCode) {
    return [language, ...parts.slice(1)].join(' ').trim();
  }

  return text;
}

export function getLanguageName(code, fallback = 'Desconocido') {
  if (!code) return fallback;
  const raw = String(code).trim().toLowerCase().replace('_', '-');
  const base = raw.split('-')[0];
  const normalized = normalizeLanguageCode(raw) || base;
  if (normalized === 'und') return fallback;
  try {
    const display = new Intl.DisplayNames(['es'], { type: 'language' });
    const value = display.of(normalized);
    if (value) return value.charAt(0).toUpperCase() + value.slice(1);
  } catch {
    // Fallback below.
  }
  return raw.toUpperCase();
}

export function cleanTrackLabel(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (
    !text
    || /^(und|unknown|desconocido|null|undefined)$/i.test(text)
    || /^(videohandler|soundhandler|subtitlehandler|text|subtitle|subtitles?)$/i.test(text)
    || /^https?:\/\//i.test(text)
    || /^(www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/.*)?$/i.test(text)
  ) return '';

  return text
    .replace(/^[a-z]{2,3}\s*[-_:]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getTrackDisplayLabel(track = {}, type = 'audio', index = 0) {
  const rawName = track.name || track.title || track.label;
  const strippedName = stripLeadingLanguageMarker(rawName);
  const name = cleanTrackLabel(strippedName || rawName);
  const language = getTrackLanguageName(track);
  const fallback = type === 'audio' ? `Audio ${index + 1}` : `Subtítulo ${index + 1}`;

  if (type === 'audio') {
    if (name && language && name.toLowerCase().includes(language.toLowerCase())) return name;
    if (language) return language;
    if (name) return name;
    return fallback;
  }

  if (name && language && startsWithLanguage(name, language)) {
    return normalizeLeadingLanguageName(name, language);
  }
  if (name && language && strippedName !== rawName) {
    return `${language} ${name}`.trim();
  }
  if (name && language && name.toLowerCase().includes(language.toLowerCase())) return name;
  if (name) return name;
  if (language) return language;
  return fallback;
}
