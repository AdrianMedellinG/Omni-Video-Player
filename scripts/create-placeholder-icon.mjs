import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve('icon.png');
if (fs.existsSync(target)) process.exit(0);

// 1x1 transparent PNG. Replace it with a proper Samsung TV icon before store submission.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
fs.writeFileSync(target, png);
