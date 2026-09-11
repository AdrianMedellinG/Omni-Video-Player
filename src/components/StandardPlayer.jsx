import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Alert,
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import Replay10RoundedIcon from '@mui/icons-material/Replay10Rounded';
import Forward10RoundedIcon from '@mui/icons-material/Forward10Rounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import SubtitlesRoundedIcon from '@mui/icons-material/SubtitlesRounded';
import { formatTime, normalizeSeekStep } from '../utils/time.js';
import { normalizeRetryCount, normalizeRetryDelay } from '../utils/errorMessages.js';
import { getTrackDisplayLabel, getTrackLanguageName } from '../utils/language.js';
import {
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
  createProgressPayload,
  createSeekPayload,
  emitPlayerEvent,
  mapAudioTracks,
  mapTextTracks,
  mapVideoTracks,
} from '../utils/playerEvents.js';
import { useSubtitleAppearance } from '../utils/subtitlePreferences.js';
import { getResponsiveSubtitleStyles, usePlayerLayout } from '../utils/playerLayout.js';
import { useElectronPip } from '../platform/useElectronPip.js';
import PlayerControls from './PlayerControls.jsx';
import PlaybackErrorSnackbar from './PlaybackErrorSnackbar.jsx';

const MkvPlayer = lazy(() => import('./MkvPlayer.jsx'));

