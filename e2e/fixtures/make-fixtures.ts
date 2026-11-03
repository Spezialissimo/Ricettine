// Generates fixtures/portrait-orientation6.jpg: a "portrait phone photo" as a camera stores it.
// Stored pixels are landscape 400x300 (top half red, bottom half blue) with EXIF Orientation=6
// (rotate 90 degrees clockwise to display) and GPS tags. Displayed upright it is 300x400 with
// the stored top edge (red) on the right and the stored bottom edge (blue) on the left.
// Run with: npm run fixtures
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const W = 400;
const H = 300;
const raw = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const top = y < H / 2;
    raw[i] = top ? 255 : 0;
    raw[i + 1] = 0;
    raw[i + 2] = top ? 0 : 255;
  }
}

const jpeg = await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
  .withExif({
    IFD0: { Make: 'RicettineTest', Model: 'Fixture' },
    IFD3: {
      GPSLatitudeRef: 'N',
      GPSLatitude: '45/1 28/1 0/1',
      GPSLongitudeRef: 'E',
      GPSLongitude: '9/1 11/1 0/1',
    },
  })
  .withMetadata({ orientation: 6 })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toBuffer();

const out = join(dirname(fileURLToPath(import.meta.url)), 'portrait-orientation6.jpg');
writeFileSync(out, jpeg);
console.log(`wrote ${out} (${jpeg.length} bytes)`);
