import {
  ALL_FORMATS,
  AudioBufferSink,
  CanvasSink,
  Input,
  UrlSource,
} from 'mediabunny';
import { registerAc3Decoder } from '@mediabunny/ac3';
import { RemoteMkvSubtitles } from './RemoteMkvSubtitles.js';
import { sanitizeRequestHeaders } from '../utils/playerProps.js';

let ac3Registered = false;
function ensureAc3Decoder() {
  if (!ac3Registered) {
    registerAc3Decoder();
    ac3Registered = true;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class MkvPlayerEngine extends EventTarget {
  constructor(canvas) {
    super();
    ensureAc3Decoder();

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    this.input = null;
    this.source = null;
    this.videoTrack = null;
    this.audioTracks = [];
    this.audioTrack = null;
    this.videoSink = null;
    this.audioSink = null;

    this.subtitleManager = new RemoteMkvSubtitles();
    this.subtitleTracks = [];
    this.selectedSubtitleTrackId = null;
    this.lastSubtitleText = '';
    this.subtitleBytesParsed = 0;

    this.subtitleManager.addEventListener('tracks', (event) => {
      this.subtitleTracks = event.detail.tracks || [];
      this.emit('subtitle-tracks', { tracks: this.subtitleTracks });
    });
    this.subtitleManager.addEventListener('progress', (event) => {
      this.subtitleBytesParsed = event.detail.bytesParsed || 0;
      this.emit('subtitle-progress', { bytesParsed: this.subtitleBytesParsed });
    });
    this.subtitleManager.addEventListener('complete', (event) => {
      this.emit('subtitle-complete', event.detail);
    });
    this.subtitleManager.addEventListener('error', (event) => {
      console.warn('Subtitle parser:', event.detail.error);
      this.emit('subtitle-warning', { error: event.detail.error });
    });

    this.audioContext = null;
    this.gainNode = null;

    this.duration = 0;
    this.currentTime = 0;
    this.rate = 1;
    this.volume = 1;
    this.muted = false;
    this.playing = false;
    this.loaded = false;
    this.decodeToken = 0;
    this.raf = 0;
    this.anchorMediaTime = 0;
    this.anchorPerfTime = 0;
    this.anchorAudioTime = 0;
    this.activeAudioNodes = new Set();
    this.videoQueue = [];
    this.bytesRead = 0;
    this.lastDrawnTimestamp = -1;
    this.lastProgressEmit = 0;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async load(url, options = {}) {
    await this.destroyMediaOnly();
    this.emit('state', { status: 'loading' });
    this.bytesRead = 0;
    this.subtitleTracks = [];
    this.selectedSubtitleTrackId = null;
    this.lastSubtitleText = '';
    this.subtitleBytesParsed = 0;

    try {
      const requestHeaders = sanitizeRequestHeaders(options.headers);
      this.source = new UrlSource(url, {
        maxCacheSize: 96 * 1024 * 1024,
        parallelism: 3,
        requestInit: Object.keys(requestHeaders).length ? { headers: requestHeaders } : undefined,
      });

      // El parser de subtítulos lee el MKV como stream HTTP en paralelo.
      // Las pistas están cerca del inicio del contenedor, por lo que normalmente
      // aparecen casi inmediatamente. El análisis de cues continúa en background.
      const subtitleTracksPromise = this.subtitleManager.start(url, { headers: requestHeaders }).catch((error) => {
        console.warn('No se pudieron inicializar subtítulos embebidos:', error);
        return [];
      });
      this.source.onread = (start, end) => {
        this.bytesRead += Math.max(0, end - start);
        this.emit('network', { bytesRead: this.bytesRead });
      };

      this.input = new Input({ source: this.source, formats: ALL_FORMATS });
      if (!(await this.input.canRead())) throw new Error('Formato no reconocido o archivo inaccesible.');

      const [videoTrack, audioTracks, duration, mimeType, fileSize] = await Promise.all([
        this.input.getPrimaryVideoTrack(),
        this.input.getAudioTracks(),
        this.input.getDurationFromMetadata().catch(() => null),
        this.input.getMimeType().catch(() => 'application/octet-stream'),
        this.source.getSize().catch(() => 0),
      ]);

      if (!videoTrack) throw new Error('El archivo no contiene una pista de video compatible con el lector.');
      this.videoTrack = videoTrack;
      this.audioTracks = audioTracks;
      this.audioTrack = audioTracks[0] ?? null;

      this.duration = Number.isFinite(duration) && duration > 0
        ? duration
        : await this.input.computeDuration();

      const videoDecodable = await this.videoTrack.canDecode();
      if (!videoDecodable) {
        const codec = await this.videoTrack.getCodecParameterString().catch(() => null)
          || await this.videoTrack.getInternalCodecId().catch(() => 'desconocido');
        throw new Error(`El navegador no puede decodificar la pista de video (${codec}).`);
      }

      this.videoSink = new CanvasSink(this.videoTrack, { poolSize: 8 });
      if (this.audioTrack) await this.setAudioTrackInternal(this.audioTrack.id, false);

      const [width, height, codec, internalCodecId, language, name, fpsStats] = await Promise.all([
        this.videoTrack.getDisplayWidth(),
        this.videoTrack.getDisplayHeight(),
        this.videoTrack.getCodecParameterString().catch(() => null),
        this.videoTrack.getInternalCodecId().catch(() => null),
        this.videoTrack.getLanguageCode().catch(() => 'und'),
        this.videoTrack.getName().catch(() => null),
        this.videoTrack.computePacketStats(120).catch(() => null),
      ]);

      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, width, height);

      const audioInfo = await Promise.all(this.audioTracks.map(async (track) => ({
        id: track.id,
        number: track.number,
        codec: await track.getCodecParameterString().catch(() => null)
          || await track.getInternalCodecId().catch(() => null),
        language: await track.getLanguageCode().catch(() => 'und'),
        name: await track.getName().catch(() => null),
        channels: await track.getNumberOfChannels().catch(() => null),
        sampleRate: await track.getSampleRate().catch(() => null),
        decodable: await track.canDecode().catch(() => false),
      })));

      this.subtitleTracks = await subtitleTracksPromise;

      this.loaded = true;
      this.currentTime = 0;

      await this.drawSingleFrame(0);

      this.emit('loaded', {
        duration: this.duration,
        mimeType,
        fileSize,
        video: {
          codec: codec || String(internalCodecId || 'desconocido'),
          internalCodecId,
          language,
          name,
          width,
          height,
          fps: fpsStats?.averagePacketRate ?? null,
        },
        audioTracks: audioInfo,
        subtitleTracks: this.subtitleTracks,
        selectedAudioTrackId: this.audioTrack?.id ?? null,
        selectedSubtitleTrackId: null,
      });
      this.emit('time', { currentTime: 0, duration: this.duration });
      this.emit('subtitle', { text: '' });
      this.emit('state', { status: 'ready' });
    } catch (error) {
      this.emit('state', { status: 'error' });
      this.emit('error', { error });
      throw error;
    }
  }

  async ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ latencyHint: 'playback' });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.applyVolume();
    }
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
  }

  async play() {
    if (!this.loaded || this.playing) return;
    await this.ensureAudioContext();
    if (this.currentTime >= this.duration - 0.05) this.currentTime = 0;

    this.playing = true;
    this.decodeToken += 1;
    const token = this.decodeToken;
    this.anchorMediaTime = this.currentTime;
    this.anchorPerfTime = performance.now();
    this.anchorAudioTime = this.audioContext.currentTime + 0.08;
    this.videoQueue = [];
    this.lastDrawnTimestamp = -1;

    this.emit('play');
    this.startVideoPipeline(token).catch((error) => this.handlePipelineError(error, token));
    if (this.audioSink) this.startAudioPipeline(token).catch((error) => this.handlePipelineError(error, token));
    this.renderLoop(token);
  }

  pause() {
    if (!this.playing) return;
    this.currentTime = this.getClockTime();
    this.playing = false;
    this.decodeToken += 1;
    cancelAnimationFrame(this.raf);
    this.stopAudioNodes();
    this.videoQueue = [];
    this.emit('pause');
    this.emit('time', { currentTime: this.currentTime, duration: this.duration });
  }

  async toggle() {
    if (this.playing) this.pause();
    else await this.play();
  }

  getClockTime() {
    if (!this.playing) return this.currentTime;
    return clamp(
      this.anchorMediaTime + ((performance.now() - this.anchorPerfTime) / 1000) * this.rate,
      0,
      this.duration,
    );
  }

  async seek(seconds) {
    if (!this.loaded) return;
    const target = clamp(Number(seconds) || 0, 0, this.duration);
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.currentTime = target;
    await this.drawSingleFrame(target);
    this.emit('time', { currentTime: target, duration: this.duration });
    this.updateSubtitle(target, true);
    if (wasPlaying) await this.play();
  }

  async setAudioTrack(trackId) {
    const wasPlaying = this.playing;
    const time = this.getClockTime();
    if (wasPlaying) this.pause();
    await this.setAudioTrackInternal(trackId, true);
    this.currentTime = time;
    if (wasPlaying) await this.play();
  }

  async setAudioTrackInternal(trackId, emit = true) {
    const track = this.audioTracks.find((item) => item.id === Number(trackId));
    if (!track) return;
    const decodable = await track.canDecode();
    if (!decodable) {
      const codec = await track.getCodecParameterString().catch(() => null)
        || await track.getInternalCodecId().catch(() => 'desconocido');
      throw new Error(`La pista de audio ${codec} no puede decodificarse en este navegador.`);
    }
    this.audioTrack = track;
    this.audioSink = new AudioBufferSink(track);
    if (emit) this.emit('audio-track', { id: track.id });
  }

  async setSubtitleTrack(trackId) {
    if (trackId === '' || trackId === null || trackId === undefined || trackId === 'off') {
      this.selectedSubtitleTrackId = null;
      this.lastSubtitleText = '';
      this.emit('subtitle-track', { id: null });
      this.emit('subtitle', { text: '' });
      return;
    }

    const id = Number(trackId);
    const track = this.subtitleTracks.find((item) => Number(item.id ?? item.number) === id);
    if (!track) throw new Error('No se encontró la pista de subtítulos.');

    this.selectedSubtitleTrackId = id;
    this.lastSubtitleText = '';
    this.emit('subtitle-track', { id });
    this.updateSubtitle(this.getClockTime(), true);
  }

  updateSubtitle(time, force = false) {
    if (this.selectedSubtitleTrackId === null) {
      if (force || this.lastSubtitleText) {
        this.lastSubtitleText = '';
        this.emit('subtitle', { text: '' });
      }
      return;
    }

    const cue = this.subtitleManager.getCueAt(this.selectedSubtitleTrackId, time);
    const text = cue?.text || '';
    if (force || text !== this.lastSubtitleText) {
      this.lastSubtitleText = text;
      this.emit('subtitle', {
        text,
        start: cue?.start ?? null,
        end: cue?.end ?? null,
      });
    }
  }

  setVolume(value) {
    this.volume = clamp(Number(value), 0, 1);
    this.applyVolume();
    this.emit('volume', { volume: this.volume, muted: this.muted });
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this.applyVolume();
    this.emit('volume', { volume: this.volume, muted: this.muted });
  }

  applyVolume() {
    if (this.gainNode) this.gainNode.gain.value = this.muted ? 0 : this.volume;
  }

  async setPlaybackRate(value) {
    const rate = clamp(Number(value) || 1, 0.5, 2);
    if (rate === this.rate) return;
    const wasPlaying = this.playing;
    const time = this.getClockTime();
    if (wasPlaying) this.pause();
    this.rate = rate;
    this.currentTime = time;
    this.emit('rate', { rate });
    if (wasPlaying) await this.play();
  }

  async drawSingleFrame(timestamp) {
    if (!this.videoSink || !this.ctx) return;
    const wrapped = await this.videoSink.getCanvas(timestamp);
    if (!wrapped) return;
    this.ctx.drawImage(wrapped.canvas, 0, 0, this.canvas.width, this.canvas.height);
  }

  async startVideoPipeline(token) {
    const start = this.anchorMediaTime;
    for await (const wrapped of this.videoSink.canvases(start, this.duration)) {
      if (!this.playing || token !== this.decodeToken) break;
      while (this.videoQueue.length >= 6 && this.playing && token === this.decodeToken) await sleep(6);
      if (!this.playing || token !== this.decodeToken) break;
      this.videoQueue.push(wrapped);
    }
  }

  renderLoop(token) {
    if (!this.playing || token !== this.decodeToken) return;
    const now = this.getClockTime();
    this.updateSubtitle(now);
    let frame = null;

    while (this.videoQueue.length && this.videoQueue[0].timestamp <= now + 0.008) {
      frame = this.videoQueue.shift();
    }

    if (frame && frame.timestamp !== this.lastDrawnTimestamp) {
      this.ctx.drawImage(frame.canvas, 0, 0, this.canvas.width, this.canvas.height);
      this.lastDrawnTimestamp = frame.timestamp;
    }

    const perfNow = performance.now();
    if (perfNow - this.lastProgressEmit > 100) {
      this.lastProgressEmit = perfNow;
      this.currentTime = now;
      this.emit('time', { currentTime: now, duration: this.duration });
    }

    if (now >= this.duration - 0.02) {
      this.currentTime = this.duration;
      this.playing = false;
      this.decodeToken += 1;
      this.stopAudioNodes();
      this.lastSubtitleText = '';
      this.emit('subtitle', { text: '' });
      this.emit('time', { currentTime: this.duration, duration: this.duration });
      this.emit('ended');
      return;
    }

    this.raf = requestAnimationFrame(() => this.renderLoop(token));
  }

  async startAudioPipeline(token) {
    const start = this.anchorMediaTime;
    for await (const wrapped of this.audioSink.buffers(start, this.duration)) {
      if (!this.playing || token !== this.decodeToken) break;

      while (
        wrapped.timestamp > this.getClockTime() + 2.5 * this.rate
        && this.playing
        && token === this.decodeToken
      ) {
        await sleep(15);
      }
      if (!this.playing || token !== this.decodeToken) break;

      const source = this.audioContext.createBufferSource();
      source.buffer = wrapped.buffer;
      source.playbackRate.value = this.rate;
      source.connect(this.gainNode);

      const when = this.anchorAudioTime + (wrapped.timestamp - start) / this.rate;
      const now = this.audioContext.currentTime;
      const offsetMedia = Math.max(0, (now - when) * this.rate);

      if (offsetMedia < wrapped.duration) {
        try {
          source.start(Math.max(now, when), offsetMedia);
          this.activeAudioNodes.add(source);
          source.onended = () => this.activeAudioNodes.delete(source);
        } catch {
          source.disconnect();
        }
      } else {
        source.disconnect();
      }
    }
  }

  stopAudioNodes() {
    for (const node of this.activeAudioNodes) {
      try { node.stop(); } catch { /* already stopped */ }
      try { node.disconnect(); } catch { /* no-op */ }
    }
    this.activeAudioNodes.clear();
  }

  handlePipelineError(error, token) {
    if (token !== this.decodeToken) return;
    console.error(error);
    this.emit('error', { error });
  }

  async destroyMediaOnly() {
    this.pause();
    this.loaded = false;
    this.decodeToken += 1;
    if (this.input) {
      try { this.input.dispose(); } catch { /* no-op */ }
    }
    this.subtitleManager.stop();
    this.subtitleTracks = [];
    this.selectedSubtitleTrackId = null;
    this.lastSubtitleText = '';
    this.emit('subtitle', { text: '' });

    this.input = null;
    this.source = null;
    this.videoTrack = null;
    this.audioTracks = [];
    this.audioTrack = null;
    this.videoSink = null;
    this.audioSink = null;
    this.duration = 0;
    this.currentTime = 0;
    this.videoQueue = [];
  }

  async destroy() {
    await this.destroyMediaOnly();
    this.stopAudioNodes();
    if (this.audioContext) {
      try { await this.audioContext.close(); } catch { /* no-op */ }
    }
    this.audioContext = null;
    this.gainNode = null;
  }
}
