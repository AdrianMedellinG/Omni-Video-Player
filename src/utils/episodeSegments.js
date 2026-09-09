export const NEXT_EPISODE_TOAST_PCT = 97;
export const NEXT_EPISODE_AUTO_PCT = 99;
export const CREDIT_AUTO_ADVANCE_SECONDS = 12;

const SEGMENT_KEYS = {
  intro: ['intro'],
  recap: ['recap', 'recaps', 'summary'],
  credits: ['credits', 'creditos'],
  preview: ['preview', 'previews', 'preveiw'],
};

const START_KEYS = ['start_ms', 'startMs', 'startMilliseconds', 'start_seconds', 'startSeconds', 'start'];
const END_KEYS = ['end_ms', 'endMs', 'endMilliseconds', 'end_seconds', 'endSeconds', 'end'];

const LABELS = {
  en: {
    intro: 'Skip Intro',
    recap: 'Skip Recap',
    credits: 'Next episode',
    preview: 'Skip Preview',
    nextEpisode: 'Next episode',
  },
  es: {
    intro: 'Omitir Intro',
    recap: 'Omitir Resumen',
    credits: 'Siguiente episodio',
    preview: 'Omitir Avance',
    nextEpisode: 'Siguiente episodio',
  },
};

function languageFromLocale(locale) {
  const language = String(locale || 'en').trim().toLowerCase().split(/[-_]/)[0];
  return language === 'es' ? 'es' : 'en';
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asSegmentList(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return [parsed];
  return [];
}

function getOwnValue(object, keys) {
  if (!object || typeof object !== 'object') return { exists: false, value: undefined, key: '' };
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      return { exists: true, value: object[key], key };
    }
  }
  return { exists: false, value: undefined, key: '' };
}

function toSeconds(value, key) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const isMilliseconds = /ms$/i.test(key) || /milliseconds/i.test(key);
  return Math.max(0, isMilliseconds ? number / 1000 : number);
}

function getEpisodeSegmentList(episode, type) {
  if (!episode || typeof episode !== 'object') return [];
  const keys = SEGMENT_KEYS[type] || [type];
  for (const key of keys) {
    const list = asSegmentList(episode[key]);
    if (list.length) return list;
  }
  return [];
}

function normalizeSegment(segment, type, duration, index) {
  if (!segment || typeof segment !== 'object') return null;

  const startValue = getOwnValue(segment, START_KEYS);
  const endValue = getOwnValue(segment, END_KEYS);
  const startTime = startValue.value === null || startValue.value === undefined
    ? 0
    : toSeconds(startValue.value, startValue.key);
  const explicitEndTime = endValue.value === null || endValue.value === undefined
    ? null
    : toSeconds(endValue.value, endValue.key);
  const durationTime = Number(duration) > 0 ? Number(duration) : null;
  const endTime = explicitEndTime ?? durationTime;

  if (startTime === null || (endValue.exists && endValue.value !== null && explicitEndTime === null)) return null;
  if (endTime !== null && endTime <= startTime) return null;

  return {
    type,
    index,
    startTime,
    endTime,
    explicitEndTime,
    targetTime: endTime,
  };
}

export function getEpisodeSegments(episode, type, duration = 0) {
  return getEpisodeSegmentList(episode, type)
    .map((segment, index) => normalizeSegment(segment, type, duration, index))
    .filter(Boolean);
}

export function hasEpisodeSegment(episode, type) {
  return getEpisodeSegments(episode, type).length > 0;
}

export function getActiveEpisodeSegment(episode, currentTime, duration = 0, types = []) {
  const time = Math.max(0, Number(currentTime) || 0);
  for (const type of types) {
    const segment = getEpisodeSegments(episode, type, duration).find((item) => (
      time >= item.startTime && (item.endTime === null || time < item.endTime)
    ));
    if (segment) return segment;
  }
  return null;
}

export function getEpisodeSegmentProgress(segment, currentTime) {
  if (!segment || segment.endTime === null || segment.endTime <= segment.startTime) return 0;
  const elapsed = Math.max(0, (Number(currentTime) || 0) - segment.startTime);
  return Math.max(0, Math.min(1, elapsed / (segment.endTime - segment.startTime)));
}

export function getEpisodeSegmentElapsedSeconds(segment, currentTime) {
  if (!segment) return 0;
  return Math.max(0, (Number(currentTime) || 0) - segment.startTime);
}

export function getCreditAutoAdvanceProgress(segment, currentTime, seconds = CREDIT_AUTO_ADVANCE_SECONDS) {
  const total = Math.max(1, Number(seconds) || CREDIT_AUTO_ADVANCE_SECONDS);
  return Math.max(0, Math.min(1, getEpisodeSegmentElapsedSeconds(segment, currentTime) / total));
}

export function getEpisodeSegmentLabel(type, locale) {
  const labels = LABELS[languageFromLocale(locale)] || LABELS.en;
  return labels[type] || labels.nextEpisode;
}

export function getNextEpisodeLabel(locale) {
  return getEpisodeSegmentLabel('nextEpisode', locale);
}
