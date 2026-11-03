import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { LOGO_H, LOGO_PATH, LOGO_W } from '../src/components/logo.js';

mkdirSync('public/icons', { recursive: true });
// White logo on black, sized by how much of the square it should fill.
const svg = (fill) => {
  const S = 1024; const w = S * fill; const k = w / LOGO_W; const h = LOGO_H * k;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" fill="#000"/><g transform="translate(${(S - w) / 2} ${(S - h) / 2}) scale(${k})"><path fill="#fff" d="${LOGO_PATH}"/></g></svg>`);
};
await sharp(svg(0.84)).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
await sharp(svg(0.84)).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(svg(0.84)).resize(512, 512).png().toFile('public/icons/icon-512.png');
await sharp(svg(0.7)).resize(512, 512).png().toFile('public/icons/icon-512-maskable.png');
