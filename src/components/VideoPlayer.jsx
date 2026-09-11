import { Alert } from '@mui/material';
import { forwardRef, lazy, Suspense, useImperativeHandle, useMemo, useRef } from 'react';
import StandardPlayer from './StandardPlayer.jsx';
import { useTvRemote } from '../tizen/useTvRemote.js';
import { getChannelOverlay, useChannelList } from '../utils/channelList.js';
import {
  getUserAgentFromHeaders,
  isLikelyLiveSource,
  normalizeVideoSource,
  sanitizeRequestHeaders,
} from '../utils/playerProps.js';

const MkvPlayer = lazy(() => import('./MkvPlayer.jsx'));

function mediaTypeFromUrl(src) {
  try {
    const pathname = new URL(src, window.location.href).pathname.toLowerCase();
    if (pathname.endsWith('.mkv')) return 'mkv';
    if (pathname.endsWith('.m3u8')) return 'hls';
    if (pathname.endsWith('.mp4') || pathname.endsWith('.m4v') || pathname.endsWith('.webm') || pathname.endsWith('.mov')) return 'native';
  } catch {
    const clean = String(src).split('?')[0].split('#')[0].toLowerCase();
    if (clean.endsWith('.mkv')) return 'mkv';
    if (clean.endsWith('.m3u8')) return 'hls';
    if (/\.(mp4|m4v|webm|mov)$/.test(clean)) return 'native';
  }
  return 'native';
}

const VideoPlayer = forwardRef(function VideoPlayer({
  src,
  source,
  channelList,
  channels,
  epg,
  initialChannelIndex = 0,
  startChannelIndex,
  channelNavigation = true,
  onChannelChange,
  ...playerProps
}, ref) {
  const playerRef = useRef(null);
  const channelState = useChannelList({
    channelList,
    channels,
    epg,
    initialChannelIndex,
    startChannelIndex,
    onChannelChange,
  });
  const { activeChannel, hasChannels, nextChannel, previousChannel } = channelState;
  const activeSource = useMemo(() => {
    if (!activeChannel) return source;
    const sourceObject = source && typeof source === 'object' ? source : {};
    return {
      ...sourceObject,
      ...activeChannel,
      uri: activeChannel.url,
    };
  }, [activeChannel, source]);
  const sourceInfo = useMemo(
    () => normalizeVideoSource(activeSource, activeChannel?.url || src),
    [activeChannel?.url, activeSource, src],
  );
  const playerSrc = sourceInfo.uri;
  const type = sourceInfo.type || mediaTypeFromUrl(playerSrc);
  const resolvedOverlay = useMemo(
    () => getChannelOverlay(playerProps.overlay, activeChannel),
    [activeChannel, playerProps.overlay],
  );
  const resolvedHeaders = useMemo(
    () => sanitizeRequestHeaders(playerProps.headers || activeChannel?.headers || sourceInfo.headers),
    [activeChannel?.headers, playerProps.headers, sourceInfo.headers],
  );
  const resolvedUserAgent = playerProps.userAgent
    || activeChannel?.userAgent
    || sourceInfo.userAgent
    || getUserAgentFromHeaders(playerProps.headers);
  const resolvedLocale = playerProps.locale || sourceInfo.locale || 'en';

  useTvRemote({
    enabled: Boolean(hasChannels && channelNavigation && !playerProps.disableFocus),
    channelNavigationEnabled: () => Boolean(document.fullscreenElement),
    onChannelUp: nextChannel,
    onChannelDown: previousChannel,
  });

  useImperativeHandle(ref, () => ({
    play: (...args) => playerRef.current?.play?.(...args),
    pause: (...args) => playerRef.current?.pause?.(...args),
    toggle: (...args) => playerRef.current?.toggle?.(...args),
    seekTo: (...args) => playerRef.current?.seekTo?.(...args),
    jumpBy: (...args) => playerRef.current?.jumpBy?.(...args),
    getCurrentTime: (...args) => playerRef.current?.getCurrentTime?.(...args),
    getDuration: (...args) => playerRef.current?.getDuration?.(...args),
    setVolume: (...args) => playerRef.current?.setVolume?.(...args),
    setMuted: (...args) => playerRef.current?.setMuted?.(...args),
    setPlaybackRate: (...args) => playerRef.current?.setPlaybackRate?.(...args),
    selectAudio: (...args) => playerRef.current?.selectAudio?.(...args),
    selectSubtitle: (...args) => playerRef.current?.selectSubtitle?.(...args),
    requestFullscreen: (...args) => playerRef.current?.requestFullscreen?.(...args),
    selectChannel: (...args) => channelState.selectChannel?.(...args),
    requestPictureInPicture: (...args) => playerRef.current?.requestPictureInPicture?.(...args),
    setResizeMode: (...args) => playerRef.current?.setResizeMode?.(...args),
    toggleResizeMode: (...args) => playerRef.current?.toggleResizeMode?.(...args),
    getResizeMode: (...args) => playerRef.current?.getResizeMode?.(...args),
    nextChannel,
    previousChannel,
    getCurrentChannel: () => channelState.activeChannel,
    getCurrentChannelIndex: () => channelState.channelIndex,
  }), [channelState.activeChannel, channelState.channelIndex, channelState.selectChannel, nextChannel, previousChannel]);

  if (!playerSrc) return null;

  const resolvedProps = {
    ...playerProps,
    sourceInfo,
    overlay: resolvedOverlay,
    headers: resolvedHeaders,
    userAgent: resolvedUserAgent,
    locale: resolvedLocale,
    bufferConfig: playerProps.bufferConfig || activeChannel?.bufferConfig || sourceInfo.bufferConfig,
    contentStartTime: playerProps.contentStartTime ?? sourceInfo.contentStartTime,
    drm: playerProps.drm || activeChannel?.drm || sourceInfo.drm,
    live: playerProps.live ?? activeChannel?.live ?? sourceInfo.live ?? isLikelyLiveSource(playerSrc),
  };

  if (type === 'mkv') {
    return (
      <Suspense fallback={<Alert severity="info">Preparando reproductor MKV…</Alert>}>
        <MkvPlayer ref={playerRef} src={playerSrc} {...resolvedProps} />
      </Suspense>
    );
  }
  if (type === 'hls') return <StandardPlayer ref={playerRef} src={playerSrc} mode="hls" {...resolvedProps} />;
  if (type === 'native') return <StandardPlayer ref={playerRef} src={playerSrc} mode="native" {...resolvedProps} />;

  return <Alert severity="error">Formato de video no reconocido.</Alert>;
});

export default VideoPlayer;
