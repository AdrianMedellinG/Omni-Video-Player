# VideoPlayer for Electron

Guide for using `VideoPlayer` in the renderer of an Electron application by installing the package from npm.

## Installation

```bash
npm i omni-video-player
```

Base dependencies for your app:

```bash
npm i react react-dom electron
```

## Import

```jsx
import VideoPlayer from 'omni-video-player';
```

You can also use the named export:

```jsx
import { VideoPlayer } from 'omni-video-player';
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
      source="https://cdn.example.com/video.mp4"
      locale="en"
      autoPlay
      controls
      pip
      onLoad={({ duration }) => console.log('duration', duration)}
      onProgress={({ currentTime }) => console.log('time', currentTime)}
      onPictureInPictureStatusChanged={({ isActive }) => console.log('pip', isActive)}
      onError={({ error }) => console.error(error)}
    />
  );
}
```

## Electron Requirements

- The component is used in the renderer, like any React component.
- Electron must load your React web build.
- For window PiP, expose a safe API on `window.electronAPI`.
- If you do not expose that API, the player still works; only Electron PiP is unsupported.
- Chromium rules still apply in the renderer: CORS, codecs, Range requests, and autoplay policies.

## Recommended BrowserWindow

```js
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const mainWindow = new BrowserWindow({
  width: 1280,
  height: 720,
  minWidth: 1024,
  minHeight: 640,
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});
```

## Electron PiP API

`VideoPlayer` looks for this API in the renderer:

```js
window.electronAPI = {
  isElectron: true,
  platform: process.platform,
  getPipMode: async () => ({ active: false, supported: true }),
  setPipMode: async (active) => ({ active, supported: true }),
  togglePipMode: async () => ({ active: true, supported: true }),
  onPipModeChange: (callback) => unsubscribe,
};
```

Example `preload.cjs`:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  getPipMode: () => ipcRenderer.invoke('electron:pip-get-state'),
  setPipMode: (active) => ipcRenderer.invoke('electron:pip-set', Boolean(active)),
  togglePipMode: () => ipcRenderer.invoke('electron:pip-toggle'),
  onPipModeChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('electron:pip-state-change', listener);
    return () => ipcRenderer.removeListener('electron:pip-state-change', listener);
  },
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
```

Expected IPC channels:

| Channel | Direction | Use |
| --- | --- | --- |
| `electron:pip-get-state` | renderer to main | Reads PiP state. |
| `electron:pip-set` | renderer to main | Enables/disables PiP. |
| `electron:pip-toggle` | renderer to main | Toggles PiP. |
| `electron:pip-state-change` | main to renderer | Notifies PiP changes. |

## PiP Behavior

Electron does not use the native PiP mode of the `<video>` element. The recommended PiP mode turns the window into a floating window:

- Exits fullscreen/maximized if needed.
- Resizes the window to a 16:9 shape.
- Enables `alwaysOnTop`.
- Moves it to a visible corner of the display.
- Restores bounds, fullscreen/maximized state, and minimum sizes when leaving PiP.

`pip` is `true` by default. To disable it:

```jsx
<VideoPlayer
  source="https://cdn.example.com/video.mp4"
  pip={false}
/>
```

## Movie

```jsx
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
  pip
/>
```

## HLS/M3U8

```jsx
<VideoPlayer
  source="https://cdn.example.com/live/master.m3u8"
  live
  locale="en"
  overlay={{ title: 'HLS Channel', live: true }}
  onBandwidthUpdate={({ bitrate, width, height }) => {
    console.log({ bitrate, width, height });
  }}
/>
```

## MKV

```jsx
<VideoPlayer
  source="https://cdn.example.com/movies/101.mkv"
  locale="en"
  selectedAudioTrack={{ type: 'language', value: 'spa' }}
  selectedTextTrack={{ type: 'disabled' }}
  overlay={{
    title: 'MKV Movie',
    subtitle: 'Internal audio and subtitles',
  }}
/>
```

## Series

For series, your screen controls the active episode and changes `source`. The `intro`, `recap`, `credits`, and `preview` data can come from each episode.

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
  const hasNext = index < episodes.length - 1;

  return (
    <VideoPlayer
      key={episode.uri}
      ref={playerRef}
      source={episode}
      locale="en"
      overlay={{
        title: episode.title,
        subtitle: episode.subtitle,
        autoContinue: hasNext
          ? {
              visible: true,
              label: 'Next episode',
              progress: 0,
              onPress: () => setIndex((value) => value + 1),
            }
          : undefined,
      }}
      onEnd={() => {
        if (hasNext) setIndex((value) => value + 1);
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
  pip
  locale="en"
  onChannelChange={({ index, channel, previousIndex, reason }) => {
    console.log({ index, channel, previousIndex, reason });
  }}
/>;
```

## Supported Formats

