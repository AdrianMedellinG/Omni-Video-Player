# VideoPlayer for LG webOS TV

Guide for using `VideoPlayer` in a React application packaged as an LG webOS TV web app.

## Installation

```bash
npm i omni-video-player
```

Also install the base dependencies for your React app if they are not already present:

```bash
npm i react react-dom
```

## Requirements

- LG webOS TV app project.
- LG webOS TV SDK CLI tools, including `ares-package`.
- Internet access from the TV for remote streams.
- A valid `appinfo.json`.
- Streams and codecs supported by the target LG webOS TV model.

The project includes [`webos/appinfo.json`](webos/appinfo.json). The Vite webOS build copies it into `dist-webos` together with `icon.png` and `webOSTV.js`.

## Basic Usage

```jsx
import VideoPlayer from 'omni-video-player';

export default function WebOsPlayer() {
  return (
    <VideoPlayer
      source="https://cdn.example.com/video.mp4"
      locale="en"
      fullscreen
      autoPlay
      controls
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
  locale="en"
/>;
```

## Build and Package

Build the webOS bundle:

```bash
npm run build:webos
```

Validate and package it with the webOS CLI:

```bash
npm run webos:check
npm run webos:package
```

The package output is written to `packages-webos/`.

## Supported Formats

| URL/type | Engine used |
| --- | --- |
| `.m3u8` | HLS through the webOS browser media stack |
| `.mp4`, `.m4v`, `.webm`, `.mov` | Native `<video>` when supported by the TV |
| `.mkv` | Depends on webOS browser/media support for the target model |
| `source.type` | Can declare `mkv`, `hls`, or `native` |

Final support depends on the webOS version, browser engine, firmware, and available codecs.

## Notes

- Prefer HTTPS streams.
- Use servers that support `Accept-Ranges: bytes` for large VOD files.
- Test on the target TV model or emulator; desktop browser behavior is not a full webOS compatibility test.
- For shared props, events, and ref methods, see the [Web README](README.web.md).
