import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import VideoPlayer from './tizen/VideoPlayer.jsx';
import { useTvRemote } from './tizen/useTvRemote.js';
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getMediaUri(item) {
  return String(item?.uri || item?.url || item?.src || '').trim();
}

function normalizeDemoUrl(value) {
  const clean = String(value || '')
    .trim()
    .replace(/\\([()])/g, '$1');

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

export default function TizenApp() {
  const playerRef = useRef(null);
  const [url, setUrl] = useState('');
  const [src, setSrc] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [locale, setLocale] = useState('es');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelLogo, setChannelLogo] = useState('');
  const [epgTime, setEpgTime] = useState('');
  const [epgTitle, setEpgTitle] = useState('');
  const [live, setLive] = useState(false);
  const [activeChannelList, setActiveChannelList] = useState(null);
  const [initialChannelIndex, setInitialChannelIndex] = useState(0);
  const [episodes, setEpisodes] = useState([]);
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const autoAdvanceRef = useRef(false);
  useTvRemote({ enabled: !src });

  const resetProgress = useCallback(() => {
    autoAdvanceRef.current = false;
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const closePlayer = useCallback(() => {
    setSrc('');
    resetProgress();
  }, [resetProgress]);

  const playEpisode = useCallback((episodeList, nextIndex, reason = 'episode') => {
    const list = Array.isArray(episodeList) ? episodeList : [];
    const safeIndex = normalizeListIndex(nextIndex, list.length);
    const episode = list[safeIndex];
    const episodeUri = normalizeDemoUrl(getMediaUri(episode));
    if (!episodeUri) return false;

    autoAdvanceRef.current = ['auto-end', 'auto-progress', 'next-toast', 'credits-auto', 'credits-button'].includes(reason);
    setActiveChannelList(null);
    setInitialChannelIndex(0);
    setEpisodes(list);
    setEpisodeIndex(safeIndex);
    setUrl(episodeUri);
    setTitle(episode.title || '');
    setSubtitle(episode.subtitle || '');
    setChannelName(episode.channelName || '');
    setChannelLogo(episode.channelLogo || episode.logo || '');
    setEpgTime(episode.epgTime || '');
    setEpgTitle(episode.epgTitle || '');
    setLive(false);
    setCurrentTime(0);
    setDuration(0);
    setSrc(episodeUri);
    return true;
  }, []);

  const playNextEpisode = useCallback((reason = 'next-episode') => {
    if (!episodes.length || episodeIndex >= episodes.length - 1) return false;
    return playEpisode(episodes, episodeIndex + 1, reason);
  }, [episodeIndex, episodes, playEpisode]);

  const submit = useCallback((event) => {
    event.preventDefault();
    const value = normalizeDemoUrl(url);
    if (!value) return;

    const matchedEpisodeIndex = findItemIndexByUrl(EPISODES, value);
    if (matchedEpisodeIndex >= 0) {
      playEpisode(EPISODES, matchedEpisodeIndex, 'manual-episode');
      return;
    }

    setActiveChannelList(null);
    setInitialChannelIndex(0);
    setEpisodes([]);
    setEpisodeIndex(0);
    setSubtitle('');
    setLive(false);
    resetProgress();
    setSrc(value);
  }, [playEpisode, resetProgress, url]);

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

    const channelIndex = preset.live ? findItemIndexByUrl(CHANNEL_LIST, presetUri) : -1;
    const presetChannelList = preset.live
      ? (channelIndex >= 0 ? CHANNEL_LIST : [{
        url: presetUri,
        channelName: preset.channelName || '',
        channelLogo: preset.channelLogo || '',
        epg: {
          epgTime: preset.epgTime || '',
          epgTitle: preset.epgTitle || '',
        },
        live: true,
      }])
      : null;

    autoAdvanceRef.current = false;
    setUrl(presetUri);
    setTitle(preset.title || '');
    setSubtitle(preset.subtitle || '');
    setChannelName(preset.channelName || '');
    setChannelLogo(preset.channelLogo || '');
    setEpgTime(preset.epgTime || '');
    setEpgTitle(preset.epgTitle || '');
    setLive(Boolean(preset.live));
    setActiveChannelList(presetChannelList);
    setInitialChannelIndex(channelIndex >= 0 ? channelIndex : 0);
    setEpisodes([]);
    setEpisodeIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setSrc(presetUri);
  }, [playEpisode]);

  const openChannelList = useCallback(() => {
    const firstChannel = CHANNEL_LIST[0];
    if (!firstChannel) return;
    autoAdvanceRef.current = false;
    setUrl(firstChannel.url);
    setTitle('');
    setSubtitle('');
    setChannelName('');
    setChannelLogo('');
    setEpgTime('');
    setEpgTitle('');
    setLive(true);
    setActiveChannelList(CHANNEL_LIST);
    setInitialChannelIndex(0);
    setEpisodes([]);
    setEpisodeIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setSrc(firstChannel.url);
  }, []);

  const skipEpisodeSegment = useCallback((segment) => {
    const targetTime = segment?.targetTime;
    if (targetTime === null || targetTime === undefined) return false;
    playerRef.current?.seekTo?.(targetTime);
    setCurrentTime(targetTime);
    return true;
  }, []);

  const activeEpisode = episodes[episodeIndex] || null;
  const hasNextEpisode = episodes.length > 0 && episodeIndex < episodes.length - 1;
  const hasCreditSegments = hasEpisodeSegment(activeEpisode, 'credits');
  const topSegment = getActiveEpisodeSegment(activeEpisode, currentTime, duration, ['intro', 'recap']);
  const bottomSegment = getActiveEpisodeSegment(activeEpisode, currentTime, duration, ['credits', 'preview']);
  const progressPercent = duration > 0
    ? clamp((currentTime / duration) * 100, 0, 100)
    : 0;
  const showNextEpisode = !live
    && hasNextEpisode
    && !hasCreditSegments
    && progressPercent >= NEXT_EPISODE_TOAST_PCT
    && progressPercent < 100;
  const nextEpisodeProgress = showNextEpisode
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
  } : showNextEpisode ? {
    visible: true,
    label: getNextEpisodeLabel(locale),
    progress: nextEpisodeProgress,
    onPress: () => playNextEpisode('next-toast'),
  } : undefined;
  const overlay = useMemo(() => ({
    title,
    subtitle,
    channelName,
    channelLogo,
    epgTime,
    epgTitle,
    live,
    segmentAction: topSegmentAction,
    autoContinue: bottomSegmentAction,
  }), [
    bottomSegmentAction,
    channelLogo,
    channelName,
    epgTime,
    epgTitle,
    live,
    subtitle,
    title,
    topSegmentAction,
  ]);

  const handleLoad = useCallback((event) => {
    autoAdvanceRef.current = false;
    setCurrentTime(Number(event?.currentTime) || 0);
    setDuration(Number(event?.duration || event?.seekableDuration) || 0);
  }, []);

  const handleProgress = useCallback((event) => {
    const nextCurrentTime = Number(event?.currentTime) || 0;
    const nextDuration = Number(event?.duration || event?.seekableDuration || duration) || 0;

    setCurrentTime(nextCurrentTime);
    if (nextDuration > 0) setDuration(nextDuration);

    if (!live && hasNextEpisode && !autoAdvanceRef.current) {
      const activeCredits = getActiveEpisodeSegment(activeEpisode, nextCurrentTime, nextDuration, ['credits']);
      if (
        activeCredits
        && getEpisodeSegmentElapsedSeconds(activeCredits, nextCurrentTime) >= CREDIT_AUTO_ADVANCE_SECONDS
      ) {
        playNextEpisode('credits-auto');
        return;
      }

      if (
        !hasEpisodeSegment(activeEpisode, 'credits')
        && nextDuration > 0
        && (nextCurrentTime / nextDuration) * 100 >= NEXT_EPISODE_AUTO_PCT
      ) {
        playNextEpisode('auto-progress');
      }
    }
  }, [activeEpisode, duration, hasNextEpisode, live, playNextEpisode]);

  const handleEnd = useCallback(() => {
    if (autoAdvanceRef.current) return;
    if (!live && hasNextEpisode && playNextEpisode('auto-end')) return;
    closePlayer();
  }, [closePlayer, hasNextEpisode, live, playNextEpisode]);

  if (src) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', bgcolor: 'transparent', overflow: 'hidden' }}>
        <VideoPlayer
          ref={playerRef}
          key={src}
          src={src}
          locale={locale}
          userAgent={userAgent.trim() || undefined}
          channelList={activeChannelList || undefined}
          initialChannelIndex={initialChannelIndex}
          channelNavigation={Boolean(live && activeChannelList?.length)}
          overlay={overlay}
          autoPlay
          paused={false}
          fullscreen
          showBackButton
          controlsAutoHideDelay={3500}
          onLoad={handleLoad}
          onProgress={handleProgress}
          onEnd={handleEnd}
          onBack={closePlayer}
        />
      </Box>
    );
  }

  return (
    <Container maxWidth={false} sx={{ width: '100%', px: 5, py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h3" component="h1" fontWeight={800}>VideoPlayer · Samsung TV</Typography>
          <Typography color="text.secondary" sx={{ mt: .5 }}>
            AVPlay nativo para MKV, MP4 y HLS/M3U8. El motor web queda como fallback.
          </Typography>
        </Box>

        <Paper component="form" onSubmit={submit} sx={{ p: 2 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              fullWidth
              label="URL del video"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              inputProps={{ 'data-tv-focusable': 'true' }}
            />
            <TextField
              label="User-Agent"
              value={userAgent}
              onChange={(event) => setUserAgent(event.target.value)}
              inputProps={{ 'data-tv-focusable': 'true' }}
              sx={{ width: 430, flex: '0 0 430px' }}
            />
            <FormControl sx={{ width: 150, flex: '0 0 150px' }}>
              <InputLabel id="tizen-locale-label">Idioma</InputLabel>
              <Select
                labelId="tizen-locale-label"
                label="Idioma"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                inputProps={{ 'data-tv-focusable': 'true' }}
              >
                <MenuItem value="en">en</MenuItem>
                <MenuItem value="es">es</MenuItem>
              </Select>
            </FormControl>
            <Button
              type="submit"
              variant="contained"
              size="large"
              startIcon={<PlayCircleOutlineRoundedIcon />}
              data-tv-focusable="true"
              sx={{ minWidth: 200 }}
            >
              Reproducir
            </Button>
          </Stack>
        </Paper>

        {!src && (
          <>
            <Alert severity="info">
              En TV Samsung se prioriza AVPlay para aprovechar el decoder de hardware. Usa HTTPS y permite acceso de red desde config.xml.
            </Alert>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.25}>
                <Typography variant="h5" fontWeight={700}>Contenido prellenado</Typography>
                <Typography color="text.secondary">
                  Selecciona una opción para llenar automáticamente la URL, el título y los datos del canal.
                </Typography>
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  {PLAYER_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="contained"
                      size="large"
                      onClick={() => applyPreset(preset)}
                      data-tv-focusable="true"
                      sx={{ minWidth: 190 }}
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
                    sx={{ minWidth: 190 }}
                  >
                    Listado de canales
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          </>
        )}

      </Stack>
    </Container>
  );
}
