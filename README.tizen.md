# VideoPlayer for Samsung Tizen TV

Guide for using `VideoPlayer` in a React application for Samsung Tizen TV by installing the package from npm.

## Installation

```bash
npm i omni-video-player
```

Also install the base dependencies for your React app if they are not already present:

```bash
npm i react react-dom
```

## Import

```jsx
import VideoPlayer from 'omni-video-player';
```

You can also use the named export:

```jsx
import { VideoPlayer } from 'omni-video-player';
```

## Tizen Requirements

- Samsung Tizen TV Web Application.
- Tizen Studio with the Samsung TV Extension.
- Valid certificate for signing the `.wgt`.
- TV in Developer Mode or a Samsung TV emulator.
- Internet access from the TV for remote streams.
- The app HTML must load `$WEBAPIS/webapis/webapis.js`.

On a real Samsung TV, the package uses `webapis.avplay` when available. AVPlay does not exist in a normal browser, so a browser is not an equivalent test for codecs, remote-control behavior, or real performance.

## `config.xml` Configuration

Your Tizen app must include network and remote-control permissions:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget
  xmlns="http://www.w3.org/ns/widgets"
  xmlns:tizen="http://tizen.org/ns/widgets"
  id="http://example.com/my-video-app"
  version="1.0.0"
  viewmodes="maximized">
  <tizen:application
    id="ABCDE12345.MyVideoApp"
    package="ABCDE12345"
    required_version="4.0"/>
  <content src="index.html"/>
  <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
  <icon src="icon.png"/>
  <name>MyVideoApp</name>
  <tizen:profile name="tv-samsung"/>
  <tizen:setting screen-orientation="landscape" context-menu="disable" hwkey-event="enable"/>
  <tizen:privilege name="http://tizen.org/privilege/internet"/>
  <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
  <access origin="*" subdomains="true"/>
</widget>
```

In your `index.html`, add Web APIs before the React bundle:

```html
<script type="text/javascript" src="$WEBAPIS/webapis/webapis.js"></script>
```

## Basic Usage

```jsx
import { useRef } from 'react';
import VideoPlayer from 'omni-video-player';

export default function PlayerScreen() {
  const playerRef = useRef(null);

  return (
    <VideoPlayer
      ref={playerRef}
      source="https://cdn.example.com/video.mkv"
      locale="en"
      userAgent="ExampleVideoPlayer"
      fullscreen
      autoPlay
      controls
      onBack={() => console.log('close player')}
      onEnd={() => console.log('ended')}
      onError={({ error }) => console.error(error)}
    />
  );
}
```

## Movie

```jsx
<VideoPlayer
  source={{
    uri: 'https://cdn.example.com/movies/101.mkv',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    poster: 'https://cdn.example.com/posters/101.jpg',
    userAgent: 'ExampleVideoPlayer',
  }}
  overlay={{
    title: 'Movie 1',
    subtitle: '1080p - Latin Spanish',
    live: false,
  }}
  locale="en"
  fullscreen
  resizeMode="contain"
  onLoad={({ duration }) => console.log('duration', duration)}
/>
```

## Series

`VideoPlayer` plays one active source. For series, your screen keeps the episode index and changes `source` when appropriate.

```jsx
import { useMemo, useRef, useState } from 'react';
import VideoPlayer from 'omni-video-player';

const episodes = [
  {
    uri: 'https://cdn.example.com/show/s01e01.mkv',
    title: 'Episode 1',
    subtitle: 'Season 1',
    intro: [{ start_ms: null, end_ms: 23000 }],
    recap: [{ start_ms: 25000, end_ms: 134000 }],
    credits: [{ start_ms: 5801777, end_ms: null }],
    preview: [{ start_ms: 1680000, end_ms: 1740000 }],
  },
  {
    uri: 'https://cdn.example.com/show/s01e02.mkv',
    title: 'Episode 2',
    subtitle: 'Season 1',
  },
];

