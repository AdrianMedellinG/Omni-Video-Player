import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
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
import { MkvPlayerEngine } from '../engine/MkvPlayerEngine.js';
import { formatBytes, formatTime, normalizeSeekStep } from '../utils/time.js';
import { getTrackDisplayLabel, getTrackLanguageName } from '../utils/language.js';
import {
  getPosterSource,
  getStartSeconds,
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
import { useSubtitleAppearance } from '../utils/subtitlePreferences.js';
import { normalizeRetryCount, normalizeRetryDelay } from '../utils/errorMessages.js';
import { useElectronPip } from '../platform/useElectronPip.js';
import PlayerControls from './PlayerControls.jsx';
import PlaybackErrorSnackbar from './PlaybackErrorSnackbar.jsx';



function SubtitleText({ text }) {
  const nodes = useMemo(() => parseSubtitleMarkup(text), [text]);
  return <>{nodes}</>;
}

function parseSubtitleMarkup(text) {
  if (!text) return null;
  const normalized = String(text)
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const tokens = normalized.split(/(<\/?(?:i|b|u)>|\n)/gi);
  const state = { italic: 0, bold: 0, underline: 0 };
  const result = [];
  let key = 0;

  for (const token of tokens) {
    if (!token) continue;
    const lower = token.toLowerCase();
    if (lower === '<i>') { state.italic += 1; continue; }
    if (lower === '</i>') { state.italic = Math.max(0, state.italic - 1); continue; }
    if (lower === '<b>') { state.bold += 1; continue; }
    if (lower === '</b>') { state.bold = Math.max(0, state.bold - 1); continue; }
    if (lower === '<u>') { state.underline += 1; continue; }
    if (lower === '</u>') { state.underline = Math.max(0, state.underline - 1); continue; }
    if (token === '\n') { result.push(<br key={`br-${key++}`} />); continue; }

    const clean = token.replace(/<\/?[^>]+>/g, '');
    if (!clean) continue;
    result.push(
      <span
        key={`text-${key++}`}
        style={{
          fontStyle: state.italic ? 'italic' : 'normal',
          fontWeight: state.bold ? 700 : 'inherit',
          textDecoration: state.underline ? 'underline' : 'none',
        }}
      >
        {clean}
      </span>,
    );
  }
  return result;
}

const MkvPlayer = forwardRef(function MkvPlayer({
  src,
  sourceInfo,
  controls = true,
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
  headers,
  muted: mutedProp = false,
  poster,
  posterResizeMode = 'contain',
  renderLoader,
  repeat = false,
  resizeMode = 'contain',
  selectedAudioTrack,
  selectedTextTrack,
  progressUpdateInterval = 250,
  shutterColor = '#000',
  volume: volumeProp = 1,
  rate: rateProp = 1,
  subtitleColor = '#fff',
  subtitleFontSize = { xs: '1rem', sm: '1.25rem', md: '1.55rem', lg: '1.75rem' },
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
  onAudioTracks,
  onTextTracks,
  onVideoTracks,
  onTextTrackDataChanged,
}, ref) {
  const resolvedForwardStep = normalizeSeekStep(forwardStep);
  const resolvedRewindStep = normalizeSeekStep(rewindStep);
  const maxRetryAttempts = normalizeRetryCount(maxRetries);
  const retryDelay = normalizeRetryDelay(retryDelayMs);
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const engineRef = useRef(null);
  const callbacksRef = useRef({});
  const optionsRef = useRef({});
  const lastProgressRef = useRef(0);
  const seekRequestRef = useRef(null);
  const rateRef = useRef(1);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const retryConfigRef = useRef({});

  const [status, setStatus] = useState('idle');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [metadata, setMetadata] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState('');
  const [selectedSubtitle, setSelectedSubtitle] = useState('');
  const [subtitleText, setSubtitleText] = useState('');
  const [error, setError] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [bytesRead, setBytesRead] = useState(0);
  const [scrubValue, setScrubValue] = useState(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const {
    appearance: subtitleAppearance,
    styles: subtitleStyles,
    updateAppearance: updateSubtitleAppearance,
  } = useSubtitleAppearance({
    subtitleColor,
    subtitleFontSize,
    subtitleBackgroundColor,
  });

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
    onAudioTracks,
    onTextTracks,
    onVideoTracks,
    onTextTrackDataChanged,
  };
  optionsRef.current = {
    autoPlay,
    initialTime,
    defaultFullscreen,
    paused,
    repeat,
    sourceInfo,
    progressUpdateInterval,
  };
  const posterInfo = useMemo(() => getPosterSource(poster, sourceInfo), [poster, sourceInfo]);
  const posterFit = resizeModeToObjectFit(posterInfo?.resizeMode || posterResizeMode);
  const canvasFit = resizeModeToObjectFit(resizeMode);
  const hasCustomLoader = Boolean(renderLoader);
  const requestHeaders = useMemo(() => sanitizeRequestHeaders(headers), [headers]);
  const {
    active: pictureInPictureActive,
    supported: pictureInPictureSupported,
    toggle: togglePictureInPicture,
  } = useElectronPip(pip !== false);
  retryConfigRef.current = {
    src,
    headers: requestHeaders,
    maxRetries: maxRetryAttempts,
    retryDelayMs: retryDelay,
  };

  const seekTo = useCallback(async (seconds) => {
    const engine = engineRef.current;
    if (!engine) return 0;
    const seekTime = Number(seconds) || 0;
    seekRequestRef.current = seekTime;
    emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: playing, isSeeking: true }));
    await engine.seek(seekTime);
    const current = engine.getClockTime();
    emitPlayerEvent(callbacksRef, 'onSeek', createSeekPayload(current, seekTime));
    emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: playing, isSeeking: false }));
    return current;
  }, [playing]);

  const jumpBy = useCallback(async (deltaSeconds) => {
    const engine = engineRef.current;
    if (!engine) return 0;
    await seekTo(engine.getClockTime() + (Number(deltaSeconds) || 0));
    return engine.getClockTime();
  }, [seekTo]);

  const toggleFullscreen = useCallback(async () => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await wrapperRef.current.requestFullscreen();
  }, []);

  useImperativeHandle(ref, () => ({
    play: () => engineRef.current?.play(),
    pause: () => engineRef.current?.pause(),
    toggle: () => engineRef.current?.toggle(),
    seekTo,
    jumpBy,
    getCurrentTime: () => engineRef.current?.getClockTime() ?? currentTime,
    getDuration: () => duration,
    setVolume: (value) => engineRef.current?.setVolume(value),
    setMuted: (value) => engineRef.current?.setMuted(value),
    setPlaybackRate: (value) => engineRef.current?.setPlaybackRate(value),
    selectAudio: (id) => engineRef.current?.setAudioTrack(id),
    selectSubtitle: (id) => engineRef.current?.setSubtitleTrack(id),
    requestFullscreen: toggleFullscreen,
    requestPictureInPicture: togglePictureInPicture,
  }), [currentTime, duration, jumpBy, seekTo, togglePictureInPicture, toggleFullscreen]);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    const engine = new MkvPlayerEngine(canvasRef.current);
    engineRef.current = engine;

    const scheduleRetry = () => {
      const config = retryConfigRef.current;
      if (!config.src || retryCountRef.current >= config.maxRetries || retryTimerRef.current) return false;
      retryCountRef.current += 1;
      setRetryAttempt(retryCountRef.current);
      setError('');
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        const current = retryConfigRef.current;
        engineRef.current?.load(current.src, { headers: current.headers }).catch(() => {});
      }, config.retryDelayMs);
      return true;
    };

    const handleEngineError = (error) => {
      if (scheduleRetry()) return;
      setRetryAttempt(0);
      setError(error?.message || String(error));
      emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(error));
    };

    const handlers = {
      state: (event) => {
        setStatus(event.detail.status);
        if (event.detail.status === 'ready') {
          setHasLoaded(true);
          retryCountRef.current = 0;
          setRetryAttempt(0);
        }
        emitPlayerEvent(callbacksRef, 'onBuffer', { isBuffering: event.detail.status === 'loading' });
      },
      loaded: (event) => {
        setHasLoaded(true);
        retryCountRef.current = 0;
        setRetryAttempt(0);
        setMetadata(event.detail);
        setDuration(event.detail.duration);
        setSelectedAudio(event.detail.selectedAudioTrackId ?? '');
        setSelectedSubtitle(event.detail.selectedSubtitleTrackId ?? '');
        setSubtitleText('');
        setError('');
        const audioTracksPayload = mapAudioTracks(event.detail.audioTracks || [], event.detail.selectedAudioTrackId);
        const textTracksPayload = mapTextTracks(event.detail.subtitleTracks || [], event.detail.selectedSubtitleTrackId);
        const videoTracksPayload = mapVideoTracks([{
          index: 0,
          trackId: event.detail.video?.codec || 'mkv-video',
          codecs: event.detail.video?.codec || '',
          width: event.detail.video?.width || 0,
          height: event.detail.video?.height || 0,
          bitrate: 0,
          selected: true,
        }], 0);
        emitPlayerEvent(callbacksRef, 'onLoad', createLoadPayload({
          currentTime: 0,
          duration: event.detail.duration || 0,
          width: event.detail.video?.width || 0,
          height: event.detail.video?.height || 0,
          audioTracks: audioTracksPayload,
          textTracks: textTracksPayload,
          videoTracks: videoTracksPayload,
          trackId: event.detail.video?.codec || 'mkv-video',
        }), ['onReady']);
        emitPlayerEvent(callbacksRef, 'onAudioTracks', { audioTracks: audioTracksPayload });
        emitPlayerEvent(callbacksRef, 'onTextTracks', { textTracks: textTracksPayload });
        emitPlayerEvent(callbacksRef, 'onVideoTracks', { videoTracks: videoTracksPayload });
        emitPlayerEvent(callbacksRef, 'onReadyForDisplay');
        Promise.resolve()
          .then(() => {
            const startSeconds = getStartSeconds(optionsRef.current.sourceInfo, optionsRef.current.initialTime);
            if (startSeconds > 0) {
              return engine.seek(startSeconds);
            }
            return undefined;
          })
          .then(() => {
            if (optionsRef.current.defaultFullscreen) toggleFullscreen().catch(() => {});
            if (optionsRef.current.autoPlay && !optionsRef.current.paused) return engine.play();
            return undefined;
          })
          .catch((error) => {
            handleEngineError(error);
          });
      },
      time: (event) => {
        setCurrentTime(event.detail.currentTime);
        setDuration(event.detail.duration);
        const now = performance.now();
        const interval = Math.max(100, Number(optionsRef.current.progressUpdateInterval) || 250);
        if (now - lastProgressRef.current >= interval) {
          lastProgressRef.current = now;
          emitPlayerEvent(callbacksRef, 'onProgress', {
            currentTime: event.detail.currentTime || 0,
            playableDuration: event.detail.duration || 0,
            seekableDuration: event.detail.duration || 0,
            duration: event.detail.duration || 0,
          });
        }
      },
      play: () => {
        setPlaying(true);
        emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: true, isSeeking: false }));
        emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', { playbackRate: rateRef.current || 1 });
        callbacksRef.current.onPlay?.();
      },
      pause: () => {
        setPlaying(false);
        emitPlayerEvent(callbacksRef, 'onPlaybackStateChanged', createPlaybackStatePayload({ isPlaying: false, isSeeking: false }));
        emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', { playbackRate: 0 });
        callbacksRef.current.onPause?.();
      },
      ended: () => {
        setPlaying(false);
        setSubtitleText('');
        emitPlayerEvent(callbacksRef, 'onEnd', undefined, ['onEnded']);
        if (optionsRef.current.repeat) {
          engine.seek(0)
            .then(() => {
              if (!optionsRef.current.paused) return engine.play();
              return undefined;
            })
            .catch((error) => emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(error)));
        }
      },
      volume: (event) => {
        setVolume(event.detail.volume);
        setMuted(event.detail.muted);
        emitPlayerEvent(callbacksRef, 'onVolumeChange', {
          volume: event.detail.volume,
          muted: event.detail.muted,
        });
      },
      rate: (event) => {
        rateRef.current = event.detail.rate;
        setRate(event.detail.rate);
        emitPlayerEvent(callbacksRef, 'onPlaybackRateChange', { playbackRate: event.detail.rate });
      },
      'audio-track': (event) => setSelectedAudio(event.detail.id),
      'subtitle-track': (event) => setSelectedSubtitle(event.detail.id ?? ''),
      'subtitle-tracks': (event) => {
        setMetadata((prev) => prev ? { ...prev, subtitleTracks: event.detail.tracks ?? [] } : prev);
        emitPlayerEvent(callbacksRef, 'onTextTracks', {
          textTracks: mapTextTracks(event.detail.tracks || [], selectedSubtitle),
        });
      },
      subtitle: (event) => {
        const text = event.detail.text ?? '';
        setSubtitleText(text);
        emitPlayerEvent(callbacksRef, 'onTextTrackDataChanged', { subtitleTracks: text });
      },
      network: (event) => setBytesRead(event.detail.bytesRead),
      error: (event) => {
        handleEngineError(event.detail.error);
      },
    };

    Object.entries(handlers).forEach(([name, fn]) => engine.addEventListener(name, fn));

    return () => {
      Object.entries(handlers).forEach(([name, fn]) => engine.removeEventListener(name, fn));
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      engine.destroy();
      engineRef.current = null;
    };
  }, [toggleFullscreen]);

  useEffect(() => {
    if (!src || !engineRef.current) return;

    retryCountRef.current = 0;
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    setHasLoaded(false);
    setRetryAttempt(0);
    setError('');
    setMetadata(null);
    setBytesRead(0);
    setSubtitleText('');
    setSelectedSubtitle('');
    emitPlayerEvent(callbacksRef, 'onLoadStart', createLoadStartPayload(src, 'mkv'));

    engineRef.current.load(src, { headers: requestHeaders }).catch(() => {});
  }, [requestHeaders, src]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!engineRef.current || status !== 'ready') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        engineRef.current.toggle();
      } else if (event.code === 'ArrowLeft') {
        jumpBy(-resolvedRewindStep);
      } else if (event.code === 'ArrowRight') {
        jumpBy(resolvedForwardStep);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [jumpBy, resolvedForwardStep, resolvedRewindStep, status]);

  const displayedTime = scrubValue ?? currentTime;
  const handleSettingsStateChange = useCallback((state) => {
    setSettingsMenuOpen(Boolean(state?.open));
  }, []);
  const playable = status === 'ready';
  const audioOptions = useMemo(() => metadata?.audioTracks ?? [], [metadata]);
  const subtitleOptions = useMemo(() => metadata?.subtitleTracks ?? [], [metadata]);
  const subtitleLanguageHints = useMemo(
    () => Array.from(new Set(subtitleOptions.map((track) => getTrackLanguageName(track)).filter(Boolean))),
    [subtitleOptions],
  );
  const audioControlOptions = useMemo(
    () => audioOptions.map((track, index) => ({
      value: track.id,
      label: getTrackDisplayLabel({ ...track, languageHint: subtitleLanguageHints[index] }, 'audio', index),
      disabled: !track.decodable,
    })),
    [audioOptions, subtitleLanguageHints],
  );
  const subtitleControlOptions = useMemo(
    () => subtitleOptions.map((track, index) => ({
      value: track.id,
      label: getTrackDisplayLabel(track, 'subtitle', index),
    })),
    [subtitleOptions],
  );

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || status !== 'ready') return;
    if (paused) engine.pause();
    else if (autoPlay) {
      engine.play().catch((error) => {
        emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(error));
      });
    }
  }, [autoPlay, paused, status]);

  useEffect(() => {
    engineRef.current?.setMuted(Boolean(mutedProp));
  }, [mutedProp]);

  useEffect(() => {
    engineRef.current?.setVolume(Math.max(0, Math.min(1, Number(volumeProp) || 0)));
  }, [volumeProp]);

  useEffect(() => {
    engineRef.current?.setPlaybackRate(Number(rateProp) || 1);
  }, [rateProp]);

  useEffect(() => {
    const match = pickTrackBySelection(audioOptions, selectedAudioTrack, (track) => ({
      index: track.number - 1,
      id: track.id,
      language: track.language,
      name: track.name,
    }));
    if (match?.disabled) {
      engineRef.current?.setMuted(true);
      return;
    }
    if (match) {
      engineRef.current
        ?.setAudioTrack(match.id)
        .catch((error) => emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(error)));
    }
  }, [audioOptions, selectedAudioTrack]);

  useEffect(() => {
    const match = pickTrackBySelection(subtitleOptions, selectedTextTrack, (track) => ({
      index: track.number - 1,
      id: track.id,
      language: track.language,
      name: track.name,
    }));
    if (match?.disabled) {
      engineRef.current?.setSubtitleTrack('');
      return;
    }
    if (match) {
      engineRef.current
        ?.setSubtitleTrack(match.id)
        .catch((error) => emitPlayerEvent(callbacksRef, 'onError', createErrorPayload(error)));
    }
  }, [selectedTextTrack, subtitleOptions]);

  return (
    <Paper
      ref={wrapperRef}
      elevation={8}
      sx={{
        overflow: 'hidden',
        bgcolor: '#05070a',
        border: '1px solid rgba(255,255,255,.08)',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          aspectRatio: '16 / 9',
          bgcolor: shutterColor,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          onDoubleClick={toggleFullscreen}
          style={{
            width: '100%',
            height: '100%',
            objectFit: canvasFit,
            display: 'block',
            background: '#000',
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

        {subtitleText && (
          <Box
            sx={{
              position: 'absolute',
              left: '5%',
              right: '5%',
              bottom: settingsMenuOpen
                ? { xs: '25%', md: '23%' }
                : controls ? { xs: '22%', md: '18%' } : { xs: '7%', md: '8%' },
              textAlign: 'center',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          >
            <Typography
              component="div"
              sx={{
                display: 'inline-block',
                maxWidth: '100%',
                px: 1.1,
                py: 0.35,
                fontSize: subtitleStyles.fontSize,
                fontWeight: 600,
                lineHeight: 1.3,
                color: subtitleStyles.color,
                background: subtitleStyles.backgroundColor,
                textShadow: subtitleStyles.textShadow,
                borderRadius: 0.6,
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
              }}
            >
              <SubtitleText text={subtitleText} />
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
                  display: 'grid',
                  placeItems: 'center',
                  zIndex: 5,
                }}
              >
                {renderLoaderContent(renderLoader, { status, src })}
              </Box>
            )
            : (
              <Stack alignItems="center" spacing={1.5} sx={{ position: 'absolute', zIndex: 5 }}>
                <CircularProgress />
              </Stack>
            )
        )}

        {controls && hasLoaded && (
          <PlayerControls
            overlay={overlay}
            live={live}
            primaryColor={primaryColor}
            locale={locale}
            autoHideDelay={controlsAutoHideDelay}
            playing={playing}
            playable={playable}
            currentTime={displayedTime}
            duration={duration}
            rewindStep={resolvedRewindStep}
            forwardStep={resolvedForwardStep}
            audioOptions={audioControlOptions}
            selectedAudio={selectedAudio}
            subtitleOptions={subtitleControlOptions}
            selectedSubtitle={selectedSubtitle}
            subtitleAppearance={subtitleAppearance}
            onSubtitleAppearanceChange={updateSubtitleAppearance}
            onSettingsStateChange={handleSettingsStateChange}
            onReload={() => seekTo(0)}
            onToggle={() => engineRef.current?.toggle()}
            onJumpBackward={() => jumpBy(-resolvedRewindStep)}
            onJumpForward={() => jumpBy(resolvedForwardStep)}
            onSeek={(value) => seekTo(value)}
            onSelectAudio={(value) => {
              engineRef.current
                ?.setAudioTrack(value)
                .catch((err) => setError(err.message));
            }}
            onSelectSubtitle={(value) => {
              setSelectedSubtitle(value);
              engineRef.current
                ?.setSubtitleTrack(value)
                .catch((err) => setError(err.message));
            }}
            onFullscreen={toggleFullscreen}
            onPictureInPicture={pictureInPictureSupported ? togglePictureInPicture : undefined}
            pictureInPictureActive={pictureInPictureActive}
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

export default MkvPlayer;
