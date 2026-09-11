import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import Replay10RoundedIcon from '@mui/icons-material/Replay10Rounded';
import Replay30RoundedIcon from '@mui/icons-material/Replay30Rounded';
import Forward10RoundedIcon from '@mui/icons-material/Forward10Rounded';
import Forward30RoundedIcon from '@mui/icons-material/Forward30Rounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import VideoPlayer from './components/VideoPlayer.jsx';
import { getSafePlaybackErrorMessage } from './utils/errorMessages.js';
import { formatTime, SEEK_STEP_OPTIONS } from './utils/time.js';
import { useTvRemote } from './tizen/useTvRemote.js';
import { exitWebOSApp, isCapacitorAndroid, isWebOS } from './platform/runtime.js';
import { useAndroidBackButton } from './platform/useAndroidBackButton.js';
import { useElectronPip } from './platform/useElectronPip.js';
import { CHANNEL_LIST, EPISODES, PLAYER_PRESETS } from './playerPresets.js';
import {
  CREDIT_AUTO_ADVANCE_SECONDS,
  NEXT_EPISODE_AUTO_PCT,
  NEXT_EPISODE_TOAST_PCT,
  getActiveEpisodeSegment,
  getCreditAutoAdvanceProgress,
  getEpisodeSegmentElapsedSeconds,
  getEpisodeSegmentLabel,
  getEpisodeSegmentProgress,
  getNextEpisodeLabel,
  hasEpisodeSegment,
} from './utils/episodeSegments.js';

const defaultUrl = '';

function pushLog(setLogs, message) {
  const time = new Date().toLocaleTimeString();
  setLogs((items) => [`${time}  ${message}`, ...items].slice(0, 14));
}

