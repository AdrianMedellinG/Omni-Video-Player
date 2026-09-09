import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function tizenBundlePlugin(enabled) {
  return {
    name: 'tizen-bundle-files',
    transformIndexHtml(html) {
      if (!enabled) return html;
      return html.replace(
        '</head>',
        '  <script type="text/javascript" src="$WEBAPIS/webapis/webapis.js"></script>\n</head>',
      );
    },
    closeBundle() {
      if (!enabled) return;
      const outDir = path.resolve('dist-tizen');
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(path.resolve('config.xml'), path.join(outDir, 'config.xml'));
      fs.copyFileSync(path.resolve('icon.png'), path.join(outDir, 'icon.png'));
    },
  };
}

function webosBundlePlugin(enabled) {
  return {
    name: 'webos-bundle-files',
    transformIndexHtml(html) {
      if (!enabled) return html;
      return html.replace(
        '</head>',
        '  <script type="text/javascript" src="./webOSTV.js"></script>\n</head>',
      );
    },
    closeBundle() {
      if (!enabled) return;
      const outDir = path.resolve('dist-webos');
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(path.resolve('webos/appinfo.json'), path.join(outDir, 'appinfo.json'));
      fs.copyFileSync(path.resolve('icon.png'), path.join(outDir, 'icon.png'));
      fs.copyFileSync(
        path.resolve('node_modules/webostvjs/webOSTV.js'),
        path.join(outDir, 'webOSTV.js'),
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const isTizen = mode === 'tizen';
  const isWebOS = mode === 'webos';

  return {
    plugins: [react(), tizenBundlePlugin(isTizen), webosBundlePlugin(isWebOS)],
    base: './',
    build: {
      outDir: isTizen ? 'dist-tizen' : isWebOS ? 'dist-webos' : 'dist-web',
      emptyOutDir: true,
      target: isTizen || isWebOS ? 'chrome69' : 'es2020',
      cssTarget: isTizen || isWebOS ? 'chrome69' : 'chrome80',
      sourcemap: true,
    },
    server: {
      host: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    preview: {
      host: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
  };
});
