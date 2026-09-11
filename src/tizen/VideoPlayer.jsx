import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Alert } from '@mui/material';
import BaseVideoPlayer from '../components/VideoPlayer.jsx';
import TizenAvPlayer from './TizenAvPlayer.jsx';
import { isSamsungTizen } from './tizenRuntime.js';
import { getChannelOverlay, useChannelList } from '../utils/channelList.js';
import {
  getUserAgentFromHeaders,
  isLikelyLiveSource,
  normalizeVideoSource,
  sanitizeRequestHeaders,
} from '../utils/playerProps.js';

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
  const [forceWeb, setForceWeb] = useState(false);
  const playerRef = useRef(null);
  const handleUnsupported = useCallback(() => setForceWeb(true), []);
  const channelState = useChannelList({
    channelList,
    channels,
    epg,
    initialChannelIndex,
    startChannelIndex,
    onChannelChange,
  });
  const { activeChannel, hasChannels, nextChannel, previousChannel, channelIndex } = channelState;
  const activeSource = useMemo(() => {
    if (!activeChannel) return source;
    const sourceObject = source && typeof source === 'object' ? source : {};
    return { ...sourceObject, ...activeChannel, uri: activeChannel.url };
  }, [activeChannel, source]);
  const sourceInfo = useMemo(
    () => normalizeVideoSource(activeSource, activeChannel?.url || src),
    [activeChannel?.url, activeSource, src],
  );
  const playerSrc = sourceInfo.uri;
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
  const resolvedProps = {
    ...playerProps,
    overlay: resolvedOverlay,
    headers: resolvedHeaders,
    userAgent: resolvedUserAgent,
    locale: resolvedLocale,
    bufferConfig: playerProps.bufferConfig || activeChannel?.bufferConfig || sourceInfo.bufferConfig,
    contentStartTime: playerProps.contentStartTime ?? sourceInfo.contentStartTime,
    drm: playerProps.drm || activeChannel?.drm || sourceInfo.drm,
    live: playerProps.live ?? activeChannel?.live ?? sourceInfo.live ?? isLikelyLiveSource(playerSrc),
  };

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
    setResizeMode: (...args) => playerRef.current?.setResizeMode?.(...args),
    toggleResizeMode: (...args) => playerRef.current?.toggleResizeMode?.(...args),
    getResizeMode: (...args) => playerRef.current?.getResizeMode?.(...args),
    selectChannel: (...args) => channelState.selectChannel?.(...args),
    nextChannel,
    previousChannel,
    getCurrentChannel: () => channelState.activeChannel,
    getCurrentChannelIndex: () => channelState.channelIndex,
  }), [channelState.activeChannel, channelState.channelIndex, channelState.selectChannel, nextChannel, previousChannel]);

  if (!playerSrc) return null;

  if (!isSamsungTizen()) {
    return (
      <>
        <Alert severity="warning" sx={{ mb: 2 }}>
          El build Tizen se está ejecutando fuera de un Samsung TV. Se usará el motor web para previsualización.
        </Alert>
        <BaseVideoPlayer
          ref={playerRef}
          src={playerSrc}
          source={source}
          channelList={channelList ?? channels}
          epg={epg}
          initialChannelIndex={channelIndex}
          channelNavigation={channelNavigation}
          onChannelChange={(event) => channelState.selectChannel(event.index, event.reason)}
          {...resolvedProps}
        />
      </>
    );
  }

  if (forceWeb) {
    return (
      <BaseVideoPlayer
        ref={playerRef}
        src={playerSrc}
        source={source}
        channelList={channelList ?? channels}
        epg={epg}
        initialChannelIndex={channelIndex}
        channelNavigation={channelNavigation}
        onChannelChange={(event) => channelState.selectChannel(event.index, event.reason)}
        {...resolvedProps}
      />
    );
  }

  return (
    <TizenAvPlayer
      ref={playerRef}
      src={playerSrc}
      sourceInfo={sourceInfo}
      onUnsupported={handleUnsupported}
      onChannelUp={nextChannel}
      onChannelDown={previousChannel}
      channelNavigationEnabled={Boolean(hasChannels && channelNavigation)}
      {...resolvedProps}
    />
  );
});

export default VideoPlayer;
