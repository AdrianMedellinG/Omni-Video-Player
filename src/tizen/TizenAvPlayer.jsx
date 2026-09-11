import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import Replay10RoundedIcon from '@mui/icons-material/Replay10Rounded';
import Forward10RoundedIcon from '@mui/icons-material/Forward10Rounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import SubtitlesRoundedIcon from '@mui/icons-material/SubtitlesRounded';
import { formatTime, normalizeSeekStep } from '../utils/time.js';
import {
  getSafePlaybackErrorMessage,
  normalizeRetryCount,
  normalizeRetryDelay,
} from '../utils/errorMessages.js';
import { getTrackDisplayLabel, getTrackLanguageName } from '../utils/language.js';
import {
  DEFAULT_BUFFER_CONFIG,
  getMergedBufferConfig,
  getNextResizeMode,
  getPosterSource,
  getStartSeconds,
  normalizeResizeMode,
  pickTrackBySelection,
  renderLoaderContent,
  resizeModeToObjectFit,
  sanitizeRequestHeaders,
} from '../utils/playerProps.js';
import {
  createErrorPayload,
  createLoadPayload,
  createLoadStartPayload,
  createPlaybackStatePayload,
  createSeekPayload,
  emitPlayerEvent,
  mapAudioTracks,
  mapTextTracks,
  mapVideoTracks,
} from '../utils/playerEvents.js';
import PlayerControls from '../components/PlayerControls.jsx';
import PlaybackErrorSnackbar from '../components/PlaybackErrorSnackbar.jsx';
import { getAvplay, isSamsungTizen, safeJson } from './tizenRuntime.js';
import { useTvRemote } from './useTvRemote.js';
import { useSubtitleAppearance } from '../utils/subtitlePreferences.js';
import { getResponsiveSubtitleStyles, usePlayerLayout } from '../utils/playerLayout.js';

const TIZEN_PROGRESS_SEEK_STEP = 5 * 60;

function cleanTrackText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (
    !text
    || /^(und|unknown|desconocido|null|undefined)$/i.test(text)
    || /^(videohandler|soundhandler|subtitlehandler|text|subtitle|subtitles?)$/i.test(text)
  ) return '';
  return text;
}

function pickTrackField(extra, keys) {
  for (const key of keys) {
    const value = cleanTrackText(extra?.[key]);
    if (value) return value;
  }
  return '';
}

function buildTrackLabel(track, index, type) {
  return getTrackDisplayLabel(track, type, index);
}

function normalizeSubtitleText(value = '') {
  const raw = String(value)
    .replace(/&lt;br\s*\/?&gt;/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");

  return raw
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

function isMkvSource(src) {
  const clean = String(src || '').split('?')[0].split('#')[0].toLowerCase();
  return clean.endsWith('.mkv');
}

function mergeSubtitleMetadata(subtitles, metadata) {
  if (!metadata.length) return subtitles;
  return subtitles.map((track, index) => {
    const byOrder = metadata[index];
    const byNumber = metadata.find((item) => Number(item.number) === Number(track.index));
    const match = byOrder || byNumber;

    if (!match) return track;
    return {
      ...track,
      language: match.language || track.language || '',
      name: match.name || track.name || '',
      codec: track.codec || match.codec || '',
    };
  });
}

function mergeTrackLists(current, next) {
  if (!next.length) return current;
  const byIndex = new Map(current.map((track) => [String(track.index), track]));

  for (const track of next) {
    const key = String(track.index);
    const previous = byIndex.get(key);
    byIndex.set(key, previous ? {
      ...previous,
      ...track,
      language: track.language || previous.language || '',
      name: track.name || previous.name || '',
      codec: track.codec || previous.codec || '',
    } : track);
  }

  return Array.from(byIndex.values())
    .sort((a, b) => Number(a.index) - Number(b.index));
}

async function readMkvSubtitleMetadata(src, signal, headers = {}) {
  const api = window.MatroskaSubtitles;
  if (!api?.SubtitleParser || !isMkvSource(src)) return [];

  const parser = new api.SubtitleParser();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (tracks = []) => {
      if (settled) return;
      settled = true;
      try { parser.destroy?.(); } catch {}
      resolve(tracks.map((track) => ({
        number: Number(track.number),
        language: cleanTrackText(track.language),
        name: cleanTrackText(track.name),
        codec: cleanTrackText(track.type),
      })));
    };

    const timeout = window.setTimeout(() => finish([]), 8000);
    parser.once('tracks', (tracks = []) => {
      window.clearTimeout(timeout);
      finish(tracks);
    });
    parser.on('error', () => {
      window.clearTimeout(timeout);
      finish([]);
    });

    fetch(src, {
      method: 'GET',
      signal,
      headers: {
        ...headers,
        Accept: 'video/x-matroska,video/*,*/*',
        Range: 'bytes=0-16777215',
      },
    })
      .then(async (response) => {
        if (!response.ok && response.status !== 206) {
          finish([]);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          finish([]);
          return;
        }

        while (!settled) {
          const { done, value } = await reader.read();
          if (done || signal.aborted) break;
          if (value?.byteLength) parser.write(value);
        }

        if (!settled) {
          try { parser.end(); } catch {}
          finish([]);
        }
      })
      .catch(() => {
        window.clearTimeout(timeout);
        finish([]);
      });
  });
}

function normalizeTracks(trackInfo = []) {
  const audio = [];
  const subtitles = [];

  for (const track of trackInfo) {
    const extra = safeJson(track.extra_info, {});
    if (track.type === 'AUDIO') {
      audio.push({
        index: track.index,
        language: pickTrackField(extra, ['language', 'track_lang', 'lang', 'Language']),
        name: pickTrackField(extra, ['track_name', 'title', 'name', 'label', 'description', 'TrackName']),
      });
    } else if (track.type === 'TEXT') {
      subtitles.push({
        index: track.index,
        language: pickTrackField(extra, ['track_lang', 'language', 'lang', 'Language']),
        name: pickTrackField(extra, [
          'track_name',
          'title',
          'name',
          'label',
          'description',
          'TrackName',
        ]),
        codec: pickTrackField(extra, ['subtitle_type', 'codec', 'type']),
      });
    }
  }

  return { audio, subtitles };
}

function isAdaptiveStream(src) {
  const clean = String(src || '').split('?')[0].split('#')[0].toLowerCase();
  return clean.endsWith('.m3u8') || clean.endsWith('.mpd');
}