| URL/type | Engine used |
| --- | --- |
| `.mkv` | MKV with Mediabunny/WebCodecs in Chromium |
| `.m3u8` | HLS with `hls.js` or native HLS |
| `.mp4`, `.m4v`, `.webm`, `.mov` | Chromium native `<video>` |
| `source.type` | Forces `mkv`, `hls`, or `native` |

Final support depends on the Chromium/Electron version and the available codecs.

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
| `channelNavigation` | `boolean` | `true` | Channel changes with arrows in fullscreen. |
| `controls` | `boolean` | `true` | Shows controls. |
| `showBackButton` | `boolean` | `true` | Shows the Back button when `onBack` is provided. |
| `overlay` | `object` | `undefined` | Metadata, EPG, and floating actions. |
| `primaryColor` | `string` | `#e50914` | Primary color. |
| `locale` | `string` | `en` | `en` or `es`. |
| `controlsAutoHideDelay` | `number` | `5000` | Milliseconds before controls are hidden. |
| `maxRetries` | `number` | `5` | Maximum retries. |
| `retryDelayMs` | `number` | `3000` | Delay between retries. |
| `live` | `boolean` | Detected | Live mode. |
| `autoPlay` | `boolean` | `true` | Plays when loaded. |
| `paused` | `boolean` | `false` | Controlled/initial pause state. |
| `initialTime` | `number` | `0` | Initial second. |
| `seekStep` | `number` | `10` | Base seek step. |
| `forwardStep` | `number` | `seekStep` | Seconds to jump forward. |
| `rewindStep` | `number` | `seekStep` | Seconds to rewind. |
| `fullscreen` | `boolean` | `false` | Initial fullscreen state. |
| `pip` | `boolean` | `true` | Enables Electron PiP if `window.electronAPI` exists. |
| `headers` | `object` | `{}` | Headers allowed by Chromium/fetch. |
| `userAgent` | `string` | `''` | API-compatible value, with Chromium limitations. |
| `bufferConfig` | `object` | Internal defaults | Buffer configuration. |
| `muted` | `boolean` | `false` | Mutes audio. |
| `volume` | `number` | `1` | Volume from `0` to `1`. |
| `rate` | `number` | `1` | Playback speed. |
| `repeat` | `boolean` | `false` | Repeats after ending. |
| `resizeMode` | `contain \| cover \| stretch \| none \| center` | `contain` | Visual fit mode. |
| `poster` | `string \| object` | `undefined` | Poster image. |
| `posterResizeMode` | `string` | `contain` | Poster fit mode. |
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
    userAgent: 'ExampleVideoPlayer',
    startPosition: 30000,
    poster: 'https://cdn.example.com/poster.jpg',
    live: false,
    bufferConfig: { maxBufferMs: 50000 },
  }}
/>
```

Accepted fields: `uri`, `url`, `src`, `type`, `headers`, `userAgent`, `user_agent`, `httpUserAgent`, `startPosition`, `cropStart`, `cropEnd`, `contentStartTime`, `bufferConfig`, `drm`, `metadata`, `poster`, `live`, `isLive`, `locale`.

## Episode Segments

| Segment | Alias | Expected UI |
| --- | --- | --- |
| `intro` | `intro` | `Skip Intro`, top right |
| `recap` | `recap`, `recaps`, `summary` | `Skip Recap`, top right |
| `credits` | `credits`, `creditos` | `Next episode`, bottom right |
| `preview` | `preview`, `previews`, `preveiw` | `Skip Preview`, bottom right |

Times can be provided in milliseconds (`start_ms`, `end_ms`) or seconds (`start_seconds`, `end_seconds`). `start_ms: null` means `0`; `end_ms: null` can use the total duration once it is known.

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
playerRef.current.toggleResizeMode();
playerRef.current.requestPictureInPicture();
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
| `requestPictureInPicture` | `() => Promise<object> \| void` |
| `setResizeMode` | `(resizeMode) => string` |
| `toggleResizeMode` | `() => string` |
| `getResizeMode` | `() => string` |
| `selectChannel` | `(index, reason?) => boolean` |
| `nextChannel` | `() => boolean` |
| `previousChannel` | `() => boolean` |
| `getCurrentChannel` | `() => object \| null` |
| `getCurrentChannelIndex` | `() => number` |

## User-Agent and Headers

Priority for resolving `userAgent`:

1. `userAgent` prop.
2. `activeChannel.userAgent`.
3. `source.userAgent`, `source.user_agent`, or `source.httpUserAgent`.
4. `User-Agent` or `UserAgent` header.
5. URL style `https://host/video.mkv|User-Agent=...`.

Chromium/Electron does not reliably allow overwriting the real `User-Agent` header from a normal `<video>` element. For streams that require a specific User-Agent, use signed URLs, CORS-allowed cookies, headers supported by the engine performing `fetch`, or your own proxy.

## CORS and Range

Electron uses Chromium in the renderer, so CORS applies.

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range, Authorization, Content-Type
Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges
Accept-Ranges: bytes
```

For large MKV/MP4 files, the server must correctly respond to `Range` with `206 Partial Content`.
