# VideoPlayer for Web

How to use the `VideoPlayer` component in React Web applications by installing the package from npm.

## Installation

```bash
npm i omni-video-player
```

Expected peer dependencies:

```bash
npm i react react-dom
```

## Basic Usage

```jsx
import VideoPlayer from 'omni-video-player';

export default function Page() {
  return (
    <VideoPlayer
      source="https://cdn.example.com/movie.mp4"
      locale="en"
      controls
      autoPlay
    />
  );
}
```

## Movie

```jsx
import VideoPlayer from 'omni-video-player';

export default function MoviePlayer({ token }) {
  return (
    <VideoPlayer
      source={{
        uri: 'https://cdn.example.com/movies/101.mkv',
        headers: { Authorization: `Bearer ${token}` },
        poster: {
          source: { uri: 'https://cdn.example.com/posters/101.jpg' },
          resizeMode: 'cover',
        },
      }}
      overlay={{
        title: 'Movie 1',
        subtitle: '1080p - Latin Spanish',
      }}
      locale="en"
      resizeMode="contain"
      onEnd={() => console.log('ended')}
      onError={({ error }) => console.error(error)}
    />
  );
}
```

## Series

The component plays the active source. The consuming app controls the episode index and changes `source`.

```jsx
import { useRef, useState } from 'react';
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

export default function SeriesPlayer() {
  const playerRef = useRef(null);
  const [index, setIndex] = useState(0);
  const episode = episodes[index];

  return (
    <VideoPlayer
      key={episode.uri}
      ref={playerRef}
      source={episode.uri}
      overlay={{
        title: episode.title,
        subtitle: episode.subtitle,
      }}
      locale="en"
      autoPlay
      onEnd={() => setIndex((value) => Math.min(value + 1, episodes.length - 1))}
    />
  );
}
```

## Live TV

```jsx
import VideoPlayer from 'omni-video-player';

const channels = [
  {
    url: 'https://live.example.com/channel-1/master.m3u8',
    channelName: 'Channel 1',
    channelLogo: 'https://cdn.example.com/logos/channel-1.png',
    epg: { epgTime: '10:00 - 11:00', epgTitle: 'News' },
    live: true,
  },
  {
    url: 'https://live.example.com/channel-2/master.m3u8',
    channelName: 'Channel 2',
    live: true,
  },
];

export default function LiveTv() {
  return (
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
    />
  );
}
```

## Supported Formats

| URL/type | Engine used |
| --- | --- |
| `.mkv` | MKV with Mediabunny/WebCodecs |
| `.m3u8` | HLS with `hls.js` or native HLS |
| `.mp4`, `.m4v`, `.webm`, `.mov` | Native `<video>` |
| `source.type` | Forces `mkv`, `hls`, or `native` |

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
| `channelNavigation` | `boolean` | `true` | Allows channel changes with arrows in fullscreen. |
| `controls` | `boolean` | `true` | Shows controls. |
| `showBackButton` | `boolean` | `true` | Shows the Back button when `onBack` is provided. |
| `overlay` | `object` | `undefined` | Visual metadata and floating actions. |
| `primaryColor` | `string` | `#e50914` | Primary color. |
| `locale` | `string` | `en` | `en` or `es`. |
| `controlsAutoHideDelay` | `number` | `5000` | Milliseconds before controls are hidden. |
| `maxRetries` | `number` | `5` | Maximum retries, capped at 5. |
| `retryDelayMs` | `number` | `3000` | Delay between retries. |
| `live` | `boolean` | Detected | Live mode. |
| `autoPlay` | `boolean` | `true` | Plays when loaded. |
| `paused` | `boolean` | `false` | Controls pause state. |
| `muted` | `boolean` | `false` | Mutes audio. |
| `volume` | `number` | `1` | Volume from `0` to `1`. |
| `rate` | `number` | `1` | Playback speed. |
| `repeat` | `boolean` | `false` | Repeats after ending. |
| `fullscreen` | `boolean` | `false` | Initial fullscreen state. |
| `pip` | `boolean` | `true` | Enables Picture in Picture when supported by the active engine. In web browsers this uses native `<video>` PiP for MP4/HLS. |
| `resizeMode` | `contain \| cover \| stretch \| none \| center` | `contain` | Visual fit mode. |
| `poster` | `string \| object` | `undefined` | Poster image. |
| `posterResizeMode` | `string` | `contain` | Poster fit mode. |
| `headers` | `object` | `{}` | Headers allowed by the browser. |
| `userAgent` | `string` | `''` | API-compatible value, with Chrome/Brave limitations. |
| `bufferConfig` | `object` | See below | Buffer configuration. |
| `progressUpdateInterval` | `number` | `250` | `onProgress` frequency in ms. |
| `selectedAudioTrack` | `object` | `undefined` | Initial/controlled audio selection. |
| `selectedTextTrack` | `object` | `undefined` | Initial/controlled subtitle selection. |
| `selectedVideoTrack` | `object` | `undefined` | Initial/controlled quality selection. |
| `subtitleColor` | `string` | `#fff` | Subtitle color. |
| `subtitleFontSize` | `string \| object` | `24px` | Subtitle size. |
| `subtitleBackgroundColor` | `string` | `rgba(0,0,0,.62)` | Subtitle background. |
| `renderLoader` | `function \| ReactNode` | `undefined` | Custom loader. |
| `onBack` | `function` | `undefined` | Back button handler. |
| `onChannelChange` | `function` | `undefined` | Channel change event. |

