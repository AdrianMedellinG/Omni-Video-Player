export const DEFAULT_BUFFER_CONFIG = {
  minBufferMs: 15000,
  maxBufferMs: 50000,
  bufferForPlaybackMs: 2500,
  bufferForPlaybackAfterRebufferMs: 5000,
  backBufferDurationMs: 120000,
  cacheSizeMB: 0,
};

export const RESIZE_MODE_OPTIONS = ['contain', 'cover', 'stretch', 'center', 'none'];

const USER_AGENT_HEADER_KEYS = new Set(['user-agent', 'useragent']);

function normalizeHeaderEntries(headers = {}) {
  if (!headers) return [];
  if (Array.isArray(headers)) return headers;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const entries = [];
    headers.forEach((value, key) => entries.push([key, value]));
    return entries;
  }
  return Object.entries(headers);
}

export function getUserAgentFromHeaders(headers = {}) {
  const entry = normalizeHeaderEntries(headers)
    .find(([key]) => USER_AGENT_HEADER_KEYS.has(String(key).trim().toLowerCase()));
  return entry ? String(entry[1] ?? '').trim() : '';
}

export function sanitizeRequestHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of normalizeHeaderEntries(headers)) {
    const name = String(key || '').trim();
    if (!name || USER_AGENT_HEADER_KEYS.has(name.toLowerCase())) continue;
    result[name] = value;
  }
  return result;
}

function parseUriOptions(uri = '') {
  const raw = String(uri || '').trim();
  const pipeIndex = raw.indexOf('|');
  if (pipeIndex < 0) return { uri: raw, userAgent: '' };

  const mediaUri = raw.slice(0, pipeIndex).trim();
  const optionsText = raw.slice(pipeIndex + 1).trim();
  if (!optionsText) return { uri: mediaUri, userAgent: '' };

  try {
    const params = new URLSearchParams(optionsText);
    return {
      uri: mediaUri,
      userAgent: (
        params.get('User-Agent')
        || params.get('user-agent')
        || params.get('UserAgent')
        || params.get('userAgent')
        || params.get('ua')
        || ''
      ).trim(),
    };
  } catch {
    const match = optionsText.match(/(?:^|[&;])(?:User-Agent|user-agent|UserAgent|userAgent|ua)=([^&;]+)/);
    return {
      uri: mediaUri,
      userAgent: match ? decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() : '',
    };
  }
}

export function normalizeVideoSource(source, legacySrc = '') {
  if (!source) {
    const parsed = parseUriOptions(legacySrc);
    return { uri: parsed.uri, raw: source, userAgent: parsed.userAgent };
  }
  if (typeof source === 'string') {
    const parsed = parseUriOptions(source);
    return { uri: parsed.uri, raw: source, userAgent: parsed.userAgent };
  }

  const parsed = parseUriOptions(source.uri || source.url || legacySrc || '');
  const rawHeaders = source.headers || {};
  const userAgent = String(
    source.userAgent
      || source.user_agent
      || source.httpUserAgent
      || getUserAgentFromHeaders(rawHeaders)
      || parsed.userAgent
      || ''
  ).trim();
  return {
    uri: parsed.uri,
    raw: source,
    type: source.type,
    headers: sanitizeRequestHeaders(rawHeaders),
    userAgent,
    startPosition: source.startPosition,
    cropStart: source.cropStart,
    cropEnd: source.cropEnd,
    contentStartTime: source.contentStartTime,
    bufferConfig: source.bufferConfig,
    drm: source.drm,
    metadata: source.metadata,
    poster: source.poster,
    live: source.live ?? source.isLive,
    locale: source.locale,
  };
}

export function isLikelyLiveSource(src = '') {
  const clean = String(src || '').split('?')[0].split('#')[0].toLowerCase();
  return clean.endsWith('.m3u8') || clean.endsWith('.ts');
}

export function getStartSeconds(sourceInfo, initialTime = 0) {
  const startPosition = Number(sourceInfo?.startPosition);
  if (Number.isFinite(startPosition) && startPosition > 0) return startPosition / 1000;

  const cropStart = Number(sourceInfo?.cropStart);
  if (Number.isFinite(cropStart) && cropStart > 0) return cropStart / 1000;

  return Math.max(0, Number(initialTime) || 0);
}

export function getMergedBufferConfig(bufferConfig, sourceInfo) {
  return {
    ...DEFAULT_BUFFER_CONFIG,
    ...(bufferConfig || {}),
    ...(sourceInfo?.bufferConfig || {}),
  };
}

export function getPosterSource(poster, sourceInfo) {
  const value = poster || sourceInfo?.poster;
  if (!value) return null;
  if (typeof value === 'string') return { uri: value };
  if (value.source?.uri) return { ...value, uri: value.source.uri };
  return value.uri ? value : null;
}

export function normalizeResizeMode(mode = 'contain') {
  const value = String(mode || 'contain').trim().toLowerCase();
  return RESIZE_MODE_OPTIONS.includes(value) ? value : 'contain';
}

export function getNextResizeMode(mode = 'contain') {
  const current = normalizeResizeMode(mode);
  const index = RESIZE_MODE_OPTIONS.indexOf(current);
  return RESIZE_MODE_OPTIONS[(index + 1) % RESIZE_MODE_OPTIONS.length];
}

export function resizeModeToObjectFit(mode = 'contain') {
  const normalized = normalizeResizeMode(mode);
  if (normalized === 'cover') return 'cover';
  if (normalized === 'stretch') return 'fill';
  if (normalized === 'none') return 'none';
  if (normalized === 'center') return 'scale-down';
  return 'contain';
}

export function renderLoaderContent(renderLoader, props) {
  if (!renderLoader) return null;
  if (typeof renderLoader === 'function') return renderLoader(props);
  return renderLoader;
}

function normalizeComparable(value) {
  return String(value || '').trim().toLowerCase();
}

export function pickTrackBySelection(tracks, selection, getFields = (track) => track) {
  if (!selection || selection.type === 'system' || selection.type === 'auto') return null;
  if (selection.type === 'disabled') return { disabled: true };

  const value = normalizeComparable(selection.value);
  if (!value && selection.type !== 'index') return null;

  if (selection.type === 'index') {
    const index = Number(selection.value);
    if (!Number.isFinite(index)) return null;
    return tracks[index] || tracks.find((track) => Number(getFields(track).index ?? getFields(track).id) === index) || null;
  }

  return tracks.find((track) => {
    const fields = getFields(track);
    if (selection.type === 'language') {
      return normalizeComparable(fields.language || fields.lang).startsWith(value);
    }
    if (selection.type === 'title') {
      return normalizeComparable(fields.name || fields.title || fields.label).includes(value);
    }
    if (selection.type === 'resolution') {
      return Number(fields.height || fields.value) === Number(selection.value);
    }
    return false;
  }) || null;
}