export default function SeriesScreen() {
  const playerRef = useRef(null);
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const episode = episodes[episodeIndex];
  const hasNext = episodeIndex < episodes.length - 1;

  const overlay = useMemo(() => ({
    title: episode.title,
    subtitle: episode.subtitle,
    autoContinue: hasNext
      ? {
          visible: true,
          label: 'Next episode',
          progress: 0,
          onPress: () => setEpisodeIndex((value) => value + 1),
        }
      : undefined,
  }), [episode, hasNext]);

  return (
    <VideoPlayer
      key={episode.uri}
      ref={playerRef}
      source={episode}
      overlay={overlay}
      locale="en"
      fullscreen
      onEnd={() => {
        if (hasNext) setEpisodeIndex((value) => value + 1);
      }}
    />
  );
}
```

## Live TV

```jsx
const channels = [
  {
    url: 'https://cdn.example.com/live/channel-1/master.m3u8',
    channelName: 'Channel 1',
    channelLogo: 'https://cdn.example.com/logos/channel-1.png',
    epg: { epgTime: '10:00 - 11:00', epgTitle: 'News' },
    live: true,
    userAgent: 'ExampleVideoPlayer',
  },
  {
    url: 'https://cdn.example.com/live/channel-2/master.m3u8',
    channelName: 'Channel 2',
    live: true,
  },
];

<VideoPlayer
  channelList={channels}
  initialChannelIndex={0}
  channelNavigation
  live
  fullscreen
  locale="en"
  onChannelChange={({ index, channel, previousIndex, reason }) => {
    console.log({ index, channel, previousIndex, reason });
  }}
/>;
```

## Supported Formats

Final support depends on the Samsung TV model, firmware, and installed codecs.

| URL/type | Tizen engine |
| --- | --- |
| `.mkv` | Samsung AVPlay |
| `.m3u8` | Samsung AVPlay HLS |
| `.mp4`, `.m4v`, `.mov` | Samsung AVPlay |
| `source.type` | Can declare `mkv`, `hls`, or `native` |

## `source`

`source` can be a string or an object. If both `source` and `src` are sent, `source` wins.

```jsx
<VideoPlayer
  source={{
    uri: 'https://cdn.example.com/video.mkv',
    type: 'mkv',
    headers: { Authorization: 'Bearer token' },
    userAgent: 'ExampleVideoPlayer',
    startPosition: 30000,
    poster: 'https://cdn.example.com/poster.jpg',
    live: false,
    bufferConfig: { maxBufferMs: 50000 },
  }}