## `source`

```jsx
<VideoPlayer
  source={{
    uri: 'https://cdn.example.com/video.mkv',
    type: 'mkv',
    headers: { Authorization: 'Bearer token' },
    userAgent: 'ExampleUserAgent',
    startPosition: 30000,
    poster: 'https://cdn.example.com/poster.jpg',
    live: false,
    bufferConfig: { maxBufferMs: 50000 },
  }}
/>
```

Accepted fields: `uri`, `url`, `type`, `headers`, `userAgent`, `user_agent`, `httpUserAgent`, `startPosition`, `cropStart`, `cropEnd`, `contentStartTime`, `bufferConfig`, `drm`, `metadata`, `poster`, `live`, `isLive`, `locale`.

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
| `onBandwidthUpdate` | `{ bitrate, width, height, trackId }` |
| `onPictureInPictureStatusChanged` | `{ isActive }` |
| `onResizeModeChange` | `resizeMode` |
| `onFullscreenPlayerWillPresent` | `undefined` |
| `onFullscreenPlayerDidPresent` | `undefined` |
| `onFullscreenPlayerWillDismiss` | `undefined` |
| `onFullscreenPlayerDidDismiss` | `undefined` |

## Ref Methods

```jsx
const playerRef = useRef(null);

<VideoPlayer ref={playerRef} source="https://cdn.example.com/video.mp4" />;

playerRef.current.play();
playerRef.current.pause();
playerRef.current.seekTo(120);
playerRef.current.jumpBy(10);
playerRef.current.toggleResizeMode();
playerRef.current.requestFullscreen();
```

| Method | Signature |
| --- | --- |
| `play` | `() => Promise<void> \| void` |
| `pause` | `() => void` |
| `toggle` | `() => Promise<void> \| void` |
| `seekTo` | `(seconds) => Promise<number> \| number` |
| `jumpBy` | `(seconds) => Promise<number> \| number` |
| `getCurrentTime` | `() => number` |
| `getDuration` | `() => number` |
| `setVolume` | `(volume) => void` |
| `setMuted` | `(muted) => void` |
| `setPlaybackRate` | `(rate) => void` |
| `selectAudio` | `(trackIdOrIndex) => void` |
| `selectSubtitle` | `(trackIdOrIndex) => void` |
| `requestFullscreen` | `() => Promise<void> \| void` |
| `requestPictureInPicture` | `() => Promise<void> \| void` |
| `setResizeMode` | `(resizeMode) => string` |
| `toggleResizeMode` | `() => string` |
| `getResizeMode` | `() => string` |
| `selectChannel` | `(index, reason?) => boolean` |
| `nextChannel` | `() => boolean` |
| `previousChannel` | `() => boolean` |
| `getCurrentChannel` | `() => object \| null` |
| `getCurrentChannelIndex` | `() => number` |

## Episode Segments

`intro`, `recap`, `credits`, and `preview` are optional per-episode data. The consuming app decides when to pass them as actions in `overlay`.

| Segment | Text in `en` | Position |
| --- | --- | --- |
| `intro` | `Skip Intro` | Top |
| `recap` | `Skip Recap` | Top |
| `credits` | `Next episode` | Bottom |
| `preview` | `Skip Preview` | Bottom |

## User-Agent on Web

You can pass `userAgent`, but Chrome/Brave do not allow JavaScript to overwrite the real `User-Agent` header for normal video requests.

```jsx
<VideoPlayer
  source="https://cdn.example.com/video.mkv"
  userAgent="ExampleUserAgent"
/>
```

For web authorization, use CORS-allowed headers, valid cookies, signed query params, or your own proxy.

## CORS and Range

For Web, the server must expose CORS and support Range:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range, Authorization, Content-Type
Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges
Accept-Ranges: bytes
```
