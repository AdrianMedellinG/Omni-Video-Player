# Omni Video Player

Omni Video Player is a cross-platform video player for React Web, Electron.js, Samsung Tizen TV, LG webOS, Android, iPhone/iOS, and tvOS.

The repository contains the shared web player, TV builds, Electron integration, and a React Native implementation/example for mobile and TV targets. It supports common playback workflows such as VOD, series episodes, live TV channel lists, EPG metadata, custom controls, subtitles, audio track selection, episode segments, fullscreen, and Picture in Picture where the platform allows it.

## Platform Guides

| Platform | Runtime | Guide |
| --- | --- | --- |
| Web | React Web | [Web README](README.web.md) |
| Electron.js | Electron renderer + main/preload PiP integration | [Electron README](README.electron.md) |
| Samsung Tizen TV | Tizen Web Application + Samsung AVPlay | [Tizen README](README.tizen.md) |
| LG webOS TV | webOS web app packaged with `ares-package` | [webOS README](README.webos.md) |
| Android | React Native + `@amedellin85/react-native-video` | [React Native README](react-native/README.md) |
| iPhone / iOS | React Native + AVPlayer | [React Native README](react-native/README.md) |
| tvOS | React Native TV / `react-native-tvos` | [React Native README](react-native/README.md) |

## Example App

The React Native test application lives in [`ReactNativeExample`](ReactNativeExample/README.md). It includes Android mobile, Android TV, iOS/tvOS project files, player configuration screens, live TV presets, and VOD episode flows.

Versionable sample data is stored in [`ReactNativeExample/src/demoDataExample.js`](ReactNativeExample/src/demoDataExample.js). Copy it to `src/demoData.js` inside the example app when you need local/private stream URLs; `demoData.js` is ignored by Git.

## Package

```bash
npm i omni-video-player
```

The platform-specific README files explain the required peer dependencies, native configuration, props, events, ref methods, packaging steps, and runtime limitations for each target.
# Omni-Video-Player