/>
```

Accepted fields: `uri`, `url`, `src`, `type`, `headers`, `userAgent`, `user_agent`, `httpUserAgent`, `startPosition`, `cropStart`, `cropEnd`, `contentStartTime`, `bufferConfig`, `drm`, `metadata`, `poster`, `live`, `isLive`, `locale`.

IPTV-style User-Agent format is also accepted:

```jsx
<VideoPlayer source="https://cdn.example.com/video.mkv|User-Agent=ExampleVideoPlayer" />
```

## Episode Segments

Each episode can include `intro`, `recap`, `credits`, and `preview`. All of them are optional.

```js
{
  intro: [{ start_ms: null, end_ms: 23000 }],
  recap: [{ start_ms: 25000, end_ms: 134000 }],
  credits: [
    { start_ms: 5801777, end_ms: 6371111 },
    { start_ms: 6408000, end_ms: null },
  ],
  preview: [{ start_ms: 1680000, end_ms: 1740000 }],
}
```

| Segment | Alias | Expected UI |
| --- | --- | --- |
| `intro` | `intro` | `Skip Intro`, top right |
| `recap` | `recap`, `recaps`, `summary` | `Skip Recap`, top right |
| `credits` | `credits`, `creditos` | `Next episode`, bottom right |
| `preview` | `preview`, `previews`, `preveiw` | `Skip Preview`, bottom right |

Time fields:

| Field | Alias | Unit |
| --- | --- | --- |
| Start | `start_ms`, `startMs`, `startMilliseconds` | milliseconds |
| Start | `start_seconds`, `startSeconds`, `start` | seconds |
| End | `end_ms`, `endMs`, `endMilliseconds` | milliseconds |
| End | `end_seconds`, `endSeconds`, `end` | seconds |

Rules:

- `null`, `undefined`, or empty start is interpreted as `0`.
- `null`, `undefined`, or empty end uses the duration if it is already available.
- Invalid segments are ignored.
- In credits, you can auto-advance after 10 to 15 seconds inside the segment.
- If there is no segment data, keep your normal next-episode logic at the end.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `source` | `string \| object` | `undefined` | Main source. |
| `src` | `string` | `''` | Legacy source alias. |
| `channelList` | `array \| object \| string` | `undefined` | Channel list. |
| `channels` | `array \| object \| string` | `undefined` | Alias for `channelList`. |
| `epg` | `array \| object \| string` | `undefined` | External EPG for channels. |
| `initialChannelIndex` | `number` | `0` | Initial channel. |
| `startChannelIndex` | `number` | `undefined` | Initial channel with priority. |
| `channelNavigation` | `boolean` | `true` | Channel changes with remote/arrows. |
| `controls` | `boolean` | `true` | Shows controls. |
| `showBackButton` | `boolean` | `true` | Shows the Back button when `onBack` is provided. |
| `overlay` | `object` | `undefined` | Metadata, EPG, and floating actions. |
| `primaryColor` | `string` | `#e50914` | Primary color. |
| `locale` | `string` | `en` | `en` or `es`. |
| `controlsAutoHideDelay` | `number` | `5000` | Milliseconds before controls are hidden. |
| `maxRetries` | `number` | `5` | Maximum retries. |
| `retryDelayMs` | `number` | `3000` | Delay between retries. |
| `live` | `boolean` | Detected | Live mode. |
| `autoPlay` | `boolean` | `true` | Plays when prepared. |
| `paused` | `boolean` | `false` | Controlled/initial pause state. |
| `initialTime` | `number` | `0` | Initial second. |
| `seekStep` | `number` | `10` | Base seek step. |
| `forwardStep` | `number` | `seekStep` | Seconds to jump forward. |
| `rewindStep` | `number` | `seekStep` | Seconds to rewind. |
| `fullscreen` | `boolean` | `false` | Initial fullscreen state. |
| `headers` | `object` | `{}` | HTTP headers. |
| `userAgent` | `string` | `''` | User-Agent applied with AVPlay. |
| `bufferConfig` | `object` | See below | Buffer configuration. |
| `disableDisconnectError` | `boolean` | `false` | Ignores some close/disconnect errors. |
| `muted` | `boolean` | `false` | Mutes audio. |
| `volume` | `number` | `1` | Volume from `0` to `1`. |
| `rate` | `number` | `1` | Playback speed. |
| `repeat` | `boolean` | `false` | Repeats after ending. |
| `resizeMode` | `contain \| cover \| stretch \| none \| center` | `contain` | Visual fit mode. |
| `poster` | `string \| object` | `undefined` | Poster image. |
| `posterResizeMode` | `string` | `contain` | Poster fit mode. |
| `selectedAudioTrack` | `object` | `undefined` | Initial/controlled audio selection. |
| `selectedTextTrack` | `object` | `undefined` | Initial/controlled subtitle selection. |
| `subtitleColor` | `string` | `#fff` | Subtitle color. |
| `subtitleFontSize` | `string` | `34px` | Subtitle size. |
| `subtitleBackgroundColor` | `string` | `rgba(0,0,0,.62)` | Subtitle background. |
| `renderLoader` | `function \| ReactNode` | `undefined` | Custom loader. |
| `onBack` | `function` | `undefined` | Back key handler. |
| `onChannelChange` | `function` | `undefined` | Channel change event. |

`bufferConfig` defaults:

```js
{
  minBufferMs: 15000,
  maxBufferMs: 50000,
  bufferForPlaybackMs: 2500,
  bufferForPlaybackAfterRebufferMs: 5000,
  backBufferDurationMs: 120000,
  cacheSizeMB: 0,
}
```

## Overlay

```jsx
<VideoPlayer
  source="https://cdn.example.com/video.mkv"
  overlay={{
    title: 'Title',
    subtitle: 'Subtitle',
    channelName: 'Channel',
    channelLogo: 'https://cdn.example.com/logo.png',
    epgTime: '10:00 - 11:00',
    epgTitle: 'Program',
    live: true,
    segmentAction: {
      visible: true,
      label: 'Skip Intro',
      onPress: () => playerRef.current?.seekTo(23),
    },
    autoContinue: {
      visible: true,
      label: 'Next episode',
      progress: 0.5,
      onPress: () => goNextEpisode(),
    },
  }}
/>
```

## Events

