export const EPISODES = [
  {
    uri: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    title: 'Demo Series',
    subtitle: 'Season 1 - Episode 1',
    mode: 'vod',
    intro: [{ start_ms: 10000, end_ms: 20000 }],
    credits: [{ start_ms: 575000, end_ms: 596000 }],
  },
  {
    uri: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    title: 'Demo Series',
    subtitle: 'Season 1 - Episode 2',
    mode: 'vod',
    intro: [{ start_ms: 12000, end_ms: 24000 }],
    credits: [{ start_ms: 610000, end_ms: 650000 }],
  },
  {
    uri: 'https://example.com/video/demo-file.mkv',
    title: 'Demo MKV',
    subtitle: 'MKV sample file',
    mode: 'vod',
    intro: [{ start_ms: 15000, end_ms: 30000 }],
    credits: [{ start_ms: 5400000, end_ms: 5460000 }],
  },
];

export const PLAYER_PRESETS = [
  {
    label: 'Series - Demo',
    uri: EPISODES[0].uri,
    title: EPISODES[0].title,
    subtitle: EPISODES[0].subtitle,
    episodes: EPISODES,
    initialEpisodeIndex: 0,
    mode: 'vod',
  },
  {
    label: 'VOD - Demo MP4',
    uri: 'https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    title: 'Demo Movie',
    subtitle: '',
    mode: 'vod',
  },
  {
    label: 'VOD - Demo MKV',
    uri: 'https://example.com/video/demo-file.mkv',
    title: 'Demo MKV',
    subtitle: '',
    mode: 'vod',
  },
  {
    label: 'TV - Demo HLS',
    uri: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    title: '',
    channelName: 'Demo HLS',
    channelLogo: 'https://dummyimage.com/360x270/111827/ffffff.png&text=HLS',
    epgTime: 'Live',
    epgTitle: 'Demo channel',
    live: true,
  },
];

export const CHANNEL_LIST = [
  {
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    channelName: 'Demo HLS',
    channelLogo: 'https://dummyimage.com/360x270/111827/ffffff.png&text=HLS',
    epg: {
      epgTime: 'Live',
      epgTitle: 'Demo channel',
    },
    live: true,
  },
  {
    url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
    channelName: 'Demo Movie Channel',
    channelLogo: 'https://dummyimage.com/360x270/1f2937/ffffff.png&text=Movie',
    epg: {
      epgTime: '10:00 - 11:00',
      epgTitle: 'Sample programming',
    },
    live: true,
  },
];
