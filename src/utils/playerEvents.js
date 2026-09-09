export function emitPlayerEvent(callbacksRef, name, payload, aliases = []) {
  const callbacks = callbacksRef.current || {};
  callbacks[name]?.(payload);
  for (const alias of aliases) callbacks[alias]?.(payload);
}

export function getNaturalSize(width = 0, height = 0) {
  const safeWidth = Number(width) || 0;
  const safeHeight = Number(height) || 0;
  const orientation = safeWidth === safeHeight ? 'square' : safeWidth > safeHeight ? 'landscape' : 'portrait';
  return { width: safeWidth, height: safeHeight, orientation };
}

export function getBufferedEnd(media) {
  if (!media?.buffered?.length) return 0;
  const current = media.currentTime || 0;
  for (let index = 0; index < media.buffered.length; index += 1) {
    const start = media.buffered.start(index);
    const end = media.buffered.end(index);
    if (current >= start && current <= end) return end;
  }
  return media.buffered.end(media.buffered.length - 1);
}

export function getSeekableEnd(media, fallback = 0) {
  if (media?.seekable?.length) return media.seekable.end(media.seekable.length - 1);
  return fallback;
}

export function createProgressPayload(media, fallbackDuration = 0, extra = {}) {
  const duration = Number.isFinite(media?.duration) ? media.duration : fallbackDuration;
  return {
    currentTime: media?.currentTime || 0,
    playableDuration: getBufferedEnd(media),
    seekableDuration: getSeekableEnd(media, duration),
    duration,
    ...extra,
  };
}

export function createLoadStartPayload(src, type = '') {
  return {
    isNetwork: /^https?:\/\//i.test(String(src || '')),
    type,
    uri: src || '',
  };
}

export function createLoadPayload({
  currentTime = 0,
  duration = 0,
  width = 0,
  height = 0,
  audioTracks = [],
  textTracks = [],
  videoTracks = [],
  trackId = '',
} = {}) {
  return {
    canPlayFastForward: true,
    canPlaySlowForward: true,
    canPlayReverse: false,
    canPlaySlowReverse: false,
    canStepBackward: false,
    canStepForward: false,
    currentTime,
    duration,
    naturalSize: getNaturalSize(width, height),
    audioTracks,
    textTracks,
    videoTracks,
    trackId,
  };
}

export function createPlaybackStatePayload({ isPlaying = false, isSeeking = false } = {}) {
  return { isPlaying, isSeeking };
}

export function createSeekPayload(currentTime, seekTime) {
  return { currentTime, seekTime };
}

export function createErrorPayload(error) {
  return { error };
}

export function mapAudioTracks(tracks, selectedIndex = -1) {
  return tracks.map((track, index) => ({
    index: Number(track.index ?? track.id ?? index),
    title: track.title || track.name || track.label || '',
    language: track.language || track.lang || '',
    type: track.type || track.codec || '',
    bitrate: track.bitrate || 0,
    selected: Number(track.index ?? track.id ?? index) === Number(selectedIndex),
  }));
}

export function mapTextTracks(tracks, selectedIndex = -1) {
  return tracks.map((track, index) => ({
    index: Number(track.index ?? track.id ?? index),
    title: track.title || track.name || track.label || '',
    language: track.language || track.lang || '',
    type: track.type || track.codec || '',
    selected: Number(track.index ?? track.id ?? index) === Number(selectedIndex),
  }));
}

export function mapVideoTracks(tracks, selectedIndex = -1) {
  return tracks.map((track, index) => ({
    index: Number(track.index ?? track.id ?? index),
    trackId: String(track.trackId ?? track.id ?? index),
    codecs: track.codecs || track.codec || '',
    width: Number(track.width) || 0,
    height: Number(track.height) || 0,
    bitrate: Number(track.bitrate) || 0,
    selected: Number(track.index ?? track.id ?? index) === Number(selectedIndex),
    rotation: Number(track.rotation) || 0,
  }));
}