function getAvplayScreenSize() {
  const width = Math.round(window.screen?.width || document.documentElement.clientWidth || window.innerWidth || 1920);
  const height = Math.round(window.screen?.height || document.documentElement.clientHeight || window.innerHeight || 1080);
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function toPositiveNumber(value) {
  if (value === null || value === undefined) return 0;
  const match = String(value).match(/\d+(?:\.\d+)?/);
  const number = Number(match?.[0]);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function getVideoSizeFromExtraInfo(extraInfo) {
  const extra = safeJson(extraInfo, {});
  const width = toPositiveNumber(
    extra.Width
    ?? extra.width
    ?? extra.WIDTH
    ?? extra.videoWidth
    ?? extra.VideoWidth
    ?? extra.max_width,
  );
  const height = toPositiveNumber(
    extra.Height
    ?? extra.height
    ?? extra.HEIGHT
    ?? extra.videoHeight
    ?? extra.VideoHeight
    ?? extra.max_height,
  );

  if (width && height) return { width, height };

  const text = typeof extraInfo === 'string' ? extraInfo : JSON.stringify(extra || {});
  const resolution = text.match(/(\d{2,5})\s*[xX]\s*(\d{2,5})/);
  if (resolution) {
    return {
      width: toPositiveNumber(resolution[1]),
      height: toPositiveNumber(resolution[2]),
    };
  }

  const widthMatch = text.match(/"?Width"?\s*:\s*"?(\d{2,5})/i);
  const heightMatch = text.match(/"?Height"?\s*:\s*"?(\d{2,5})/i);
  return {
    width: toPositiveNumber(widthMatch?.[1]),
    height: toPositiveNumber(heightMatch?.[1]),
  };
}

function getVideoSizeFromStreamInfo(streamInfo = []) {
  const tracks = Array.isArray(streamInfo) ? streamInfo : [];
  for (const track of tracks) {
    if (track?.type && track.type !== 'VIDEO') continue;
    const directSize = {
      width: toPositiveNumber(track.width),
      height: toPositiveNumber(track.height),
    };
    if (directSize.width && directSize.height) return directSize;

    const extraSize = getVideoSizeFromExtraInfo(track?.extra_info ?? track?.extraInfo);
    if (extraSize.width && extraSize.height) return extraSize;
  }
  return { width: 0, height: 0 };
}

function readAvplayVideoSize(av) {
  try {
    const size = av.getVideoSize?.();
    const width = toPositiveNumber(size?.width);
    const height = toPositiveNumber(size?.height);
    if (width && height) return { width, height };
  } catch {
    // getVideoSize is only available on some devices/content types.
  }

  const readers = [
    () => av.getCurrentStreamInfo?.(),
    () => av.getTotalTrackInfo?.(),
  ];

  for (const readInfo of readers) {
    try {
      const size = getVideoSizeFromStreamInfo(readInfo());
      if (size.width && size.height) return size;
    } catch {
      // Stream info is state-sensitive on AVPlay.
    }
  }

  return { width: 0, height: 0 };
}

function getResizeDisplayRect(container, videoSize, resizeMode, options = {}) {
  const normalizedMode = normalizeResizeMode(resizeMode);
  const base = {
    x: Number(container.x) || 0,
    y: Number(container.y) || 0,
    width: Math.max(1, Number(container.width) || 1),
    height: Math.max(1, Number(container.height) || 1),
  };

  if (normalizedMode === 'stretch' || normalizedMode === 'cover') return base;

  const videoWidth = toPositiveNumber(videoSize?.width);
  const videoHeight = toPositiveNumber(videoSize?.height);
  if (!videoWidth || !videoHeight) return base;

  const containScale = Math.min(base.width / videoWidth, base.height / videoHeight);
  const scale = normalizedMode === 'none' || normalizedMode === 'center'
    ? Math.min(1, containScale)
    : containScale;
  const width = Math.max(1, videoWidth * scale);
  const height = Math.max(1, videoHeight * scale);
  const fitted = {
    x: base.x + (base.width - width) / 2,
    y: base.y + (base.height - height) / 2,
    width,
    height,
  };

  if (!options.clamp) return fitted;

  return {
    x: Math.max(0, Math.round(fitted.x)),
    y: Math.max(0, Math.round(fitted.y)),
    width: Math.max(1, Math.round(fitted.width)),
    height: Math.max(1, Math.round(fitted.height)),
  };
}

function getHttpFallbackUrl(src) {
  try {
    const url = new URL(src);
    if (url.protocol === 'https:' && url.port && url.port !== '443') {
      url.protocol = 'http:';
      return url.toString();
    }
  } catch {
    // The original src will surface the real error from AVPlay.
  }
  return null;
}

function encodeAvplayPathSegment(segment) {
  try {
    return encodeURIComponent(decodeURIComponent(segment))
      .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch {
    return segment.replace(/[()'!*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  }
}

function getAvplayUrl(src) {
  try {
    const url = new URL(src);
    url.pathname = url.pathname
      .split('/')
      .map((segment) => segment ? encodeAvplayPathSegment(segment) : segment)
      .join('/');
    return url.toString();
  } catch {
    return String(src || '').trim().replace(/[()'!*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  }
}

function tryAvplay(operation, label) {
  try {
    operation();
  } catch (error) {
    console.warn(`AVPlay ${label} no disponible:`, error);
  }
}

function configureBuffering(av, src, bufferConfig = DEFAULT_BUFFER_CONFIG) {
  tryAvplay(() => av.setTimeoutForBuffering?.(10), 'setTimeoutForBuffering');
  const playBufferSeconds = Math.max(4, Math.ceil((bufferConfig.bufferForPlaybackMs || 2500) / 1000));
  const resumeBufferSeconds = Math.max(4, Math.ceil((bufferConfig.bufferForPlaybackAfterRebufferMs || 5000) / 1000));
  tryAvplay(
    () => av.setBufferingParam?.('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', playBufferSeconds),
    'PLAYER_BUFFER_FOR_PLAY',
  );
  tryAvplay(
    () => av.setBufferingParam?.('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', resumeBufferSeconds),
    'PLAYER_BUFFER_FOR_RESUME',
  );

  if (isAdaptiveStream(src)) {
    tryAvplay(
      () => av.setStreamingProperty?.('ADAPTIVE_INFO', 'STARTBITRATE=AVERAGE|SKIPBITRATE=AVERAGE'),
      'ADAPTIVE_INFO',
    );
  }
}

function configureUserAgent(av, userAgent) {
  const value = String(userAgent || '').trim();
  if (!value) return;
  tryAvplay(() => av.setStreamingProperty?.('USER_AGENT', value), 'USER_AGENT');
}

const TizenAvPlayer = forwardRef(function TizenAvPlayer({
  src,
  sourceInfo,
  onUnsupported,
  onBack: onPlayerBack,
  onChannelUp,
  onChannelDown,
  channelNavigationEnabled = false,
  controls = true,
  showBackButton = true,
  overlay,
  primaryColor = '#e50914',
  locale = 'en',
  controlsAutoHideDelay = 5000,
  maxRetries = 5,
  retryDelayMs = 3000,
  live = false,
  autoPlay = true,
  paused = false,
  initialTime = 0,
  seekStep = 10,
  forwardStep = seekStep,
  rewindStep = seekStep,
  longSeekStep = 60,
  fullscreen: defaultFullscreen = false,
  fullscreenAutorotate = true,
  fullscreenOrientation = 'all',
  headers,
  userAgent,
  bufferConfig,
  contentStartTime,
  currentPlaybackTime,
  disableDisconnectError = false,
  disableFocus = false,
  drm,
  muted: mutedProp = false,
  playInBackground = false,
  playWhenInactive = false,
  poster,
  posterResizeMode = 'contain',
  preferredForwardBufferDuration,
  preventsDisplaySleepDuringVideoPlayback = true,
  progressUpdateInterval = 500,
  renderLoader,
  repeat = false,
  resizeMode: resizeModeProp = 'contain',
  selectedAudioTrack,
  selectedTextTrack,
  selectedVideoTrack,
  shutterColor = '#000',
  volume: volumeProp = 1,
  rate: rateProp = 1,
  subtitleColor = '#fff',
  subtitleFontSize = '34px',
  subtitleBackgroundColor = 'rgba(0,0,0,.62)',
  onReady,
  onProgress,
  onPlay,
  onPause,
  onEnded,
  onError,
  onLoadStart,
  onLoad,
  onEnd,
  onBuffer,
  onSeek,
  onReadyForDisplay,
  onPlaybackStateChanged,
  onPlaybackRateChange,
  onVolumeChange,
  onResizeModeChange,
  onAudioTracks,
  onTextTracks,
  onVideoTracks,
  onTextTrackDataChanged,
  onFullscreenPlayerWillPresent,
  onFullscreenPlayerDidPresent,
  onFullscreenPlayerWillDismiss,
  onFullscreenPlayerDidDismiss,
}, ref) {
  const resolvedForwardStep = normalizeSeekStep(forwardStep);
  const resolvedRewindStep = normalizeSeekStep(rewindStep);
  const maxRetryAttempts = normalizeRetryCount(maxRetries);
  const retryDelay = normalizeRetryDelay(retryDelayMs);
  const frameRef = useRef(null);
  const objectRef = useRef(null);
  const timerRef = useRef(null);
  const avRef = useRef(null);
  const seekTimerRef = useRef(null);
  const prepareTimerRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const playingRef = useRef(false);
  const callbacksRef = useRef({});
  const optionsRef = useRef({});
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const rateRef = useRef(Number(rateProp) || 1);
  const audioTracksRef = useRef([]);
  const subtitleTracksRef = useRef([]);
  const selectedAudioRef = useRef('');
  const selectedSubtitleRef = useRef('');
  const mkvSubtitleMetadataRef = useRef([]);
  const readyForDisplayRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const naturalVideoSizeRef = useRef({ width: 0, height: 0 });

  const [status, setStatus] = useState('idle');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [bufferingPercent, setBufferingPercent] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [playbackSrc, setPlaybackSrc] = useState(src);
  const [retrySequence, setRetrySequence] = useState(0);
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [mkvSubtitleMetadata, setMkvSubtitleMetadata] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState('');
  const [selectedSubtitle, setSelectedSubtitle] = useState('');
  const subtitleEnabledRef = useRef(false);
  const [subtitleText, setSubtitleText] = useState('');
  const [scrub, setScrub] = useState(null);
  const [fullscreen, setFullscreen] = useState(Boolean(defaultFullscreen));
  const fullscreenRef = useRef(false);
  const controlsOverlayVisibleRef = useRef(true);
  const settingsStateRef = useRef({ open: false, panel: null });
  const [controlsOverlayVisible, setControlsOverlayVisible] = useState(true);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [controlsHideSignal, setControlsHideSignal] = useState(0);
  const [settingsBackSignal, setSettingsBackSignal] = useState(0);
  const [currentResizeMode, setCurrentResizeMode] = useState(() => normalizeResizeMode(resizeModeProp));
  const {
    appearance: subtitleAppearance,
    styles: subtitleStyles,
    updateAppearance: updateSubtitleAppearance,
  } = useSubtitleAppearance({
    subtitleColor,
    subtitleFontSize,
    subtitleBackgroundColor,
  });
  const playerLayout = usePlayerLayout(frameRef);
  const responsiveSubtitleStyles = useMemo(
    () => getResponsiveSubtitleStyles(subtitleStyles, playerLayout),
    [playerLayout, subtitleStyles],
  );

  const clearPrepareTimer = useCallback(() => {
    if (!prepareTimerRef.current) return;
    window.clearTimeout(prepareTimerRef.current);
    prepareTimerRef.current = null;
  }, []);

  callbacksRef.current = {
    onReady,
    onProgress,
    onPlay,
    onPause,
    onEnded,
    onError,
    onLoadStart,
    onLoad,
    onEnd,
    onBuffer,
    onSeek,
    onReadyForDisplay,
    onPlaybackStateChanged,
    onPlaybackRateChange,
    onVolumeChange,
    onResizeModeChange,
    onAudioTracks,
    onTextTracks,
    onVideoTracks,
    onTextTrackDataChanged,
    onFullscreenPlayerWillPresent,
    onFullscreenPlayerDidPresent,
    onFullscreenPlayerWillDismiss,
    onFullscreenPlayerDidDismiss,
  };
  optionsRef.current = {
    autoPlay,
    paused,
    initialTime,
    repeat,
    mutedProp,
    volumeProp,
    rateProp,
    resizeMode: currentResizeMode,
    sourceInfo,
  };
  currentTimeRef.current = currentTime;
  durationRef.current = duration;
  playingRef.current = playing;
  rateRef.current = Number(rateProp) || 1;
  audioTracksRef.current = audioTracks;
  subtitleTracksRef.current = mergeSubtitleMetadata(subtitleTracks, mkvSubtitleMetadata);
  selectedAudioRef.current = selectedAudio;
  selectedSubtitleRef.current = selectedSubtitle;
  mkvSubtitleMetadataRef.current = mkvSubtitleMetadata;
  const mergedBufferConfig = useMemo(
    () => getMergedBufferConfig(bufferConfig, sourceInfo),
    [bufferConfig, sourceInfo],
  );
  const requestHeaders = useMemo(() => sanitizeRequestHeaders(headers || sourceInfo?.headers), [headers, sourceInfo]);
  const playbackUserAgent = String(userAgent || sourceInfo?.userAgent || '').trim();
  const posterInfo = useMemo(() => getPosterSource(poster, sourceInfo), [poster, sourceInfo]);
  const posterFit = resizeModeToObjectFit(posterInfo?.resizeMode || posterResizeMode);
  const hasCustomLoader = Boolean(renderLoader);
  const autoContinueActive = Boolean(overlay?.autoContinue?.visible || overlay?.segmentAction?.visible || overlay?.skipSegment?.visible);

  useEffect(() => {
    retryCountRef.current = 0;
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    naturalVideoSizeRef.current = { width: 0, height: 0 };
    setHasLoaded(false);
    setRetryAttempt(0);
    setPlaybackSrc(src);
  }, [src]);

  useEffect(() => {
    const controller = new AbortController();
    setMkvSubtitleMetadata([]);

    readMkvSubtitleMetadata(src, controller.signal, requestHeaders)
      .then((tracks) => {
        if (!controller.signal.aborted) setMkvSubtitleMetadata(tracks);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMkvSubtitleMetadata([]);
      });

    return () => controller.abort();
  }, [requestHeaders, src]);

  useEffect(() => {
    fullscreenRef.current = fullscreen;
  }, [fullscreen]);

  const updateDisplayRect = useCallback(() => {
    const av = avRef.current;
    const frame = frameRef.current;
    if (!av || !frame) return;

    const object = objectRef.current;
    const rect = frame.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 1920;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 1080;
    const screenSize = getAvplayScreenSize();
    const sx = screenSize.width / viewportWidth;
    const sy = screenSize.height / viewportHeight;
    const visibleLeft = Math.max(0, rect.left);
    const visibleTop = Math.max(0, rect.top);
    const visibleRight = Math.min(viewportWidth, rect.right);
    const visibleBottom = Math.min(viewportHeight, rect.bottom);
    const visibleWidth = Math.max(1, visibleRight - visibleLeft);
    const visibleHeight = Math.max(1, visibleBottom - visibleTop);
    const baseDisplayRect = fullscreenRef.current
      ? { x: 0, y: 0, width: screenSize.width, height: screenSize.height }
      : {
        x: Math.max(0, Math.round(visibleLeft * sx)),
        y: Math.max(0, Math.round(visibleTop * sy)),
        width: Math.min(screenSize.width, Math.round(visibleWidth * sx)),
        height: Math.min(screenSize.height, Math.round(visibleHeight * sy)),
      };
    const baseObjectRect = fullscreenRef.current
      ? {
        x: 0,
        y: 0,
        width: viewportWidth,
        height: viewportHeight,
      }
      : {
        x: Math.max(0, visibleLeft - rect.left),
        y: Math.max(0, visibleTop - rect.top),
        width: visibleWidth,
        height: visibleHeight,
      };
    const currentMode = normalizeResizeMode(optionsRef.current.resizeMode);
    const latestVideoSize = readAvplayVideoSize(av);
    if (latestVideoSize.width && latestVideoSize.height) {
      naturalVideoSizeRef.current = latestVideoSize;
    }
    const naturalVideoSize = naturalVideoSizeRef.current;
    const displayRect = getResizeDisplayRect(baseDisplayRect, naturalVideoSize, currentMode, { clamp: true });
    const objectRect = getResizeDisplayRect(baseObjectRect, naturalVideoSize, currentMode);
    const displayMethod = currentMode === 'contain'
      ? 'PLAYER_DISPLAY_MODE_LETTER_BOX'
      : 'PLAYER_DISPLAY_MODE_FULL_SCREEN';

    try {
      if (object) {
        object.style.left = `${objectRect.x}px`;
        object.style.top = `${objectRect.y}px`;
        object.style.width = `${objectRect.width}px`;
        object.style.height = `${objectRect.height}px`;
      }
      av.setDisplayMethod?.(displayMethod);
      av.setDisplayRect(
        displayRect.x,
        displayRect.y,
        displayRect.width,
        displayRect.height,
      );
    } catch (displayError) {
      console.warn('No se pudo actualizar setDisplayRect:', displayError);
    }
  }, []);

  useEffect(() => {
    setCurrentResizeMode(normalizeResizeMode(resizeModeProp));
  }, [resizeModeProp]);

  useEffect(() => {
    updateDisplayRect();
  }, [currentResizeMode, updateDisplayRect]);

  useEffect(() => {
    updateDisplayRect();
  }, [playerLayout.height, playerLayout.width, updateDisplayRect]);

  const setResizeMode = useCallback((nextResizeMode) => {
    const normalizedResizeMode = normalizeResizeMode(nextResizeMode);
    optionsRef.current = {
      ...optionsRef.current,
      resizeMode: normalizedResizeMode,
    };
    setCurrentResizeMode(normalizedResizeMode);
    requestAnimationFrame(updateDisplayRect);
    window.setTimeout(updateDisplayRect, 80);
    callbacksRef.current.onResizeModeChange?.(normalizedResizeMode);
    return normalizedResizeMode;
  }, [updateDisplayRect]);

  const toggleResizeMode = useCallback(() => {
    const nextResizeMode = getNextResizeMode(currentResizeMode);
    return setResizeMode(nextResizeMode);
  }, [currentResizeMode, setResizeMode]);

  const refreshTracks = useCallback(() => {
    const av = avRef.current;
    if (!av) return;
    try {
      const rawTracks = av.getTotalTrackInfo();
      console.info('AVPlay track info:', rawTracks);
      const normalized = normalizeTracks(rawTracks);
      const current = av.getCurrentStreamInfo?.() || [];
      const videoSize = getVideoSizeFromStreamInfo(current);
      const fallbackVideoSize = videoSize.width && videoSize.height
        ? videoSize
        : getVideoSizeFromStreamInfo(rawTracks);
      const currentAudio = current.find((track) => track.type === 'AUDIO');
      const currentText = current.find((track) => track.type === 'TEXT');
      const currentVideo = current.find((track) => track.type === 'VIDEO') || rawTracks.find((track) => track.type === 'VIDEO');
      const nextSelectedAudio = currentAudio ? String(currentAudio.index) : selectedAudioRef.current;
      const nextSelectedSubtitle = currentText ? String(currentText.index) : selectedSubtitleRef.current;
      if (fallbackVideoSize.width && fallbackVideoSize.height) {
        naturalVideoSizeRef.current = fallbackVideoSize;
      }

      setAudioTracks((currentList) => {
        const next = mergeTrackLists(currentList, normalized.audio);
        audioTracksRef.current = next;
        emitPlayerEvent(callbacksRef, 'onAudioTracks', {
          audioTracks: mapAudioTracks(next, nextSelectedAudio),
        });
        return next;
      });
      setSubtitleTracks((currentList) => {
        const next = mergeTrackLists(currentList, normalized.subtitles);
        const eventTracks = mergeSubtitleMetadata(next, mkvSubtitleMetadataRef.current);
        subtitleTracksRef.current = eventTracks;
        emitPlayerEvent(callbacksRef, 'onTextTracks', {
          textTracks: mapTextTracks(eventTracks, nextSelectedSubtitle),
        });
        return next;
      });

      if (currentAudio) {
        selectedAudioRef.current = String(currentAudio.index);
        setSelectedAudio(String(currentAudio.index));
      }
      if (currentText) {
        selectedSubtitleRef.current = String(currentText.index);
        setSelectedSubtitle(String(currentText.index));
      }
      emitPlayerEvent(callbacksRef, 'onVideoTracks', {
        videoTracks: mapVideoTracks([{
          index: currentVideo?.index ?? 0,
          trackId: currentVideo?.extra_info ? `avplay-${currentVideo.index}` : 'avplay',
          codecs: safeJson(currentVideo?.extra_info, {}).fourCC || '',
          width: fallbackVideoSize.width || naturalVideoSizeRef.current.width || 0,
          height: fallbackVideoSize.height || naturalVideoSizeRef.current.height || 0,
          selected: true,
        }], currentVideo?.index ?? 0),
      });
      updateDisplayRect();
    } catch (trackError) {
      console.warn('No se pudieron leer las pistas AVPlay:', trackError);
    }
  }, [updateDisplayRect]);

  const getCurrentSeconds = useCallback(() => {
    const av = avRef.current;
    if (!av) return pendingSeekRef.current ?? currentTimeRef.current;
    try {
      return (av.getCurrentTime?.() || 0) / 1000;
    } catch {
      return pendingSeekRef.current ?? currentTimeRef.current;
    }
  }, []);

  const clampSeekTarget = useCallback((seconds) => {
    const value = Number(seconds) || 0;
    const max = durationRef.current || value;
    return Math.max(0, Math.min(value, max));
  }, []);

  const readTime = useCallback(() => {
    const av = avRef.current;
    if (!av) return;
    try {
      const nextTime = (av.getCurrentTime?.() || 0) / 1000;
      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      const total = (av.getDuration?.() || 0) / 1000;
      if (total) {
        durationRef.current = total;
        setDuration(total);
      }
      emitPlayerEvent(callbacksRef, 'onProgress', {
        currentTime: nextTime,
        playableDuration: total || durationRef.current,
        seekableDuration: total || durationRef.current,
        duration: total || durationRef.current,
      });
    } catch {
      // Ignore transient AVPlay state errors.
    }
  }, []);

  const play = useCallback(() => {
    const av = avRef.current;
    if (!av) return;
    try {
      const state = av.getState?.();
      if (state === 'READY' || state === 'PAUSED') {
        av.play();
        playingRef.current = true;
        setPlaying(true);
        emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: true, isSeeking: false }));
        emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', { playbackRate: Number(rateRef.current) || 1 });
        callbacksRef.current.onPlay?.();
      } else if (state === 'PLAYING') {
        playingRef.current = true;
        setPlaying(true);
      }
    } catch (playError) {
      setError(playError.message || String(playError));
      emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(playError));
    }
  }, []);

  const pause = useCallback(() => {
    const av = avRef.current;
    if (!av) return;
    try {
      if (av.getState?.() === 'PLAYING') {
        av.pause();
        playingRef.current = false;
        setPlaying(false);
        emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: false, isSeeking: false }));
        emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', { playbackRate: 0 });
        callbacksRef.current.onPause?.();
      }
    } catch (pauseError) {
      setError(pauseError.message || String(pauseError));
      emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(pauseError));
    }
  }, []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  const stop = useCallback(() => {
    const av = avRef.current;
    if (!av) return;
    try {
      if (['PLAYING', 'PAUSED', 'READY'].includes(av.getState?.())) av.stop();
      setPlaying(false);
      currentTimeRef.current = 0;
      pendingSeekRef.current = null;
      setCurrentTime(0);
      setSubtitleText('');
    } catch (stopError) {
      console.warn(stopError);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!frameRef.current) return;
    setFullscreen((value) => !value);
    if (!document.fullscreenElement) {
      emitPlayerEvent(callbacksRef, 'onFullscreenPlayerWillPresent');
      const requestPromise = frameRef.current.requestFullscreen?.();
      requestPromise
        ?.then?.(() => {
          emitPlayerEvent(callbacksRef, 'onFullscreenPlayerDidPresent');
          if (fullscreenAutorotate && fullscreenOrientation !== 'all') {
            window.screen?.orientation?.lock?.(fullscreenOrientation).catch(() => {});
          }
        })
        ?.catch?.(() => {});
    } else {
      emitPlayerEvent(callbacksRef, 'onFullscreenPlayerWillDismiss');
      const exitPromise = document.exitFullscreen?.();
      exitPromise
        ?.then?.(() => emitPlayerEvent(callbacksRef, 'onFullscreenPlayerDidDismiss'))
        ?.catch?.(() => {});
    }
    requestAnimationFrame(updateDisplayRect);
    setTimeout(updateDisplayRect, 120);
    setTimeout(updateDisplayRect, 350);
  }, [fullscreenAutorotate, fullscreenOrientation, updateDisplayRect]);

  const seekTo = useCallback((seconds) => {
    const av = avRef.current;
    if (!av) return Promise.resolve(0);
    const target = clampSeekTarget(seconds);
    pendingSeekRef.current = target;
    currentTimeRef.current = target;
    setCurrentTime(target);
    setSubtitleText('');
    emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: playingRef.current, isSeeking: true }));

    return new Promise((resolve) => {
      try {
        av.seekTo(
          Math.round(target * 1000),
          () => {
            pendingSeekRef.current = null;
            currentTimeRef.current = target;
            setCurrentTime(target);
            emitPlayerEvent(callbacksRef, 'onSeek', createSeekPayload(target, target));
            emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: playingRef.current, isSeeking: false }));
            emitPlayerEvent(callbacksRef, 'onProgress', {
              currentTime: target,
              playableDuration: durationRef.current,
              seekableDuration: durationRef.current,
              duration: durationRef.current,
            });
            resolve(target);
          },
          (seekError) => {
            pendingSeekRef.current = null;
            const message = seekError?.message || String(seekError);
            setError(message);
            emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(seekError || new Error(message)));
            resolve(getCurrentSeconds());
          },
        );
      } catch (seekError) {
        pendingSeekRef.current = null;
        const message = seekError.message || String(seekError);
        setError(message);
        emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(seekError));
        resolve(getCurrentSeconds());
      }
    });
  }, [clampSeekTarget, getCurrentSeconds]);

  const queueSeekTo = useCallback((seconds) => {
    const target = clampSeekTarget(seconds);
    pendingSeekRef.current = target;
    currentTimeRef.current = target;
    setCurrentTime(target);
    setSubtitleText('');
    if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
    seekTimerRef.current = window.setTimeout(() => {
      const pending = pendingSeekRef.current;
      if (pending !== null) seekTo(pending);
    }, 90);
    return target;
  }, [clampSeekTarget, seekTo]);

  const jumpBy = useCallback((deltaSeconds) => {
    const delta = Number(deltaSeconds) || 0;
    if (delta === 0) return 0;
    const base = pendingSeekRef.current ?? getCurrentSeconds();
    return queueSeekTo(base + delta);
  }, [getCurrentSeconds, queueSeekTo]);

  const selectAudio = useCallback((trackIndex) => {
    const av = avRef.current;
    if (!av) return;
    const index = Number(trackIndex);
    try {
      if (av.getState?.() !== 'PLAYING') play();
      setTimeout(() => {
        try {
          av.setSelectTrack('AUDIO', index);
          selectedAudioRef.current = String(index);
          setSelectedAudio(String(index));
          emitPlayerEvent(callbacksRef, 'onAudioTracks', {
            audioTracks: mapAudioTracks(audioTracksRef.current, index),
          });
        } catch (trackError) {
          setError(trackError.message || String(trackError));
          emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(trackError));
        }
      }, 60);
    } catch (trackError) {
      setError(trackError.message || String(trackError));
      emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(trackError));
    }
  }, [play]);

  const selectSubtitle = useCallback((trackIndex) => {
    const av = avRef.current;
    if (!av) return;
    if (trackIndex === '') {
      subtitleEnabledRef.current = false;
      selectedSubtitleRef.current = '';
      setSelectedSubtitle('');
      setSubtitleText('');
      emitPlayerEvent(callbacksRef, 'onTextTracks', {
        textTracks: mapTextTracks(subtitleTracksRef.current, -1),
      });
      return;
    }
    const index = Number(trackIndex);
    try {
      av.setSelectTrack('TEXT', index);
      subtitleEnabledRef.current = true;
      selectedSubtitleRef.current = String(index);
      setSelectedSubtitle(String(index));
      emitPlayerEvent(callbacksRef, 'onTextTracks', {
        textTracks: mapTextTracks(subtitleTracksRef.current, index),
      });
    } catch (trackError) {
      setError(trackError.message || String(trackError));
      emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(trackError));
    }
  }, []);

  useImperativeHandle(ref, () => ({
    play,
    pause,
    toggle,
    stop,
    seekTo,
    jumpBy,
    getCurrentTime: getCurrentSeconds,
    getDuration: () => duration,
    selectAudio,
    selectSubtitle,
    requestFullscreen: toggleFullscreen,
    setResizeMode,
    toggleResizeMode,
    getResizeMode: () => currentResizeMode,
  }), [
    currentResizeMode,
    duration,
    getCurrentSeconds,
    jumpBy,
    pause,
    play,
    seekTo,
    selectAudio,
    selectSubtitle,
    setResizeMode,
    stop,
    toggle,
    toggleFullscreen,
    toggleResizeMode,
  ]);

  const retryWithHttpFallback = useCallback((reason) => {
    const fallback = getHttpFallbackUrl(playbackSrc);
    if (!fallback || fallback === playbackSrc) return false;

    console.warn('AVPlay falló con HTTPS en puerto personalizado; reintentando por HTTP.', {
      reason,
      src: playbackSrc,
      fallback,
    });
    setError('');
    setPlaybackSrc(fallback);
    return true;
  }, [playbackSrc]);

  useEffect(() => {
    if (!playbackSrc) return undefined;
    if (!isSamsungTizen()) {
      onUnsupported?.();
      return undefined;
    }

    let disposed = false;
    const scheduleRetry = () => {
      if (retryCountRef.current >= maxRetryAttempts || retryTimerRef.current) return false;
      retryCountRef.current += 1;
      setRetryAttempt(retryCountRef.current);
      setError('');
      setLoadingMessage('Reintentando reproducción...');
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        if (!disposed) setRetrySequence((value) => value + 1);
      }, retryDelay);
      return true;
    };
    document.body.classList.add('tizen-avplay-active');
    const av = getAvplay();
    avRef.current = av;
    setStatus('loading');
    setLoadingMessage('Abriendo AVPlay...');
    setBuffering(false);
    setBufferingPercent(null);
    setError('');
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setSelectedAudio('');
    subtitleEnabledRef.current = false;
    setSelectedSubtitle('');
    setSubtitleText('');
    currentTimeRef.current = 0;
    durationRef.current = 0;
    audioTracksRef.current = [];
    subtitleTracksRef.current = [];
    selectedAudioRef.current = '';
    selectedSubtitleRef.current = '';
    readyForDisplayRef.current = false;
    emitPlayerEvent(callbacksRef, 'onLoadStart', createLoadStartPayload(playbackSrc, ''));

    let prepared = false;
    const finishPrepared = () => {
      if (disposed || prepared) return;
      let playerState = '';
      try {
        playerState = av.getState?.() || '';
      } catch {
        return;
      }
      if (!['READY', 'PLAYING', 'PAUSED'].includes(playerState)) return;
      prepared = true;
      setHasLoaded(true);
      retryCountRef.current = 0;
      setRetryAttempt(0);
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      clearPrepareTimer();
      try {
        updateDisplayRect();
        const loadedDuration = (av.getDuration?.() || 0) / 1000;
        const loadedVideoSize = naturalVideoSizeRef.current;
        const videoTracksPayload = mapVideoTracks([{
          index: 0,
          trackId: loadedVideoSize.width && loadedVideoSize.height
            ? `avplay-${loadedVideoSize.width}x${loadedVideoSize.height}`
            : 'avplay',
          width: loadedVideoSize.width || 0,
          height: loadedVideoSize.height || 0,
          selected: true,
        }], 0);
        durationRef.current = loadedDuration;
        setDuration(loadedDuration);
        refreshTracks();
        setStatus('ready');
        setLoadingMessage('');
        emitPlayerEvent(callbacksRef, 'onLoad', createLoadPayload({
          duration: loadedDuration,
          currentTime: 0,
          audioTracks: mapAudioTracks(audioTracksRef.current, selectedAudioRef.current),
          textTracks: mapTextTracks(subtitleTracksRef.current, selectedSubtitleRef.current),
          videoTracks: videoTracksPayload,
          width: loadedVideoSize.width || 0,
          height: loadedVideoSize.height || 0,
          trackId: videoTracksPayload[0]?.trackId || 'avplay',
        }), ['onReady']);
        emitPlayerEvent(callbacksRef, 'onVideoTracks', {
          videoTracks: videoTracksPayload,
        });
        emitPlayerEvent(callbacksRef, 'onReadyForDisplay');
        readyForDisplayRef.current = true;
        tryAvplay(() => av.setVolume?.(
          mutedProp ? 0 : Math.round(Math.max(0, Math.min(1, Number(volumeProp) || 0)) * 100),
          mutedProp ? 0 : Math.round(Math.max(0, Math.min(1, Number(volumeProp) || 0)) * 100),
        ), 'setVolume');
        tryAvplay(() => av.setSpeed?.(Number(rateProp) || 1), 'setSpeed');
        emitPlayerEvent(callbacksRef, 'onVolumeChange', {
          volume: mutedProp ? 0 : Math.max(0, Math.min(1, Number(volumeProp) || 0)),
          muted: Boolean(mutedProp),
        });
        emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', {
          playbackRate: optionsRef.current.paused ? 0 : Number(rateRef.current) || 1,
        });
        const start = getStartSeconds(optionsRef.current.sourceInfo, optionsRef.current.initialTime);
        if (start > 0) {
          seekTo(start).then(() => {
            if (!optionsRef.current.autoPlay || optionsRef.current.paused) return;
            play();
          });
        } else if (optionsRef.current.autoPlay && !optionsRef.current.paused) {
          play();
        }
        refreshTracks();
        requestAnimationFrame(updateDisplayRect);
        window.setTimeout(updateDisplayRect, 250);
        window.setTimeout(refreshTracks, 500);
        window.setTimeout(refreshTracks, 1500);
        window.setTimeout(refreshTracks, 3000);
      } catch (readyError) {
        if (scheduleRetry()) {
          tryAvplay(() => av.close(), 'close before retry');
          return;
        }
        setRetryAttempt(0);
        const message = readyError.message || String(readyError);
        setLoadingMessage(getSafePlaybackErrorMessage(readyError, locale));
        setError(message);
        emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(readyError));
        setStatus('error');
      }
    };

    const recoverIfReady = () => {
      if (disposed || prepared) return;
      try {
        if (['READY', 'PLAYING', 'PAUSED'].includes(av.getState?.())) finishPrepared();
      } catch {
        // Ignore transient AVPlay state errors.
      }
    };

    try {
      try {
        av.close();
      } catch {
        // NONE state is fine.
      }

      const listener = {
        onbufferingstart() {
          setLoadingMessage('Buffering inicial...');
          setBuffering(true);
          setBufferingPercent(0);
          emitPlayerEvent(callbacksRef, 'onBuffer', { isBuffering: true });
        },
        onbufferingprogress(percent) {
          setBufferingPercent(Math.max(0, Math.min(100, Number(percent) || 0)));
        },
        onbufferingcomplete() {
          retryCountRef.current = 0;
          setRetryAttempt(0);
          setLoadingMessage('');
          setBuffering(false);
          setBufferingPercent(null);
          emitPlayerEvent(callbacksRef, 'onBuffer', { isBuffering: false });
          updateDisplayRect();
          refreshTracks();
          finishPrepared();
          recoverIfReady();
          if (!readyForDisplayRef.current) {
            readyForDisplayRef.current = true;
            emitPlayerEvent(callbacksRef, 'onReadyForDisplay');
          }
        },
        oncurrentplaytime(milliseconds) {
          const nextTime = milliseconds / 1000;
          currentTimeRef.current = nextTime;
          setCurrentTime(nextTime);
        },
        onevent(eventId, eventData) {
          if (eventId !== 'PLAYER_MSG_RESOLUTION_CHANGED') return;
          const eventSize = getVideoSizeFromExtraInfo(eventData);
          const nextSize = eventSize.width && eventSize.height ? eventSize : readAvplayVideoSize(av);
          if (nextSize.width && nextSize.height) naturalVideoSizeRef.current = nextSize;
          updateDisplayRect();
          refreshTracks();
        },
        onstreamcompleted() {
          setPlaying(false);
          const total = (av.getDuration?.() || 0) / 1000;
          currentTimeRef.current = total;
          setCurrentTime(total);
          emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: false, isSeeking: false }));
          emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', { playbackRate: 0 });
          emitPlayerEvent(callbacksRef, 'onEnd', undefined, ['onEnded']);
          if (optionsRef.current.repeat) {
            seekTo(0).then(() => {
              if (!optionsRef.current.paused) play();
            });
          }
        },
        onerror(code) {
          clearPrepareTimer();
          if (retryWithHttpFallback(code)) return;
          if (scheduleRetry()) return;
          setRetryAttempt(0);
          if (!disableDisconnectError) setError(`AVPlay: ${code}`);
          setLoadingMessage(getSafePlaybackErrorMessage(new Error(`AVPlay: ${code}`), locale));
          setStatus('error');
          setBuffering(false);
          setBufferingPercent(null);
          setPlaying(false);
          emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: false, isSeeking: false }));
          emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', { playbackRate: 0 });
          emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(new Error(`AVPlay: ${code}`)));
        },
        onerrormsg(code, message) {
          const detail = message ? `AVPlay: ${code} ${message}` : `AVPlay: ${code}`;
          if (scheduleRetry()) return;
          setRetryAttempt(0);
          if (!disableDisconnectError) setError(detail);
          setLoadingMessage(getSafePlaybackErrorMessage(new Error(detail), locale));
          setStatus('error');
          emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(new Error(detail)));
        },
        ondrmevent() {},
        onsubtitlechange(durationMs, text) {
          if (!subtitleEnabledRef.current) return;
          const normalized = normalizeSubtitleText(text || '');
          setSubtitleText(normalized);
          emitPlayerEvent(callbacksRef, 'onTextTrackDataChanged', { subtitleTracks: normalized });
          if (normalized && durationMs > 0) {
            const value = normalized;
            window.setTimeout(() => {
              setSubtitleText((current) => current === value ? '' : current);
            }, durationMs);
          }
        },
      };

      const avplaySrc = getAvplayUrl(playbackSrc);
      setLoadingMessage(avplaySrc === playbackSrc ? 'Preparando AVPlay...' : 'Preparando AVPlay con URL codificada...');
      av.open(avplaySrc);
      configureUserAgent(av, playbackUserAgent);
      configureBuffering(av, avplaySrc, {
        ...mergedBufferConfig,
        maxBufferMs: preferredForwardBufferDuration
          ? Math.max(mergedBufferConfig.maxBufferMs, preferredForwardBufferDuration * 1000)
          : mergedBufferConfig.maxBufferMs,
      });
      av.setListener(listener);
      updateDisplayRect();
      window.setTimeout(updateDisplayRect, 80);

      clearPrepareTimer();
      prepareTimerRef.current = window.setTimeout(() => {
        if (disposed) return;
        const message = `AVPlay no respondió al preparar ${playbackSrc}`;
        if (scheduleRetry()) {
          tryAvplay(() => av.close(), 'close after prepare timeout');
          return;
        }
        setRetryAttempt(0);
        setError(message);
        setLoadingMessage(getSafePlaybackErrorMessage(new Error(message), locale));
        setStatus('error');
        setBuffering(false);
        setBufferingPercent(null);
        setPlaying(false);
        emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(new Error(message)));
        tryAvplay(() => av.close(), 'close after prepare timeout');
      }, 30000);

      av.prepareAsync(
        finishPrepared,
        (prepareError) => {
          if (disposed) return;
          clearPrepareTimer();
          if (retryWithHttpFallback(prepareError?.message || prepareError)) return;
          const message = prepareError?.message || `No se pudo preparar ${playbackSrc}`;
          if (scheduleRetry()) return;
          setRetryAttempt(0);
          setLoadingMessage(getSafePlaybackErrorMessage(prepareError || new Error(message), locale));
          setError(message);
          emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(prepareError || new Error(message)));
          setStatus('error');
        },
      );
      window.setTimeout(recoverIfReady, 1200);
      window.setTimeout(recoverIfReady, 3000);
      window.setTimeout(recoverIfReady, 7000);
    } catch (loadError) {
      clearPrepareTimer();
      if (retryWithHttpFallback(loadError.message || loadError)) return undefined;
      const message = loadError.message || String(loadError);
      if (scheduleRetry()) return undefined;
      setRetryAttempt(0);
      setLoadingMessage(getSafePlaybackErrorMessage(loadError, locale));
      setError(message);
      emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(loadError));
      setStatus('error');
    }

    timerRef.current = window.setInterval(readTime, Math.max(100, Number(progressUpdateInterval) || 500));
    window.addEventListener('resize', updateDisplayRect);

    return () => {
      disposed = true;
      document.body.classList.remove('tizen-avplay-active');
      window.removeEventListener('resize', updateDisplayRect);
      clearPrepareTimer();
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
      seekTimerRef.current = null;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      pendingSeekRef.current = null;
      try {
        av.close();
      } catch {
        // Ignore.
      }
      avRef.current = null;
    };
  }, [
    contentStartTime,
    clearPrepareTimer,
    currentPlaybackTime,
    disableDisconnectError,
    mergedBufferConfig,
    mutedProp,
    onUnsupported,
    playbackSrc,
    playbackUserAgent,
    play,
    preferredForwardBufferDuration,
    progressUpdateInterval,
    maxRetryAttempts,
    retryDelay,
    retrySequence,
    rateProp,
    readTime,
    refreshTracks,
    retryWithHttpFallback,
    seekTo,
    updateDisplayRect,
    volumeProp,
  ]);

  const closePlayer = useCallback(() => {
    if (onPlayerBack) {
      onPlayerBack();
      return;
    }

    try {
      window.tizen.application.getCurrentApplication().exit();
    } catch {
      window.history.back();
    }
  }, [onPlayerBack]);

  const onBack = useCallback(() => {
    if (fullscreen || document.fullscreenElement) {
      setFullscreen(false);
      const exitPromise = document.exitFullscreen?.();
      exitPromise?.catch?.(() => {});
      setTimeout(updateDisplayRect, 120);
      return;
    }
    closePlayer();
  }, [closePlayer, fullscreen, updateDisplayRect]);

  const handleControlsVisibility = useCallback((visible) => {
    controlsOverlayVisibleRef.current = visible;
    setControlsOverlayVisible(visible);
  }, []);

  const handleSettingsStateChange = useCallback((state) => {
    settingsStateRef.current = state;
    setSettingsMenuOpen(Boolean(state?.open));
  }, []);

  const handleRemoteBack = useCallback(() => {
    if (autoContinueActive) {
      onBack();
      return;
    }
    if (settingsStateRef.current.open) {
      setSettingsBackSignal((value) => value + 1);
      return;
    }
    if (controls && hasLoaded && controlsOverlayVisibleRef.current) {
      setControlsHideSignal((value) => value + 1);
      return;
    }

    if (onPlayerBack) {
      onPlayerBack();
      return;
    }

    onBack();
  }, [autoContinueActive, controls, hasLoaded, onBack, onPlayerBack]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
      setTimeout(updateDisplayRect, 80);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [updateDisplayRect]);

  useEffect(() => {
    requestAnimationFrame(updateDisplayRect);
    const first = setTimeout(updateDisplayRect, 120);
    const second = setTimeout(updateDisplayRect, 350);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [fullscreen, updateDisplayRect]);

  const displayed = scrub ?? currentTime;
  const mergedSubtitleTracks = useMemo(
    () => mergeSubtitleMetadata(subtitleTracks, mkvSubtitleMetadata),
    [mkvSubtitleMetadata, subtitleTracks],
  );
  const subtitleLanguageHints = useMemo(
    () => Array.from(new Set(mergedSubtitleTracks.map((track) => getTrackLanguageName(track)).filter(Boolean))),
    [mergedSubtitleTracks],
  );
  const audioOptions = useMemo(
    () => audioTracks.map((track, index) => ({
      ...track,
      label: buildTrackLabel({ ...track, languageHint: subtitleLanguageHints[index] }, index, 'audio'),
    })),
    [audioTracks, subtitleLanguageHints],
  );
  const subtitleOptions = useMemo(
    () => mergedSubtitleTracks.map((track, index) => ({
        ...track,
        label: buildTrackLabel(track, index, 'subtitle'),
      })),
    [mergedSubtitleTracks],
  );
  const selectedAudioLabel = audioOptions.find((track) => String(track.index) === selectedAudio)?.label
    || (audioOptions.length ? audioOptions[0].label : 'Audio');
  const selectedSubtitleLabel = selectedSubtitle === ''
    ? 'Desactivados'
    : subtitleOptions.find((track) => String(track.index) === selectedSubtitle)?.label || 'Subtítulos';
  const audioControlOptions = useMemo(
    () => audioOptions.map((track) => ({
      value: track.index,
      label: track.label,
    })),
    [audioOptions],
  );
  const subtitleControlOptions = useMemo(
    () => subtitleOptions.map((track) => ({
      value: track.index,
      label: track.label,
    })),
    [subtitleOptions],
  );

  const cycleAudio = useCallback(() => {
    if (!audioOptions.length) return;
    const currentIndex = audioOptions.findIndex((track) => String(track.index) === selectedAudio);
    const nextTrack = audioOptions[(currentIndex + 1 + audioOptions.length) % audioOptions.length];
    selectAudio(String(nextTrack.index));
  }, [audioOptions, selectAudio, selectedAudio]);

  const cycleSubtitle = useCallback(() => {
    const options = [{ index: '', label: 'Desactivados' }, ...subtitleOptions];
    if (options.length <= 1) return;
    const currentIndex = options.findIndex((track) => String(track.index) === selectedSubtitle);
    const nextTrack = options[(currentIndex + 1 + options.length) % options.length];
    selectSubtitle(String(nextTrack.index));
  }, [selectSubtitle, selectedSubtitle, subtitleOptions]);

  useEffect(() => {
    if (!avRef.current || status !== 'ready') return;
    if (paused) pause();
    else if (autoPlay) play();
  }, [autoPlay, pause, paused, play, status]);

  useEffect(() => {
    const volume = mutedProp ? 0 : Math.round(Math.max(0, Math.min(1, Number(volumeProp) || 0)) * 100);
    tryAvplay(() => avRef.current?.setVolume?.(volume, volume), 'setVolume');
    emitPlayerEvent(callbacksRef, 'onVolumeChange', {
      volume: mutedProp ? 0 : Math.max(0, Math.min(1, Number(volumeProp) || 0)),
      muted: Boolean(mutedProp),
    });
  }, [mutedProp, volumeProp]);

  useEffect(() => {
    const nextRate = Number(rateProp) || 1;
    rateRef.current = nextRate;
    tryAvplay(() => avRef.current?.setSpeed?.(nextRate), 'setSpeed');
    emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', {
      playbackRate: playing ? nextRate : 0,
    });
  }, [playing, rateProp]);

  useEffect(() => {
    const match = pickTrackBySelection(audioOptions, selectedAudioTrack, (track) => ({
      index: audioOptions.indexOf(track),
      id: track.index,
      language: track.language,
      name: track.name || track.label,
    }));
    if (match?.disabled) {
      tryAvplay(() => avRef.current?.setVolume?.(0, 0), 'setVolume');
      return;
    }
    if (match) selectAudio(match.index);
  }, [audioOptions, selectAudio, selectedAudioTrack]);

  useEffect(() => {
    const match = pickTrackBySelection(subtitleOptions, selectedTextTrack, (track) => ({
      index: subtitleOptions.indexOf(track),
      id: track.index,
      language: track.language,
      name: track.name || track.label,
    }));
    if (match?.disabled) {
      selectSubtitle('');
      return;
    }
    if (match) selectSubtitle(match.index);
  }, [selectSubtitle, selectedTextTrack, subtitleOptions]);

  useTvRemote({
    enabled: !disableFocus,
    channelNavigationEnabled: () => Boolean(!autoContinueActive && channelNavigationEnabled && fullscreen),
    onChannelUp,
    onChannelDown,
    onPlayPause: autoContinueActive ? undefined : toggle,
    onPlay: autoContinueActive ? undefined : play,
    onPause: autoContinueActive ? undefined : pause,
    onStop: autoContinueActive ? undefined : stop,
    onRewind: autoContinueActive ? undefined : () => jumpBy(-resolvedRewindStep),
    onFastForward: autoContinueActive ? undefined : () => jumpBy(resolvedForwardStep),
    onTrackPrevious: autoContinueActive ? undefined : () => jumpBy(-longSeekStep),
    onTrackNext: autoContinueActive ? undefined : () => jumpBy(longSeekStep),
    onAudioNext: autoContinueActive ? undefined : cycleAudio,
    onSubtitleNext: autoContinueActive ? undefined : cycleSubtitle,
    onFullscreen: autoContinueActive ? undefined : toggleFullscreen,
    onEnter: () => {
      if (autoContinueActive) return undefined;
      if (controls && !controlsOverlayVisibleRef.current) return false;
      return undefined;
    },
    onBack: handleRemoteBack,
  });

  return (
    <Paper
      elevation={8}
      sx={{
        overflow: 'hidden',
        bgcolor: 'transparent',
        border: '1px solid rgba(255,255,255,.08)',
        width: '100%',
        height: fullscreen ? '100vh' : '100%',
        maxHeight: fullscreen ? '100vh' : '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        ...(fullscreen ? {
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 9999,
          borderRadius: 0,
        } : null),
      }}
    >
      <Box
        ref={frameRef}
        className="tizen-video-frame"
        sx={{
          position: 'relative',
          bgcolor: shutterColor,
          overflow: 'hidden',
          width: '100%',
          height: '100%',
          flex: '1 1 auto',
          maxHeight: fullscreen ? '100vh' : '100%',
          minHeight: 0,
          ...(fullscreen ? {
            width: '100vw',
            height: '100vh',
          } : null),
        }}
      >
        <object
          id="av-player"
          ref={objectRef}
          type="application/avplayer"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            zIndex: 1,
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
            visibility: 'visible',
          }}
          aria-label="Samsung AVPlay video surface"
        />

        {posterInfo?.uri && !hasCustomLoader && !playing && status !== 'ready' && (
          <Box
            component="img"
            src={posterInfo.uri}
            alt=""
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 4,
              width: '100%',
              height: '100%',
              objectFit: posterFit,
              pointerEvents: 'none',
            }}
          />
        )}

        {subtitleText && (
          <Box
            sx={{
              position: 'absolute',
              left: '5%',
              right: '5%',
              bottom: controls && controlsOverlayVisible
                ? (settingsMenuOpen ? '24%' : '17%')
                : '6%',
              zIndex: 5,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              minHeight: 0,
              maxHeight: '38%',
              overflow: 'hidden',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <Typography
              component="div"
              sx={{
                display: 'inline-block',
                maxWidth: '100%',
                px: 1.5,
                py: 0.6,
                bgcolor: responsiveSubtitleStyles.backgroundColor,
                color: responsiveSubtitleStyles.color,
                fontSize: responsiveSubtitleStyles.fontSize,
                lineHeight: 1.25,
                textShadow: responsiveSubtitleStyles.textShadow,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {subtitleText}
            </Typography>
          </Box>
        )}

        {status === 'loading' && (
          hasCustomLoader
            ? (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'rgba(0,0,0,.45)',
                }}
              >
                {renderLoaderContent(renderLoader, { status, src: playbackSrc })}
              </Box>
            )
            : (
              <Stack
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  zIndex: 10,
                  bgcolor: 'rgba(0,0,0,.45)',
                }}
                alignItems="center"
                justifyContent="center"
                spacing={2}
              >
                <CircularProgress size={58} />
                <Typography>{loadingMessage || 'Preparando AVPlay...'}</Typography>
              </Stack>
            )
        )}

        {buffering && status !== 'loading' && (
          <Box sx={{ position: 'absolute', right: 20, top: 20, zIndex: 10, px: 1.25, py: .75, borderRadius: 1, bgcolor: 'rgba(0,0,0,.55)' }}>
            <Typography variant="body2">Buffering{bufferingPercent !== null ? ` ${bufferingPercent}%` : '…'}</Typography>
          </Box>
        )}

        {controls && hasLoaded && (
          <PlayerControls
            overlay={overlay}
            live={live}
            primaryColor={primaryColor}
            locale={locale}
            autoHideDelay={controlsAutoHideDelay}
            playing={playing}
            playable={status === 'ready'}
            currentTime={displayed}
            duration={duration}
            rewindStep={resolvedRewindStep}
            forwardStep={resolvedForwardStep}
            audioOptions={audioControlOptions}
            selectedAudio={selectedAudio}
            subtitleOptions={subtitleControlOptions}
            selectedSubtitle={selectedSubtitle}
            subtitleAppearance={subtitleAppearance}
            playerLayout={playerLayout}
            resizeMode={currentResizeMode}
            onSubtitleAppearanceChange={updateSubtitleAppearance}
            onReload={() => seekTo(0)}
            onToggle={toggle}
            onJumpBackward={() => jumpBy(-resolvedRewindStep)}
            onJumpForward={() => jumpBy(resolvedForwardStep)}
            onSeek={(value) => seekTo(value)}
            progressSeekStep={TIZEN_PROGRESS_SEEK_STEP}
            onProgressSeek={(value) => seekTo(value)}
            onSelectAudio={(value) => selectAudio(value)}
            onSelectSubtitle={(value) => selectSubtitle(value)}
            onToggleResizeMode={toggleResizeMode}
            onFullscreen={toggleFullscreen}
            onBack={onPlayerBack || onBack}
            showBackButton={showBackButton}
            onVisibilityChange={handleControlsVisibility}
            onSettingsStateChange={handleSettingsStateChange}
            settingsBackSignal={settingsBackSignal}
            showSettingsBackButton={false}
            showFullscreenButton={false}
            showFocusedTooltips
            hideSignal={controlsHideSignal}
          />
        )}
        <PlaybackErrorSnackbar
          error={error}
          retryAttempt={retryAttempt}
          maxRetries={maxRetryAttempts}
          locale={locale}
        />
      </Box>
    </Paper>
  );
});

export default TizenAvPlayer;
