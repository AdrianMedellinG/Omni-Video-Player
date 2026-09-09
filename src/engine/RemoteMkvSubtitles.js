import { sanitizeRequestHeaders } from '../utils/playerProps.js';

const cleanAssText = (value = '') => String(value)
  .replace(/&lt;br\s*\/?&gt;/gi, '\n')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/\{\\[^}]+\}/g, '')
  .replace(/\\N/g, '\n')
  .replace(/\\n/g, '\n')
  .replace(/\\h/g, ' ')
  .replace(/<\/?[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/g, "'")
  .split('\n')
  .map((line) => line.trim())
  .join('\n')
  .trim();

export class RemoteMkvSubtitles extends EventTarget {
  constructor() {
    super();
    this.abortController = null;
    this.parser = null;
    this.tracks = [];
    this.cues = new Map();
    this.parsing = false;
    this.bytesParsed = 0;
    this.completed = false;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async start(url, options = {}) {
    this.stop();
    this.tracks = [];
    this.cues = new Map();
    this.bytesParsed = 0;
    this.completed = false;

    const api = window.MatroskaSubtitles;
    if (!api?.SubtitleParser) {
      throw new Error('No se cargó MatroskaSubtitles. Verifica la conexión a jsDelivr.');
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const requestHeaders = {
      Accept: 'video/x-matroska,video/*,*/*',
      ...sanitizeRequestHeaders(options.headers),
    };
    const parser = new api.SubtitleParser();
    this.parser = parser;
    this.parsing = true;

    let resolveTracks;
    let rejectTracks;
    const tracksPromise = new Promise((resolve, reject) => {
      resolveTracks = resolve;
      rejectTracks = reject;
    });

    const timeout = setTimeout(() => {
      resolveTracks([]);
    }, 12000);

    parser.once('tracks', (tracks = []) => {
      clearTimeout(timeout);
      this.tracks = tracks.map((track) => ({
        id: Number(track.number),
        number: Number(track.number),
        language: track.language || 'und',
        type: track.type || 'unknown',
        codec: track.type || 'unknown',
        name: track.name || null,
        header: track.header || null,
      }));

      for (const track of this.tracks) {
        this.cues.set(track.number, []);
      }

      this.emit('tracks', { tracks: this.tracks });
      resolveTracks(this.tracks);
    });

    parser.on('subtitle', (subtitle, trackNumber) => {
      const number = Number(trackNumber);
      if (!this.cues.has(number)) this.cues.set(number, []);

      const cue = {
        text: cleanAssText(subtitle?.text ?? ''),
        start: Number(subtitle?.time ?? 0) / 1000,
        duration: Number(subtitle?.duration ?? 0) / 1000,
      };
      cue.end = cue.start + cue.duration;

      this.cues.get(number).push(cue);
      this.emit('cue', { trackNumber: number, cue });
    });

    parser.on('error', (error) => {
      if (signal.aborted) return;
      this.emit('error', { error });
      rejectTracks(error);
    });

    const run = async () => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          signal,
          headers: requestHeaders,
        });

        if (!response.ok) {
          throw new Error(`No se pudo leer subtítulos: HTTP ${response.status}`);
        }
        if (!response.body) {
          throw new Error('El navegador no expuso el stream HTTP del MKV.');
        }

        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done || signal.aborted) break;
          if (!value?.byteLength) continue;

          this.bytesParsed += value.byteLength;
          parser.write(value);
          this.emit('progress', { bytesParsed: this.bytesParsed });

          // Ceder al main thread entre chunks grandes.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        if (!signal.aborted) {
          parser.end();
          this.completed = true;
          this.emit('complete', { bytesParsed: this.bytesParsed });
        }
      } catch (error) {
        if (signal.aborted || error?.name === 'AbortError') return;
        clearTimeout(timeout);
        rejectTracks(error);
        this.emit('error', { error });
      } finally {
        this.parsing = false;
      }
    };

    run();
    return tracksPromise;
  }

  getCueAt(trackNumber, time) {
    const cues = this.cues.get(Number(trackNumber)) || [];
    if (!cues.length) return null;

    let low = 0;
    let high = cues.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const cue = cues[mid];
      if (time < cue.start) high = mid - 1;
      else if (time > cue.end) low = mid + 1;
      else return cue;
    }
    return null;
  }

  stop() {
    try { this.abortController?.abort(); } catch {}
    try { this.parser?.destroy?.(); } catch {}
    this.abortController = null;
    this.parser = null;
    this.parsing = false;
  }
}