| Event | Payload |
| --- | --- |
| `onLoadStart` | `{ isNetwork, type, uri }` |
| `onLoad` | `{ currentTime, duration, naturalSize, audioTracks, textTracks, videoTracks, trackId }` |
| `onReady` | Alias for `onLoad` |
| `onReadyForDisplay` | `undefined` |
| `onProgress` | `{ currentTime, playableDuration, seekableDuration, duration }` |
| `onBuffer` | `{ isBuffering }` |
| `onSeek` | `{ currentTime, seekTime }` |
| `onEnd` | `undefined` |
| `onEnded` | Alias for `onEnd` |
| `onError` | `{ error }` |
| `onPlay` | `undefined` |
| `onPause` | `undefined` |
| `onPlaybackStateChanged` | `{ isPlaying, isSeeking }` |
| `onPlaybackRateChange` | `{ playbackRate }` |
| `onVolumeChange` | `{ volume, muted }` |
| `onAudioTracks` | `{ audioTracks }` |
| `onTextTracks` | `{ textTracks }` |
| `onVideoTracks` | `{ videoTracks }` |
| `onTextTrackDataChanged` | `{ subtitleTracks }` |
| `onResizeModeChange` | `resizeMode` |
| `onFullscreenPlayerWillPresent` | `undefined` |
| `onFullscreenPlayerDidPresent` | `undefined` |
| `onFullscreenPlayerWillDismiss` | `undefined` |
| `onFullscreenPlayerDidDismiss` | `undefined` |

## Ref Methods

```jsx
const playerRef = useRef(null);

<VideoPlayer ref={playerRef} source="https://cdn.example.com/video.mkv" />;

playerRef.current.play();
playerRef.current.pause();
playerRef.current.seekTo(120);
playerRef.current.jumpBy(10);
playerRef.current.toggleResizeMode();
```

| Method | Signature |
| --- | --- |
| `play` | `() => void` |
| `pause` | `() => void` |
| `toggle` | `() => void` |
| `seekTo` | `(seconds) => Promise<number> \| number` |
| `jumpBy` | `(seconds) => void` |
| `getCurrentTime` | `() => number` |
| `getDuration` | `() => number` |
| `setVolume` | `(volume) => void` |
| `setMuted` | `(muted) => void` |
| `setPlaybackRate` | `(rate) => void` |
| `selectAudio` | `(trackIndex) => void` |
| `selectSubtitle` | `(trackIndex) => void` |
| `requestFullscreen` | `() => void` |
| `setResizeMode` | `(resizeMode) => string` |
| `toggleResizeMode` | `() => string` |
| `getResizeMode` | `() => string` |
| `selectChannel` | `(index, reason?) => boolean` |
| `nextChannel` | `() => boolean` |
| `previousChannel` | `() => boolean` |
| `getCurrentChannel` | `() => object \| null` |
| `getCurrentChannelIndex` | `() => number` |

## Samsung Remote Control

| Key | Action |
| --- | --- |
| Arrows | Spatial navigation and channel changes in live fullscreen. |
| `Enter`/`OK` | Activates the focused element. |
| `Back` | Runs `onBack` if present. |
| `MediaPlayPause` | Play/Pause. |
| `MediaPlay` | Play. |
| `MediaPause` | Pause. |
| `MediaStop` | Stop/close depending on the handler. |
| `MediaRewind` | Rewinds by `rewindStep`. |
| `MediaFastForward` | Jumps forward by `forwardStep`. |
| `ChannelUp` | Next channel if `channelNavigation` is active. |
| `ChannelDown` | Previous channel if `channelNavigation` is active. |
| `ColorF1Green` | Next audio track. |
| `ColorF2Yellow` | Next subtitle track. |
| `ColorF3Blue`/`PictureSize` | Fullscreen. |

## User-Agent and Headers

Priority for resolving `userAgent`:

1. `userAgent` prop.
2. `activeChannel.userAgent`.
3. `source.userAgent`, `source.user_agent`, or `source.httpUserAgent`.
4. `User-Agent` or `UserAgent` header.
5. URL style `https://host/video.mkv|User-Agent=...`.

On Tizen it is applied with:

```js
webapis.avplay.setStreamingProperty('USER_AGENT', value);
```

If you also send `headers`, avoid duplicating `User-Agent`; AVPlay handles it as a streaming property.

## Stream Recommendations

- Use HTTPS when possible.
- Verify that the TV can resolve the final URL after redirects.
- Use servers with `Accept-Ranges: bytes` for large VOD files.
- Avoid codecs that the Samsung TV model does not support.
- Test the stream on the same network as the TV.