function isSpanishLocale(value) {
  return String(value).toLowerCase().startsWith('es');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getMediaUri(item) {
  return String(item?.uri || item?.url || item?.src || '').trim();
}

function normalizeDemoUrl(value) {
  const clean = String(value || '').trim().replace(/\\([()])/g, '$1');
  if (!clean) return '';
  return encodeURI(clean)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function findItemIndexByUrl(items, url) {
  const normalizedUrl = normalizeDemoUrl(url);
  return items.findIndex((item) => normalizeDemoUrl(getMediaUri(item)) === normalizedUrl);
}

function normalizeListIndex(value, length) {
  if (!length) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return clamp(Math.trunc(number), 0, length - 1);
}

export default function App() {
  const playerRef = useRef(null);
  const [draftUrl, setDraftUrl] = useState(defaultUrl);
  const [sourceUri, setSourceUri] = useState(defaultUrl);
  const [activeChannelList, setActiveChannelList] = useState(null);
  const [userAgent, setUserAgent] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [controls, setControls] = useState(true);
  const [showBackButton, setShowBackButton] = useState(true);
  const [pip, setPip] = useState(true);
  const [locale, setLocale] = useState('en');
  const [controlsAutoHideDelay, setControlsAutoHideDelay] = useState(5000);
  const [primaryColor, setPrimaryColor] = useState('#e50914');
  const [overlayTitle, setOverlayTitle] = useState('');
  const [overlaySubtitle, setOverlaySubtitle] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelLogo, setChannelLogo] = useState('');
  const [epgTitle, setEpgTitle] = useState('');
  const [epgTime, setEpgTime] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [episodes, setEpisodes] = useState([]);
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [resizeMode, setResizeMode] = useState('contain');
  const [shutterColor, setShutterColor] = useState('#000000');
  const [subtitleColor, setSubtitleColor] = useState('#ffffff');
  const [subtitleBackgroundColor, setSubtitleBackgroundColor] = useState('rgba(0,0,0,.62)');
  const [subtitleFontSize, setSubtitleFontSize] = useState(34);
  const [forwardStep, setForwardStep] = useState(10);
  const [rewindStep, setRewindStep] = useState(10);
  const [seekTarget, setSeekTarget] = useState(0);
  const [progressInterval, setProgressInterval] = useState(500);
  const [selectedAudioType, setSelectedAudioType] = useState('system');
  const [selectedAudioValue, setSelectedAudioValue] = useState('');
  const [selectedTextType, setSelectedTextType] = useState('system');
  const [selectedTextValue, setSelectedTextValue] = useState('');
  const [bufferForPlaybackMs, setBufferForPlaybackMs] = useState(2500);
  const [bufferAfterRebufferMs, setBufferAfterRebufferMs] = useState(5000);
  const [maxBufferMs, setMaxBufferMs] = useState(50000);
  const [backBufferDurationMs, setBackBufferDurationMs] = useState(120000);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState('sin fuente');
  const [logs, setLogs] = useState([]);
  const autoAdvanceRef = useRef(false);
  const { active: electronPipActive, setActive: setElectronPipActive } = useElectronPip(true);
  const RewindStepIcon = rewindStep === 30 ? Replay30RoundedIcon : Replay10RoundedIcon;
  const ForwardStepIcon = forwardStep === 30 ? Forward30RoundedIcon : Forward10RoundedIcon;

  useEffect(() => {
    const android = isCapacitorAndroid();
    const webos = isWebOS();
    if (android) document.body.classList.add('capacitor-android');
    if (webos) document.body.classList.add('webos-tv');
    return () => {
      if (android) document.body.classList.remove('capacitor-android');
      if (webos) document.body.classList.remove('webos-tv');
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('electron-pip-active', electronPipActive);
    return () => document.body.classList.remove('electron-pip-active');
  }, [electronPipActive]);

  useEffect(() => {
    if (!pip && electronPipActive) setElectronPipActive(false).catch(() => {});
  }, [electronPipActive, pip, setElectronPipActive]);

  const bufferConfig = useMemo(() => ({
    bufferForPlaybackMs,
    bufferForPlaybackAfterRebufferMs: bufferAfterRebufferMs,
    maxBufferMs,
    backBufferDurationMs,
  }), [backBufferDurationMs, bufferAfterRebufferMs, bufferForPlaybackMs, maxBufferMs]);

  const selectedAudioTrack = useMemo(() => ({
    type: selectedAudioType,
    value: selectedAudioType === 'index' ? Number(selectedAudioValue) : selectedAudioValue,
  }), [selectedAudioType, selectedAudioValue]);

  const selectedTextTrack = useMemo(() => ({
    type: selectedTextType,
    value: selectedTextType === 'index' ? Number(selectedTextValue) : selectedTextValue,
  }), [selectedTextType, selectedTextValue]);

  const source = useMemo(() => ({
    uri: sourceUri,
    bufferConfig,
    poster: posterUrl ? { source: { uri: posterUrl }, resizeMode: 'cover' } : undefined,
  }), [bufferConfig, posterUrl, sourceUri]);
  const playerUserAgent = userAgent.trim();

  const playEpisode = useCallback((episodeList, nextIndex, reason = 'episode') => {
    const list = Array.isArray(episodeList) ? episodeList : [];
    const safeIndex = normalizeListIndex(nextIndex, list.length);
    const episode = list[safeIndex];
    const episodeUri = normalizeDemoUrl(getMediaUri(episode));
    if (!episodeUri) return false;

    autoAdvanceRef.current = ['auto-end', 'auto-progress', 'next-toast', 'credits-auto', 'credits-button'].includes(reason);
    setActiveChannelList(null);
    setEpisodes(list);
    setEpisodeIndex(safeIndex);
    setDraftUrl(episodeUri);
    setOverlayTitle(episode.title || '');
    setOverlaySubtitle(episode.subtitle || '');
    setChannelName(episode.channelName || '');
    setChannelLogo(episode.channelLogo || episode.logo || '');
    setEpgTime(episode.epgTime || '');
    setEpgTitle(episode.epgTitle || '');
    setIsLive(false);
    setSourceUri(episodeUri);
    setPaused(false);
    setCurrentTime(0);
    setDuration(0);
    setStatus('cargando');
    pushLog(setLogs, `${episode.title || 'Episodio'}: source actualizado`);
    return true;
  }, []);

  const playNextEpisode = useCallback((reason = 'next-episode') => {
    if (!episodes.length || episodeIndex >= episodes.length - 1) return false;
    return playEpisode(episodes, episodeIndex + 1, reason);
  }, [episodeIndex, episodes, playEpisode]);

  const skipEpisodeSegment = useCallback((segment) => {
    const targetTime = segment?.targetTime;
    if (targetTime === null || targetTime === undefined) return false;
    playerRef.current?.seekTo?.(targetTime);
    setCurrentTime(targetTime);
    pushLog(setLogs, `${getEpisodeSegmentLabel(segment.type, locale)}: ${Math.round(targetTime)}s`);
    return true;
  }, [locale]);

  const activeEpisode = episodes[episodeIndex] || null;
  const hasNextEpisode = episodes.length > 0 && episodeIndex < episodes.length - 1;
  const hasCreditSegments = hasEpisodeSegment(activeEpisode, 'credits');
  const topSegment = getActiveEpisodeSegment(activeEpisode, currentTime, duration, ['intro', 'recap']);
  const bottomSegment = getActiveEpisodeSegment(activeEpisode, currentTime, duration, ['credits', 'preview']);
  const progressPercent = duration > 0
    ? clamp((currentTime / duration) * 100, 0, 100)
    : 0;
  const showFallbackNextEpisode = !isLive
    && showNextEpisode
    && hasNextEpisode
    && !hasCreditSegments
    && progressPercent >= NEXT_EPISODE_TOAST_PCT
    && progressPercent < 100;
  const fallbackNextEpisodeProgress = showFallbackNextEpisode
    ? clamp(
      (progressPercent - NEXT_EPISODE_TOAST_PCT) / (NEXT_EPISODE_AUTO_PCT - NEXT_EPISODE_TOAST_PCT),
      0,
      1,
    )
    : 0;
  const topSegmentAction = topSegment?.targetTime !== null && topSegment?.targetTime !== undefined ? {
    visible: true,
    label: getEpisodeSegmentLabel(topSegment.type, locale),
    onPress: () => skipEpisodeSegment(topSegment),
  } : undefined;
  const bottomSegmentAction = bottomSegment?.type === 'credits' && hasNextEpisode ? {
    visible: true,
    label: getNextEpisodeLabel(locale),
    progress: getCreditAutoAdvanceProgress(bottomSegment, currentTime),
    onPress: () => playNextEpisode('credits-button'),
  } : bottomSegment?.type === 'preview' && bottomSegment?.targetTime !== null && bottomSegment?.targetTime !== undefined ? {
    visible: true,
    label: getEpisodeSegmentLabel('preview', locale),
    progress: getEpisodeSegmentProgress(bottomSegment, currentTime),
    onPress: () => skipEpisodeSegment(bottomSegment),
  } : showFallbackNextEpisode ? {
    visible: true,
    label: getNextEpisodeLabel(locale),
    progress: fallbackNextEpisodeProgress,
    onPress: () => playNextEpisode('next-toast'),
  } : undefined;

  const overlay = useMemo(() => ({
    title: overlayTitle,
    subtitle: overlaySubtitle,
    channelName,
    channelLogo,
    epgTitle,
    epgTime,
    live: isLive,
    segmentAction: topSegmentAction,
    autoContinue: bottomSegmentAction,
  }), [
    bottomSegmentAction,
    channelLogo,
    channelName,
    epgTime,
    epgTitle,
    isLive,
    overlaySubtitle,
    overlayTitle,
    topSegmentAction,
  ]);

  const load = (event) => {
    event.preventDefault();
    const value = normalizeDemoUrl(draftUrl);
    if (!value) return;

    const matchedEpisodeIndex = findItemIndexByUrl(EPISODES, value);
    if (matchedEpisodeIndex >= 0) {
      playEpisode(EPISODES, matchedEpisodeIndex, 'manual-episode');
      return;
    }

    autoAdvanceRef.current = false;
    setActiveChannelList(null);
    setEpisodes([]);
    setEpisodeIndex(0);
    setSourceUri(value);
    setPaused(!autoPlay);
    setCurrentTime(0);
    setDuration(0);
    setStatus('cargando');
    pushLog(setLogs, 'source actualizado');
  };

  const applyPreset = useCallback((preset) => {
    const presetUri = normalizeDemoUrl(preset.uri);
    const presetEpisodes = Array.isArray(preset.episodes)
      ? preset.episodes
      : findItemIndexByUrl(EPISODES, presetUri) >= 0
        ? EPISODES
        : [];

    if (presetEpisodes.length) {
      const matchedEpisodeIndex = findItemIndexByUrl(presetEpisodes, presetUri);
      const nextEpisodeIndex = preset.initialEpisodeIndex ?? (matchedEpisodeIndex >= 0 ? matchedEpisodeIndex : 0);
      playEpisode(presetEpisodes, nextEpisodeIndex, 'preset');
      return;
    }

    autoAdvanceRef.current = false;
    setDraftUrl(presetUri);
    setOverlayTitle(preset.title || '');
    setOverlaySubtitle(preset.subtitle || '');
    setChannelName(preset.channelName || '');
    setChannelLogo(preset.channelLogo || '');
    setEpgTime(preset.epgTime || '');
    setEpgTitle(preset.epgTitle || '');
    setIsLive(Boolean(preset.live));
    setActiveChannelList(null);
    setEpisodes([]);
    setEpisodeIndex(0);
    setSourceUri(presetUri);
    setPaused(false);
    setCurrentTime(0);
    setDuration(0);
    setStatus('cargando');
    pushLog(setLogs, `${preset.label}: source actualizado`);
  }, [playEpisode]);

  const openChannelList = useCallback(() => {
    const firstChannel = CHANNEL_LIST[0];
    if (!firstChannel) return;
    autoAdvanceRef.current = false;
    setDraftUrl(firstChannel.url);
    setIsLive(true);
    setActiveChannelList(CHANNEL_LIST);
    setEpisodes([]);
    setEpisodeIndex(0);
    setSourceUri(firstChannel.url);
    setPaused(false);
    setCurrentTime(0);
    setDuration(0);
    setStatus('cargando');
    pushLog(setLogs, 'Listado de canales: reproductor iniciado');
  }, []);

  const clearSource = useCallback(() => {
    autoAdvanceRef.current = false;
    setActiveChannelList(null);
    setEpisodes([]);
    setEpisodeIndex(0);
    setSourceUri('');
    setStatus('sin fuente');
    setCurrentTime(0);
    setDuration(0);
    pushLog(setLogs, 'reproductor cerrado');
  }, []);

  const handleBack = useCallback(() => {
    if (sourceUri) {
      clearSource();
      return;
    }

    if (isCapacitorAndroid()) {
      CapacitorApp.exitApp().catch(() => {});
    } else if (isWebOS()) {
      exitWebOSApp();
    } else {
      window.history.back();
    }
  }, [clearSource, sourceUri]);

  useAndroidBackButton(handleBack);
  useTvRemote({
    enabled: true,
    channelNavigationEnabled: () => Boolean(document.fullscreenElement),
    onChannelUp: () => playerRef.current?.nextChannel?.() || false,
    onChannelDown: () => playerRef.current?.previousChannel?.() || false,
    onPlayPause: () => playerRef.current?.toggle?.(),
    onPlay: () => playerRef.current?.play?.(),
    onPause: () => playerRef.current?.pause?.(),
    onStop: () => playerRef.current?.pause?.(),
    onRewind: () => playerRef.current?.jumpBy?.(-rewindStep),
    onFastForward: () => playerRef.current?.jumpBy?.(forwardStep),
    onBack: handleBack,
  });

  const callPlayer = (label, fn) => {
    try {
      const result = fn(playerRef.current);
      Promise.resolve(result).catch((error) => pushLog(setLogs, `${label}: ${error.message || error}`));
      pushLog(setLogs, label);
    } catch (error) {
      pushLog(setLogs, `${label}: ${error.message || error}`);
    }
  };

  const handlePlayerProgress = useCallback((event) => {
    const nextCurrentTime = Number(event.currentTime) || 0;
    const nextDuration = Number(event.duration || event.seekableDuration || duration) || 0;
    setCurrentTime(nextCurrentTime);
    if (nextDuration > 0) setDuration(nextDuration);

    if (!isLive && hasNextEpisode && !autoAdvanceRef.current) {
      const activeCredits = getActiveEpisodeSegment(activeEpisode, nextCurrentTime, nextDuration, ['credits']);
      if (
        activeCredits
        && getEpisodeSegmentElapsedSeconds(activeCredits, nextCurrentTime) >= CREDIT_AUTO_ADVANCE_SECONDS
      ) {
        playNextEpisode('credits-auto');
        return;
      }

      if (
        showNextEpisode
        && !hasEpisodeSegment(activeEpisode, 'credits')
        && nextDuration > 0
        && (nextCurrentTime / nextDuration) * 100 >= NEXT_EPISODE_AUTO_PCT
      ) {
        playNextEpisode('auto-progress');
      }
    }
  }, [activeEpisode, duration, hasNextEpisode, isLive, playNextEpisode, showNextEpisode]);

  const handlePlayerEnd = useCallback(() => {
    if (autoAdvanceRef.current) return;
    if (!isLive && hasNextEpisode && playNextEpisode('auto-end')) return;
    setStatus('ended');
    pushLog(setLogs, 'onEnd');
  }, [hasNextEpisode, isLive, playNextEpisode]);

  const canRenderPlayer = Boolean(sourceUri);

  return (
    <Container
      maxWidth={false}
      disableGutters={electronPipActive}
      sx={electronPipActive
        ? { width: '100vw', height: '100vh', p: 0, m: 0, bgcolor: '#000', overflow: 'hidden' }
        : { py: 2.5, px: { xs: 1.5, md: 3 } }}
    >
      <Stack spacing={electronPipActive ? 0 : 2} sx={electronPipActive ? { width: '100%', height: '100%' } : undefined}>
        {!electronPipActive && (
        <Box>
          <Typography variant="h4" component="h1" fontWeight={800}>
            VideoPlayer Lab
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Banco web para probar props y metodos del componente antes de llevarlos a Tizen.
          </Typography>
        </Box>
        )}

        {!electronPipActive && (
        <Paper component="form" onSubmit={load} sx={{ p: 1.5 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25}>
            <TextField
              fullWidth
              size="small"
              label="source.uri"
              placeholder="https://servidor/video.mkv | video.mp4 | playlist.m3u8"
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
              autoComplete="off"
            />
            <TextField
              size="small"
              label="userAgent"
              placeholder="Mozilla/5.0 ..."
              value={userAgent}
              onChange={(event) => setUserAgent(event.target.value)}
              autoComplete="off"
              sx={{ minWidth: { xs: '100%', lg: 360 } }}
            />
            <Button type="submit" variant="contained" startIcon={<PlayArrowRoundedIcon />} sx={{ minWidth: 150 }}>
              Cargar
            </Button>
          </Stack>
        </Paper>
        )}

        {!electronPipActive && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack spacing={1.1}>
            <Typography variant="subtitle1" fontWeight={700}>Contenido prellenado</Typography>
            <Typography variant="body2" color="text.secondary">
              Elige una opción para cargar automáticamente la URL, el título y los datos del canal.
            </Typography>
            <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
              {PLAYER_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="contained"
                  size="large"
                  onClick={() => applyPreset(preset)}
                  data-tv-focusable="true"
                  sx={{ minWidth: { xs: 150, md: 190 } }}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                type="button"
                variant="contained"
                color="secondary"
                size="large"
                onClick={openChannelList}
                data-tv-focusable="true"
                sx={{ minWidth: { xs: 190, md: 230 } }}
              >
                Listado de canales
              </Button>
            </Stack>
          </Stack>
        </Paper>
        )}

        <Box
          sx={electronPipActive ? {
            width: '100%',
            height: '100%',
            minHeight: 0,
          } : {
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(360px, 1fr)' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <Box
            sx={electronPipActive ? {
              width: '100%',
              height: '100%',
              '& > .MuiPaper-root': {
                width: '100%',
                height: '100%',
                border: 0,
                borderRadius: 0,
              },
              '& > .MuiPaper-root > .MuiBox-root': {
                width: '100%',
                height: '100%',
                aspectRatio: 'auto',
              },
            } : undefined}
          >
            {canRenderPlayer ? (
              <VideoPlayer
                ref={playerRef}
                source={source}
                controls={controls}
                showBackButton={showBackButton}
                locale={locale}
                controlsAutoHideDelay={controlsAutoHideDelay}
                primaryColor={primaryColor}
                overlay={overlay}
                channelList={activeChannelList || undefined}
                initialChannelIndex={0}
                userAgent={playerUserAgent || undefined}
                live={isLive || undefined}
                autoPlay={autoPlay}
                paused={paused}
                muted={muted}
                volume={volume}
                rate={rate}
                repeat={repeat}
                fullscreen={false}
                pip={pip}
                resizeMode={resizeMode}
                posterResizeMode="cover"
                progressUpdateInterval={progressInterval}
                forwardStep={forwardStep}
                rewindStep={rewindStep}
                selectedAudioTrack={selectedAudioTrack}
                selectedTextTrack={selectedTextTrack}
                shutterColor={shutterColor}
                subtitleColor={subtitleColor}
                subtitleFontSize={`${subtitleFontSize}px`}
                subtitleBackgroundColor={subtitleBackgroundColor}
                onLoadStart={(event) => {
                  setStatus('loadStart');
                  pushLog(setLogs, `onLoadStart: ${event.uri || ''}`);
                }}
                onLoad={(event) => {
                  autoAdvanceRef.current = false;
                  setDuration(event.duration || 0);
                  setCurrentTime(event.currentTime || 0);
                  setStatus('load');
                  pushLog(setLogs, `onLoad: ${formatTime(event.duration || 0)}`);
                }}
                onProgress={handlePlayerProgress}
                onPlay={() => {
                  setPaused(false);
                  setStatus('playing');
                  pushLog(setLogs, 'play');
                }}
                onPause={() => {
                  setPaused(true);
                  setStatus('paused');
                  pushLog(setLogs, 'pause');
                }}
                onBuffer={(event) => {
                  pushLog(setLogs, `onBuffer: ${event.isBuffering ? 'true' : 'false'}`);
                }}
                onSeek={(event) => {
                  setCurrentTime(event.currentTime || 0);
                  pushLog(setLogs, `onSeek: ${formatTime(event.seekTime || 0)} -> ${formatTime(event.currentTime || 0)}`);
                }}
                onEnd={handlePlayerEnd}
                onError={(error) => {
                  setStatus('error');
                  pushLog(setLogs, `onError: ${getSafePlaybackErrorMessage(error, locale)}`);
                }}
                onReadyForDisplay={() => {
                  pushLog(setLogs, 'onReadyForDisplay');
                }}
                onPlaybackStateChanged={(event) => {
                  pushLog(setLogs, `onPlaybackStateChanged: playing=${event.isPlaying} seeking=${event.isSeeking}`);
                }}
                onPlaybackRateChange={(event) => {
                  pushLog(setLogs, `onPlaybackRateChange: ${event.playbackRate}`);
                }}
                onVolumeChange={(event) => {
                  pushLog(setLogs, `onVolumeChange: ${event.volume.toFixed?.(2) ?? event.volume} muted=${event.muted}`);
                }}
                onResizeModeChange={(nextResizeMode) => {
                  setResizeMode(nextResizeMode);
                  pushLog(setLogs, `onResizeModeChange: ${nextResizeMode}`);
                }}
                onAudioTracks={(event) => {
                  pushLog(setLogs, `onAudioTracks: ${event.audioTracks?.length || 0}`);
                }}
                onTextTracks={(event) => {
                  pushLog(setLogs, `onTextTracks: ${event.textTracks?.length || 0}`);
                }}
                onTextTrackDataChanged={(event) => {
                  const text = String(event.subtitleTracks || '').replace(/\s+/g, ' ').trim();
                  pushLog(setLogs, `onTextTrackDataChanged: ${text.slice(0, 48)}`);
                }}
                onVideoTracks={(event) => {
                  pushLog(setLogs, `onVideoTracks: ${event.videoTracks?.length || 0}`);
                }}
                onFullscreenPlayerWillPresent={() => pushLog(setLogs, 'onFullscreenPlayerWillPresent')}
                onFullscreenPlayerDidPresent={() => pushLog(setLogs, 'onFullscreenPlayerDidPresent')}
                onFullscreenPlayerWillDismiss={() => pushLog(setLogs, 'onFullscreenPlayerWillDismiss')}
                onFullscreenPlayerDidDismiss={() => pushLog(setLogs, 'onFullscreenPlayerDidDismiss')}
                onBack={handleBack}
              />
            ) : (
              <Alert severity="info">
                Carga una fuente para probar el componente. En web, MKV necesita CORS y HTTP Range.
              </Alert>
            )}
          </Box>

          {!electronPipActive && (
          <Box>
            <Paper sx={{ p: 1.5 }}>
              <Stack spacing={1.75}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>Estado</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {status} · {formatTime(currentTime)} / {formatTime(duration)}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RestartAltRoundedIcon />}
                    onClick={() => callPlayer('seekTo(0)', (player) => player?.seekTo(0))}
                  >
                    Reiniciar
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button variant="contained" startIcon={<PlayArrowRoundedIcon />} onClick={() => { setPaused(false); callPlayer('play()', (player) => player?.play()); }}>
                    Play
                  </Button>
                  <Button variant="outlined" startIcon={<PauseRoundedIcon />} onClick={() => { setPaused(true); callPlayer('pause()', (player) => player?.pause()); }}>
                    Pause
                  </Button>
                  <Button variant="outlined" startIcon={<RewindStepIcon />} onClick={() => callPlayer(`jumpBy(-${rewindStep})`, (player) => player?.jumpBy(-rewindStep))}>
                    -{rewindStep}s
                  </Button>
                  <Button variant="outlined" startIcon={<ForwardStepIcon />} onClick={() => callPlayer(`jumpBy(${forwardStep})`, (player) => player?.jumpBy(forwardStep))}>
                    +{forwardStep}s
                  </Button>
                  <Button variant="outlined" startIcon={<FullscreenRoundedIcon />} onClick={() => callPlayer('requestFullscreen()', (player) => player?.requestFullscreen())}>
                    Full
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="seekTo"
                    value={seekTarget}
                    onChange={(event) => setSeekTarget(Number(event.target.value))}
                    InputProps={{ endAdornment: <InputAdornment position="end">s</InputAdornment> }}
                  />
                  <Button variant="outlined" onClick={() => callPlayer(`seekTo(${seekTarget})`, (player) => player?.seekTo(seekTarget))}>
                    Ir
                  </Button>
                </Stack>

                <Divider />

                <Stack spacing={1}>
                  <FormControlLabel control={<Checkbox checked={controls} onChange={(event) => setControls(event.target.checked)} />} label="controls" />
                  <FormControlLabel control={<Checkbox checked={showBackButton} onChange={(event) => setShowBackButton(event.target.checked)} />} label="showBackButton" />
                  <FormControlLabel control={<Checkbox checked={pip} onChange={(event) => setPip(event.target.checked)} />} label="pip" />
                  <FormControlLabel control={<Checkbox checked={paused} onChange={(event) => setPaused(event.target.checked)} />} label="paused" />
                  <FormControlLabel control={<Checkbox checked={autoPlay} onChange={(event) => setAutoPlay(event.target.checked)} />} label="autoPlay" />
                  <FormControlLabel control={<Checkbox checked={muted} onChange={(event) => setMuted(event.target.checked)} />} label="muted" />
                  <FormControlLabel control={<Checkbox checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />} label="repeat" />
                </Stack>

                <Divider />

                <Typography variant="subtitle2">Overlay</Typography>
                <Stack direction="row" spacing={1}>
                  <TextField size="small" type="color" label="primaryColor" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} sx={{ width: 150 }} />
                  <FormControl size="small" sx={{ width: 130 }}>
                    <InputLabel id="locale-label">locale</InputLabel>
                    <Select labelId="locale-label" label="locale" value={locale} onChange={(event) => setLocale(event.target.value)}>
                      <MenuItem value="en">en</MenuItem>
                      <MenuItem value="es">es</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField size="small" type="number" label="autoHide ms" value={controlsAutoHideDelay} onChange={(event) => setControlsAutoHideDelay(Number(event.target.value) || 5000)} sx={{ width: 150 }} />
                  <FormControlLabel control={<Checkbox checked={isLive} onChange={(event) => setIsLive(event.target.checked)} />} label="live" />
                  <FormControlLabel control={<Checkbox checked={showNextEpisode} onChange={(event) => setShowNextEpisode(event.target.checked)} />} label="autoContinue" />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField fullWidth size="small" label="title" value={overlayTitle} onChange={(event) => setOverlayTitle(event.target.value)} />
                  <TextField fullWidth size="small" label="subtitle" value={overlaySubtitle} onChange={(event) => setOverlaySubtitle(event.target.value)} />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField fullWidth size="small" label="channelName" value={channelName} onChange={(event) => setChannelName(event.target.value)} />
                  <TextField fullWidth size="small" label="channelLogo" value={channelLogo} onChange={(event) => setChannelLogo(event.target.value)} />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField fullWidth size="small" label="epgTime" value={epgTime} onChange={(event) => setEpgTime(event.target.value)} />
                  <TextField fullWidth size="small" label="epgTitle" value={epgTitle} onChange={(event) => setEpgTitle(event.target.value)} />
                </Stack>

                <Box>
                  <Typography variant="caption" color="text.secondary">volume: {volume.toFixed(2)}</Typography>
                  <Slider min={0} max={1} step={0.01} value={volume} onChange={(_, value) => setVolume(Number(value))} />
                </Box>

                <Stack direction="row" spacing={1}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="rate-label">rate</InputLabel>
                    <Select labelId="rate-label" label="rate" value={rate} onChange={(event) => setRate(Number(event.target.value))}>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => <MenuItem key={value} value={value}>{value}x</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel id="resize-label">resizeMode</InputLabel>
                    <Select labelId="resize-label" label="resizeMode" value={resizeMode} onChange={(event) => setResizeMode(event.target.value)}>
                      {['contain', 'cover', 'stretch', 'center', 'none'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack direction="row" spacing={1}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="forward-step-label">forwardStep</InputLabel>
                    <Select labelId="forward-step-label" label="forwardStep" value={forwardStep} onChange={(event) => setForwardStep(Number(event.target.value))}>
                      {SEEK_STEP_OPTIONS.map((value) => <MenuItem key={value} value={value}>{value}s</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel id="rewind-step-label">rewindStep</InputLabel>
                    <Select labelId="rewind-step-label" label="rewindStep" value={rewindStep} onChange={(event) => setRewindStep(Number(event.target.value))}>
                      {SEEK_STEP_OPTIONS.map((value) => <MenuItem key={value} value={value}>{value}s</MenuItem>)}
                    </Select>
                  </FormControl>
                </Stack>

                <Divider />

                <Typography variant="subtitle2">{isSpanishLocale(locale) ? 'Subtítulos' : 'Subtitles'}</Typography>
                <Stack direction="row" spacing={1}>
                  <TextField size="small" type="color" label="Color texto" value={subtitleColor} onChange={(event) => setSubtitleColor(event.target.value)} sx={{ width: 130 }} />
                  <TextField size="small" type="number" label="Tamaño" value={subtitleFontSize} onChange={(event) => setSubtitleFontSize(Number(event.target.value) || 34)} />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  subtitleColor: {subtitleColor}
                </Typography>
                <TextField size="small" label="subtitleBackgroundColor" value={subtitleBackgroundColor} onChange={(event) => setSubtitleBackgroundColor(event.target.value)} />

                <Typography variant="subtitle2">Video</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    type="color"
                    label="Fondo sin video"
                    value={shutterColor}
                    onChange={(event) => setShutterColor(event.target.value)}
                    sx={{ width: 150 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    shutterColor: {shutterColor}
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={1}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="audio-type-label">Audio</InputLabel>
                    <Select labelId="audio-type-label" label="Audio" value={selectedAudioType} onChange={(event) => setSelectedAudioType(event.target.value)}>
                      {['system', 'language', 'title', 'index', 'disabled'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField size="small" label="value" value={selectedAudioValue} onChange={(event) => setSelectedAudioValue(event.target.value)} disabled={selectedAudioType === 'system' || selectedAudioType === 'disabled'} />
                </Stack>

                <Stack direction="row" spacing={1}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="text-type-label">Subs</InputLabel>
                    <Select labelId="text-type-label" label="Subs" value={selectedTextType} onChange={(event) => setSelectedTextType(event.target.value)}>
                      {['system', 'language', 'title', 'index', 'disabled'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField size="small" label="value" value={selectedTextValue} onChange={(event) => setSelectedTextValue(event.target.value)} disabled={selectedTextType === 'system' || selectedTextType === 'disabled'} />
                </Stack>

                <Divider />

                <Typography variant="subtitle2">Buffer</Typography>
                <Stack direction="row" spacing={1}>
                  <TextField size="small" type="number" label="playback ms" value={bufferForPlaybackMs} onChange={(event) => setBufferForPlaybackMs(Number(event.target.value) || 2500)} />
                  <TextField size="small" type="number" label="rebuffer ms" value={bufferAfterRebufferMs} onChange={(event) => setBufferAfterRebufferMs(Number(event.target.value) || 5000)} />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField size="small" type="number" label="maxBuffer ms" value={maxBufferMs} onChange={(event) => setMaxBufferMs(Number(event.target.value) || 50000)} />
                  <TextField size="small" type="number" label="backBuffer ms" value={backBufferDurationMs} onChange={(event) => setBackBufferDurationMs(Number(event.target.value) || 120000)} />
                </Stack>
                <TextField size="small" type="number" label="progressUpdateInterval ms" value={progressInterval} onChange={(event) => setProgressInterval(Number(event.target.value) || 500)} />

                <Divider />

                <TextField size="small" label="poster.source.uri" value={posterUrl} onChange={(event) => setPosterUrl(event.target.value)} />

                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Eventos</Typography>
                  <Paper variant="outlined" sx={{ p: 1, bgcolor: 'rgba(0,0,0,.18)', minHeight: 112 }}>
                    {logs.length ? logs.map((item) => (
                      <Typography key={item} variant="caption" component="div" sx={{ fontFamily: 'monospace' }}>
                        {item}
                      </Typography>
                    )) : (
                      <Typography variant="caption" color="text.secondary">Sin eventos todavia.</Typography>
                    )}
                  </Paper>
                </Box>
              </Stack>
            </Paper>
          </Box>
          )}
        </Box>
      </Stack>
    </Container>
  );
}