const StandardPlayer = forwardRef(function StandardPlayer({
  src,
  sourceInfo,
  mode = 'native',
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
  fullscreen: defaultFullscreen = false,
  pip = true,
  fullscreenAutorotate = true,
  fullscreenOrientation = 'all',
  headers,
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
  progressUpdateInterval = 250,
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
  subtitleFontSize = '24px',
  subtitleBackgroundColor = 'rgba(0,0,0,.62)',
  onReady,
  onBack,
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
  onBandwidthUpdate,
  onPictureInPictureStatusChanged,
  onFullscreenPlayerWillPresent,
  onFullscreenPlayerDidPresent,
  onFullscreenPlayerWillDismiss,
  onFullscreenPlayerDidDismiss,
}, ref) {
  const resolvedForwardStep = normalizeSeekStep(forwardStep);
  const resolvedRewindStep = normalizeSeekStep(rewindStep);
  const maxRetryAttempts = normalizeRetryCount(maxRetries);
  const retryDelay = normalizeRetryDelay(retryDelayMs);
  const videoRef = useRef(null);
  const wrapperRef = useRef(null);
  const hlsRef = useRef(null);
  const callbacksRef = useRef({});
  const progressTimerRef = useRef(null);
  const seekRequestRef = useRef(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [audioTracks, setAudioTracks] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(-1);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [scrubValue, setScrubValue] = useState(null);
  const [fallbackToMediabunny, setFallbackToMediabunny] = useState(false);
  const [nativePictureInPictureActive, setNativePictureInPictureActive] = useState(false);
  const [nativePictureInPictureSupported, setNativePictureInPictureSupported] = useState(false);
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
  const playerLayout = usePlayerLayout(wrapperRef);
  const responsiveSubtitleStyles = useMemo(
    () => getResponsiveSubtitleStyles(subtitleStyles, playerLayout),
    [playerLayout, subtitleStyles],
  );

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
    onBandwidthUpdate,
    onPictureInPictureStatusChanged,
    onFullscreenPlayerWillPresent,
    onFullscreenPlayerDidPresent,
    onFullscreenPlayerWillDismiss,
    onFullscreenPlayerDidDismiss,
  };
  const mergedBufferConfig = useMemo(
    () => getMergedBufferConfig(bufferConfig, sourceInfo),
    [bufferConfig, sourceInfo],
  );
  const posterInfo = useMemo(() => getPosterSource(poster, sourceInfo), [poster, sourceInfo]);
  const posterFit = resizeModeToObjectFit(posterInfo?.resizeMode || posterResizeMode);
  const videoFit = resizeModeToObjectFit(currentResizeMode);
  const hasCustomLoader = Boolean(renderLoader);
  const requestHeaders = useMemo(() => sanitizeRequestHeaders(headers), [headers]);
  const {
    active: electronPictureInPictureActive,
    supported: electronPictureInPictureSupported,
    toggle: toggleElectronPictureInPicture,
  } = useElectronPip(pip !== false);
  const pictureInPictureActive = electronPictureInPictureActive || nativePictureInPictureActive;
  const pictureInPictureSupported = electronPictureInPictureSupported || nativePictureInPictureSupported;

  const getTarget = useCallback((seconds) => {
    const video = videoRef.current;
    const fallback = Number(seconds) || 0;
    const max = video && Number.isFinite(video.duration) ? video.duration : fallback;
    return Math.max(0, Math.min(fallback, max || fallback));
  }, []);

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    await video.play();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const seekTo = useCallback((seconds) => {
    const video = videoRef.current;
    if (!video) return 0;
    const target = getTarget(seconds);
    seekRequestRef.current = target;
    video.currentTime = target;
    setCurrentTime(target);
    emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: playing, isSeeking: true }));
    emitPlayerEvent(callbacksRef, 'onProgress', createProgressPayload(video, duration));
    return target;
  }, [duration, getTarget, playing]);

  const jumpBy = useCallback((deltaSeconds) => {
    const video = videoRef.current;
    const base = video?.currentTime ?? currentTime;
    return seekTo(base + (Number(deltaSeconds) || 0));
  }, [currentTime, seekTo]);

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await play();
    else pause();
  }, [pause, play]);

  const toggleFullscreen = useCallback(async () => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      emitPlayerEvent(callbacksRef, 'onFullscreenPlayerWillDismiss');
      await document.exitFullscreen();
    } else {
      emitPlayerEvent(callbacksRef, 'onFullscreenPlayerWillPresent');
      await wrapperRef.current.requestFullscreen();
      if (fullscreenAutorotate && fullscreenOrientation !== 'all') {
        await window.screen?.orientation?.lock?.(fullscreenOrientation).catch(() => {});
      }
    }
  }, [fullscreenAutorotate, fullscreenOrientation]);

  useEffect(() => {
    setCurrentResizeMode(normalizeResizeMode(resizeModeProp));
  }, [resizeModeProp]);

  const setResizeMode = useCallback((nextResizeMode) => {
    const normalizedResizeMode = normalizeResizeMode(nextResizeMode);
    setCurrentResizeMode(normalizedResizeMode);
    callbacksRef.current.onResizeModeChange?.(normalizedResizeMode);
    return normalizedResizeMode;
  }, []);

  const toggleResizeMode = useCallback(() => {
    const nextResizeMode = getNextResizeMode(currentResizeMode);
    return setResizeMode(nextResizeMode);
  }, [currentResizeMode, setResizeMode]);

  useEffect(() => {
    const video = videoRef.current;
    const supported = Boolean(
      pip !== false
      && typeof document !== 'undefined'
      && document.pictureInPictureEnabled
      && typeof video?.requestPictureInPicture === 'function',
    );

    setNativePictureInPictureSupported(supported);
    if (!supported) setNativePictureInPictureActive(false);
  }, [pip, src]);

  const toggleNativePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    const supported = Boolean(
      pip !== false
      && typeof document !== 'undefined'
      && document.pictureInPictureEnabled
      && typeof video?.requestPictureInPicture === 'function',
    );

    if (!supported) return { active: false, supported: false };

    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture?.();
      setNativePictureInPictureActive(false);
      return { active: false, supported: true };
    }

    await video.requestPictureInPicture();
    setNativePictureInPictureActive(true);
    return { active: true, supported: true };
  }, [pip]);

  const togglePictureInPicture = useCallback(() => {
    if (electronPictureInPictureSupported) return toggleElectronPictureInPicture();
    return toggleNativePictureInPicture();
  }, [
    electronPictureInPictureSupported,
    toggleElectronPictureInPicture,
    toggleNativePictureInPicture,
  ]);

  const syncNativeAudioTracks = () => {
    const video = videoRef.current;
    const list = video?.audioTracks;
    if (!list) return;
    const tracks = Array.from({ length: list.length }, (_, i) => ({
      id: i,
      lang: list[i].language || list[i].lang || '',
      name: list[i].label || '',
      enabled: Boolean(list[i].enabled),
    }));
    setAudioTracks(tracks);
    const active = tracks.find((t) => t.enabled);
    if (active) setSelectedAudio(active.id);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    let disposed = false;
    const scheduleRetry = (retryAction) => {
      if (retryCountRef.current >= maxRetryAttempts || retryTimerRef.current) return false;
      retryCountRef.current += 1;
      setRetryAttempt(retryCountRef.current);
      setError('');
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        if (!disposed) retryAction();
      }, retryDelay);
      return true;
    };

    retryCountRef.current = 0;
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    setHasLoaded(false);
    setRetryAttempt(0);
    setError('');
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setLevels([]);
    setSelectedAudio(-1);
    setSelectedSubtitle(-1);
    setSelectedLevel(-1);
    setFallbackToMediabunny(false);
    emitPlayerEvent(callbacksRef, 'onLoadStart', createLoadStartPayload(src, mode));

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (mode === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: Math.max(0, mergedBufferConfig.backBufferDurationMs / 1000),
          maxBufferLength: Math.max(
            1,
            Number(preferredForwardBufferDuration) || mergedBufferConfig.maxBufferMs / 1000,
          ),
          xhrSetup(xhr) {
            for (const [key, value] of Object.entries(requestHeaders)) {
              xhr.setRequestHeader(key, value);
            }
          },
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const tracks = hls.levels.map((level, index) => ({
            id: index,
            index,
            trackId: String(index),
            width: level.width || 0,
            height: level.height,
            bitrate: level.bitrate,
            codecs: level.codecSet || level.attrs?.CODECS || '',
            selected: index === hls.currentLevel,
          }));
          setLevels(tracks);
          setSelectedLevel(-1);
          emitPlayerEvent(callbacksRef, 'onVideoTracks', { videoTracks: mapVideoTracks(tracks, hls.currentLevel) });
        });

        const syncHlsAudio = () => {
          const tracks = hls.audioTracks.map((track, index) => ({
            id: index,
            index,
            lang: track.lang || track.language || track.attrs?.LANGUAGE || track.attrs?.language || '',
            name: track.name || track.label || track.attrs?.NAME || track.attrs?.name || '',
            type: track.audioCodec || '',
          }));
          setAudioTracks(tracks);
          setSelectedAudio(hls.audioTrack);
          emitPlayerEvent(callbacksRef, 'onAudioTracks', { audioTracks: mapAudioTracks(tracks, hls.audioTrack) });
        };
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncHlsAudio);
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
          setSelectedAudio(data.id);
          emitPlayerEvent(callbacksRef, 'onAudioTracks', { audioTracks: mapAudioTracks(audioTracks, data.id) });
        });

        const syncHlsSubtitles = () => {
          const tracks = hls.subtitleTracks.map((track, index) => ({
            id: index,
            index,
            lang: track.lang || track.language || track.attrs?.LANGUAGE || track.attrs?.language || '',
            name: track.name || track.label || track.attrs?.NAME || track.attrs?.name || '',
            type: track.type || 'vtt',
          }));
          setSubtitleTracks(tracks);
          setSelectedSubtitle(hls.subtitleTrack);
          emitPlayerEvent(callbacksRef, 'onTextTracks', { textTracks: mapTextTracks(tracks, hls.subtitleTrack) });
        };
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, syncHlsSubtitles);
        hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_, data) => {
          setSelectedSubtitle(data.id);
          emitPlayerEvent(callbacksRef, 'onTextTracks', { textTracks: mapTextTracks(subtitleTracks, data.id) });
        });

        hls.on(Hls.Events.FPS_DROP_LEVEL_CAPPING, (_, data) => {
          emitPlayerEvent(callbacksRef, 'onBandwidthUpdate', {
            bitrate: hls.levels[data.level]?.bitrate || 0,
            width: hls.levels[data.level]?.width || 0,
            height: hls.levels[data.level]?.height || 0,
            trackId: String(data.level),
          });
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          const retryAction = data.type === Hls.ErrorTypes.MEDIA_ERROR
            ? () => hls.recoverMediaError()
            : () => hls.startLoad();
          if (scheduleRetry(retryAction)) return;
          setRetryAttempt(0);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (!disableDisconnectError) setError(`Error de red HLS: ${data.details}`);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            setError(`Error multimedia HLS: ${data.details}`);
          } else {
            setError(`Error HLS: ${data.details || 'desconocido'}`);
          }
          emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(data));
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      } else {
      setError('Este navegador no soporta reproducción HLS.');
        emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(new Error('Este navegador no soporta reproducción HLS.')));
      }
    } else {
      video.src = src;
    }

    const onLoaded = () => {
      setHasLoaded(true);
      retryCountRef.current = 0;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      setRetryAttempt(0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      const startSeconds = getStartSeconds(sourceInfo, initialTime);
      if (startSeconds > 0) video.currentTime = getTarget(startSeconds);
      video.muted = Boolean(mutedProp);
      video.volume = Math.max(0, Math.min(1, Number(volumeProp) || 0));
      video.playbackRate = Number(rateProp) || 1;
      syncNativeAudioTracks();
      const audioPayload = mapAudioTracks(audioTracks, selectedAudio);
      const textPayload = mapTextTracks(subtitleTracks, selectedSubtitle);
      const videoPayload = mapVideoTracks([{
        index: 0,
        trackId: 'native',
        codecs: '',
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        bitrate: 0,
        selected: true,
      }], 0);
      const loadPayload = createLoadPayload({
        currentTime: video.currentTime || 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
        audioTracks: audioPayload,
        textTracks: textPayload,
        videoTracks: videoPayload,
        trackId: video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : 'native',
      });
      emitPlayerEvent(callbacksRef, 'onLoad', loadPayload, ['onReady']);
      emitPlayerEvent(callbacksRef, 'onVideoTracks', { videoTracks: videoPayload });
      if (defaultFullscreen) toggleFullscreen().catch(() => {});
      if (autoPlay && !paused) {
        video.play().catch((playError) => {
          emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(playError));
        });
      }
    };
    const onTime = () => {
      const nextTime = video.currentTime || 0;
      setCurrentTime(nextTime);
    };
    const onDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const handlePlay = () => {
      setPlaying(true);
      emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: true, isSeeking: false }));
      callbacksRef.current.onPlay?.();
    };
    const handlePause = () => {
      setPlaying(false);
      emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: false, isSeeking: false }));
      callbacksRef.current.onPause?.();
    };
    const handleEnded = () => {
      setPlaying(false);
      emitPlayerEvent(callbacksRef, 'onEnd', undefined, ['onEnded']);
      if (repeat) {
        video.currentTime = 0;
        if (!paused) {
          video.play().catch((playError) => {
            emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(playError));
          });
        }
      }
    };
    const onVolume = () => {
      setVolume(video.volume);
      setMuted(video.muted);
      emitPlayerEvent(callbacksRef, 'onVolumeChange', { volume: video.volume, muted: video.muted });
    };
    const onRate = () => {
      setRate(video.playbackRate);
      emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', { playbackRate: video.paused ? 0 : video.playbackRate });
    };
    const onError = () => {
      const mediaError = video.error;
      if (mode === 'native' && (mediaError?.code === 3 || mediaError?.code === 4)) {
        console.warn('MP4 nativo falló. Cambiando a Mediabunny/WebCodecs.', {
          code: mediaError?.code,
          message: mediaError?.message,
          src,
        });
        setError('');
        setFallbackToMediabunny(true);
        return;
      }
      if (scheduleRetry(() => {
        video.load();
        if (autoPlay && !paused) video.play().catch(() => {});
      })) return;
      setRetryAttempt(0);
      const message = mediaError?.message || 'No se pudo reproducir el video.';
      setError(message);
      emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(mediaError || new Error(message)));
    };
    const onWaiting = () => emitPlayerEvent(callbacksRef, 'onBuffer', { isBuffering: true });
    const onCanPlay = () => {
      retryCountRef.current = 0;
      setRetryAttempt(0);
      emitPlayerEvent(callbacksRef, 'onBuffer', { isBuffering: false });
    };
    const onLoadedData = () => emitPlayerEvent(callbacksRef, 'onReadyForDisplay');
    const onSeeking = () => emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: !video.paused, isSeeking: true }));
    const onSeeked = () => {
      const seekTime = seekRequestRef.current ?? video.currentTime ?? 0;
      seekRequestRef.current = null;
      emitPlayerEvent(callbacksRef, 'onSeek', createSeekPayload(video.currentTime || 0, seekTime));
      emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: !video.paused, isSeeking: false }));
    };
    const onEnterPictureInPicture = () => {
      setNativePictureInPictureActive(true);
      emitPlayerEvent(callbacksRef, 'onPictureInPictureStatusChanged', { isActive: true });
    };
    const onLeavePictureInPicture = () => {
      setNativePictureInPictureActive(false);
      emitPlayerEvent(callbacksRef, 'onPictureInPictureStatusChanged', { isActive: false });
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('ratechange', onRate);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);
    video.addEventListener('playing', onCanPlay);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('enterpictureinpicture', onEnterPictureInPicture);
    video.addEventListener('leavepictureinpicture', onLeavePictureInPicture);
    video.addEventListener('error', onError);
    const onFullscreenChange = () => {
      if (document.fullscreenElement === wrapperRef.current) {
        emitPlayerEvent(callbacksRef, 'onFullscreenPlayerDidPresent');
      } else {
        emitPlayerEvent(callbacksRef, 'onFullscreenPlayerDidDismiss');
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('ratechange', onRate);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('playing', onCanPlay);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('enterpictureinpicture', onEnterPictureInPicture);
      video.removeEventListener('leavepictureinpicture', onLeavePictureInPicture);
      video.removeEventListener('error', onError);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [
    autoPlay,
    contentStartTime,
    currentPlaybackTime,
    defaultFullscreen,
    disableDisconnectError,
    getTarget,
    requestHeaders,
    initialTime,
    mergedBufferConfig,
    maxRetryAttempts,
    mode,
    mutedProp,
    paused,
    preferredForwardBufferDuration,
    rateProp,
    sourceInfo,
    src,
    toggleFullscreen,
    volumeProp,
    repeat,
    retryDelay,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = Boolean(mutedProp);
  }, [mutedProp]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, Number(volumeProp) || 0));
  }, [volumeProp]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = Number(rateProp) || 1;
  }, [rateProp]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else if (autoPlay) {
      video.play().catch((playError) => {
        emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(playError));
      });
    }
  }, [autoPlay, paused]);

  useEffect(() => {
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState === 0) return;
      callbacksRef.current.onProgress?.({
        ...createProgressPayload(video, duration, { currentPlaybackTime }),
      });
    }, Math.max(100, Number(progressUpdateInterval) || 250));
    return () => {
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    };
  }, [currentPlaybackTime, progressUpdateInterval]);

  const displayedTime = scrubValue ?? currentTime;
  const showAudio = audioTracks.length > 0;
  const showSubtitles = subtitleTracks.length > 0;
  const subtitleLanguageHints = useMemo(
    () => Array.from(new Set(subtitleTracks.map((track) => getTrackLanguageName(track)).filter(Boolean))),
    [subtitleTracks],
  );
  const audioControlOptions = useMemo(
    () => audioTracks.map((track, index) => ({
      value: track.id,
      label: getTrackDisplayLabel({ ...track, languageHint: subtitleLanguageHints[index] }, 'audio', index),
    })),
    [audioTracks, subtitleLanguageHints],
  );
  const subtitleControlOptions = useMemo(
    () => subtitleTracks.map((track, index) => ({
      value: track.id,
      label: getTrackDisplayLabel(track, 'subtitle', index),
    })),
    [subtitleTracks],
  );

  const selectAudio = useCallback((id) => {
    const value = Number(id);
    const hls = hlsRef.current;
    if (mode === 'hls' && hls) {
      hls.audioTrack = value;
      setSelectedAudio(value);
      return;
    }
    const list = videoRef.current?.audioTracks;
    if (list) {
      for (let i = 0; i < list.length; i += 1) list[i].enabled = i === value;
      setSelectedAudio(value);
    }
  }, [mode]);

  const selectSubtitle = useCallback((id) => {
    const value = Number(id);
    const hls = hlsRef.current;
    if (mode === 'hls' && hls) {
      hls.subtitleDisplay = value >= 0;
      hls.subtitleTrack = value;
      setSelectedSubtitle(value);
      return;
    }
    const tracks = videoRef.current?.textTracks;
    if (tracks) {
      for (let i = 0; i < tracks.length; i += 1) tracks[i].mode = i === value ? 'showing' : 'disabled';
      setSelectedSubtitle(value);
    }
  }, [mode]);

  const selectLevel = useCallback((id) => {
    const value = Number(id);
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = value;
    setSelectedLevel(value);
  }, []);

  useEffect(() => {
    const match = pickTrackBySelection(audioTracks, selectedAudioTrack, (track) => ({
      index: track.id,
      id: track.id,
      language: track.lang,
      name: track.name,
    }));
    if (match?.disabled) {
      if (videoRef.current) videoRef.current.muted = true;
      return;
    }
    if (match) selectAudio(match.id);
  }, [audioTracks, selectAudio, selectedAudioTrack]);

  useEffect(() => {
    const match = pickTrackBySelection(subtitleTracks, selectedTextTrack, (track) => ({
      index: track.id,
      id: track.id,
      language: track.lang,
      name: track.name,
    }));
    if (match?.disabled) {
      selectSubtitle(-1);
      return;
    }
    if (match) selectSubtitle(match.id);
  }, [selectSubtitle, selectedTextTrack, subtitleTracks]);

  useEffect(() => {
    const match = pickTrackBySelection(levels, selectedVideoTrack, (level) => ({
      index: level.id,
      id: level.id,
      height: level.height,
      value: level.height,
    }));
    if (match?.disabled) {
      selectLevel(-1);
      return;
    }
    if (match) selectLevel(match.id);
  }, [levels, selectLevel, selectedVideoTrack]);

  useImperativeHandle(ref, () => ({
    play,
    pause,
    toggle: togglePlay,
    seekTo,
    jumpBy,
    getCurrentTime: () => videoRef.current?.currentTime ?? currentTime,
    getDuration: () => duration,
    setVolume: (value) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = Math.max(0, Math.min(1, Number(value) || 0));
      video.muted = false;
    },
    setMuted: (value) => {
      if (videoRef.current) videoRef.current.muted = Boolean(value);
    },
    setPlaybackRate: (value) => {
      if (videoRef.current) videoRef.current.playbackRate = Number(value) || 1;
    },
    selectAudio,
    selectSubtitle,
    requestFullscreen: toggleFullscreen,
    requestPictureInPicture: togglePictureInPicture,
    setResizeMode,
    toggleResizeMode,
    getResizeMode: () => currentResizeMode,
  }), [
    currentResizeMode,
    currentTime,
    duration,
    jumpBy,
    pause,
    play,
    seekTo,
    setResizeMode,
    togglePictureInPicture,
    toggleFullscreen,
    togglePlay,
    toggleResizeMode,
  ]);

  if (mode === 'native' && fallbackToMediabunny) {
    return (
      <Suspense fallback={<Alert severity="info">Preparando reproductor MKV…</Alert>}>
        <MkvPlayer
          ref={ref}
          key={`mediabunny-fallback-${src}`}
          src={src}
          autoPlay={autoPlay}
          initialTime={initialTime}
          seekStep={seekStep}
          forwardStep={resolvedForwardStep}
          rewindStep={resolvedRewindStep}
          fullscreen={defaultFullscreen}
          pip={pip}
          paused={paused}
          muted={mutedProp}
          volume={volumeProp}
          rate={rateProp}
          repeat={repeat}
          resizeMode={currentResizeMode}
          poster={poster}
          posterResizeMode={posterResizeMode}
          renderLoader={renderLoader}
          selectedAudioTrack={selectedAudioTrack}
          selectedTextTrack={selectedTextTrack}
          controls={controls}
          showBackButton={showBackButton}
          overlay={overlay}
          primaryColor={primaryColor}
          locale={locale}
          controlsAutoHideDelay={controlsAutoHideDelay}
          maxRetries={maxRetries}
          retryDelayMs={retryDelayMs}
          live={live}
          subtitleColor={subtitleColor}
          subtitleFontSize={subtitleFontSize}
          subtitleBackgroundColor={subtitleBackgroundColor}
          onReady={onReady}
          onBack={onBack}
          onProgress={onProgress}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onError={onError}
          onLoadStart={onLoadStart}
          onLoad={onLoad}
          onEnd={onEnd}
          onBuffer={onBuffer}
          onSeek={onSeek}
          onReadyForDisplay={onReadyForDisplay}
          onPlaybackStateChanged={onPlaybackStateChanged}
          onPlaybackRateChange={onPlaybackRateChange}
          onVolumeChange={onVolumeChange}
          onResizeModeChange={onResizeModeChange}
          onAudioTracks={onAudioTracks}
          onTextTracks={onTextTracks}
          onVideoTracks={onVideoTracks}
        />
      </Suspense>
    );
  }

  return (
    <Paper ref={wrapperRef} elevation={8} sx={{ overflow: 'hidden', bgcolor: '#05070a', border: '1px solid rgba(255,255,255,.08)' }}>
      <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: shutterColor, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          className="universal-native-video"
          playsInline
          onDoubleClick={toggleFullscreen}
          style={{
            width: '100%',
            height: '100%',
            objectFit: videoFit,
            display: 'block',
            background: '#000',
            '--universal-subtitle-color': responsiveSubtitleStyles.color,
            '--universal-subtitle-font-size': responsiveSubtitleStyles.fontSize,
            '--universal-subtitle-bg': responsiveSubtitleStyles.backgroundColor,
            '--universal-subtitle-shadow': responsiveSubtitleStyles.textShadow,
          }}
        />

        {posterInfo?.uri && !hasCustomLoader && !playing && (
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
              width: '100%',
              height: '100%',
              objectFit: posterFit,
              pointerEvents: 'none',
            }}
          />
        )}

        {hasCustomLoader && !playing && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
            }}
          >
            {renderLoaderContent(renderLoader, { status: playing ? 'playing' : 'loading', src })}
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
            playable
            currentTime={displayedTime}
            duration={duration}
            rewindStep={resolvedRewindStep}
            forwardStep={resolvedForwardStep}
            audioOptions={audioControlOptions}
            selectedAudio={selectedAudio}
            subtitleOptions={subtitleControlOptions}
            selectedSubtitle={selectedSubtitle === -1 ? '' : selectedSubtitle}
            subtitleAppearance={subtitleAppearance}
            playerLayout={playerLayout}
            resizeMode={currentResizeMode}
            onSubtitleAppearanceChange={updateSubtitleAppearance}
            onReload={() => seekTo(0)}
            onToggle={togglePlay}
            onJumpBackward={() => jumpBy(-resolvedRewindStep)}
            onJumpForward={() => jumpBy(resolvedForwardStep)}
            onSeek={(value) => seekTo(value)}
            onSelectAudio={(value) => selectAudio(value)}
            onSelectSubtitle={(value) => selectSubtitle(value === '' ? -1 : value)}
            onToggleResizeMode={toggleResizeMode}
            onFullscreen={toggleFullscreen}
            onPictureInPicture={pictureInPictureSupported ? togglePictureInPicture : undefined}
            pictureInPictureActive={pictureInPictureActive}
            onBack={onBack}
            showBackButton={showBackButton}
            showPictureInPictureButton={pip !== false}
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

export default StandardPlayer;
