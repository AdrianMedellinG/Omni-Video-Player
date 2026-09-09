import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function parseJsonValue(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toArray(value, keys = []) {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return [];
}

function firstEpgItem(value) {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) return parsed[0] || {};
  if (!parsed || typeof parsed !== 'object') return {};
  if (parsed.epgTime !== undefined || parsed.epgTitle !== undefined) return parsed;
  if (parsed.epg !== undefined) return firstEpgItem(parsed.epg);
  if (parsed.data !== undefined) return firstEpgItem(parsed.data);
  return parsed;
}

function getEpgForChannel(channel, externalEpg, index) {
  const ownEpg = channel.epg
    ?? channel.epgData
    ?? channel.channelEpg
    ?? channel.program
    ?? channel.programs;
  if (ownEpg !== undefined) return firstEpgItem(ownEpg);

  const parsedExternalEpg = parseJsonValue(externalEpg);
  if (Array.isArray(parsedExternalEpg)) {
    // A top-level EPG list is matched to the channel list by index.
    return firstEpgItem(parsedExternalEpg[index]);
  }
  return firstEpgItem(parsedExternalEpg);
}

export function normalizeChannelList(channelList, externalEpg) {
  const parsedChannelList = parseJsonValue(channelList);
  const channels = toArray(parsedChannelList, ['channels', 'channelList', 'data']);
  const fallbackEpg = externalEpg ?? parsedChannelList?.epg ?? parsedChannelList?.epgList;
  return channels
    .map((item, index) => {
      const channel = item && typeof item === 'object' ? item : { url: item };
      const url = String(channel.url || channel.uri || channel.src || '').trim();
      if (!url) return null;

      const epg = getEpgForChannel(channel, fallbackEpg, index);
      return {
        ...channel,
        url,
        channelName: channel.channelName ?? channel.name ?? channel.channel ?? '',
        channelLogo: channel.channelLogo ?? channel.logo ?? '',
        epgTime: channel.epgTime ?? epg.epgTime ?? epg.time ?? '',
        epgTitle: channel.epgTitle ?? epg.epgTitle ?? epg.title ?? '',
        live: channel.live ?? channel.isLive ?? true,
      };
    })
    .filter(Boolean);
}

function normalizeIndex(value, length) {
  if (!length) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const integer = Math.trunc(number);
  return ((integer % length) + length) % length;
}

/**
 * Keeps channel selection in the wrapper so changing a channel does not
 * remount the fullscreen element. The media engine only receives a new URL.
 */
export function useChannelList({
  channelList,
  channels,
  epg,
  initialChannelIndex = 0,
  startChannelIndex,
  onChannelChange,
} = {}) {
  const inputList = channelList ?? channels;
  const list = useMemo(
    () => normalizeChannelList(inputList, epg),
    [epg, inputList],
  );
  const signature = useMemo(
    () => list.map((channel) => `${channel.url}\u0000${channel.channelName}`).join('\u0001'),
    [list],
  );
  const requestedIndex = startChannelIndex ?? initialChannelIndex;
  const initialIndexRef = useRef(normalizeIndex(requestedIndex, list.length));
  const [channelIndex, setChannelIndex] = useState(initialIndexRef.current);
  const channelIndexRef = useRef(channelIndex);
  const previousSignatureRef = useRef(signature);
  const requestedIndexRef = useRef(requestedIndex);
  const onChannelChangeRef = useRef(onChannelChange);
  onChannelChangeRef.current = onChannelChange;
  channelIndexRef.current = channelIndex;

  useEffect(() => {
    if (previousSignatureRef.current !== signature) {
      previousSignatureRef.current = signature;
      requestedIndexRef.current = requestedIndex;
      const nextIndex = normalizeIndex(requestedIndex, list.length);
      channelIndexRef.current = nextIndex;
      setChannelIndex(nextIndex);
      return;
    }

    if (requestedIndexRef.current !== requestedIndex) {
      requestedIndexRef.current = requestedIndex;
      const nextIndex = normalizeIndex(requestedIndex, list.length);
      channelIndexRef.current = nextIndex;
      setChannelIndex(nextIndex);
      return;
    }

    if (channelIndexRef.current >= list.length && list.length) {
      const nextIndex = normalizeIndex(channelIndexRef.current, list.length);
      channelIndexRef.current = nextIndex;
      setChannelIndex(nextIndex);
    }
  }, [list.length, requestedIndex, signature]);

  const selectChannel = useCallback((value, reason = 'programmatic') => {
    if (!list.length) return false;
    const nextIndex = normalizeIndex(value, list.length);
    const previousIndex = normalizeIndex(channelIndexRef.current, list.length);
    if (nextIndex === previousIndex) return false;

    channelIndexRef.current = nextIndex;
    setChannelIndex(nextIndex);
    onChannelChangeRef.current?.({
      index: nextIndex,
      previousIndex,
      channel: list[nextIndex],
      previousChannel: list[previousIndex],
      reason,
    });
    return true;
  }, [list]);

  const nextChannel = useCallback(() => (
    selectChannel(channelIndexRef.current + 1, 'remote-up')
  ), [selectChannel]);

  const previousChannel = useCallback(() => (
    selectChannel(channelIndexRef.current - 1, 'remote-down')
  ), [selectChannel]);

  return {
    channels: list,
    channelIndex,
    activeChannel: list[channelIndex] || null,
    hasChannels: list.length > 0,
    selectChannel,
    nextChannel,
    previousChannel,
  };
}

export function getChannelOverlay(overlay, channel) {
  if (!channel) return overlay;
  return {
    ...(overlay || {}),
    channelName: channel.channelName,
    channelLogo: channel.channelLogo,
    epgTime: channel.epgTime,
    epgTitle: channel.epgTitle,
    live: channel.live,
  };
}
