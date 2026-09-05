import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const width = 1200;
const height = 630;
const backdrop = fileURLToPath(new URL('../src/assets/social-preview-backdrop.png', import.meta.url));
const wordmark = fileURLToPath(new URL('../src/assets/logos/wordmark-light.webp', import.meta.url));
const output = fileURLToPath(new URL('../src/assets/social-preview.png', import.meta.url));

const logo = await sharp(wordmark)
  .resize({ width: 190 })
  .png()
  .toBuffer();

const title = Buffer.from(`
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <text
      x="62"
      y="156"
      fill="#111411"
      font-family="Iowan Old Style, Palatino Linotype, Book Antiqua, Palatino, Georgia, serif"
      font-size="56"
      font-weight="600"
      letter-spacing="-2"
    >
      <tspan x="62" dy="0" fill="#111411">A</tspan>
      <tspan x="108" fill="#a37f1f">deeper look</tspan>
      <tspan x="414" fill="#111411">at</tspan>
      <tspan x="62" dy="61" fill="#111411">AI agent evaluations</tspan>
    </text>
  </svg>
`);

await sharp(backdrop)
  .resize(width, height, { fit: 'cover', position: 'centre' })
  .composite([
    { input: title, left: 0, top: 0 },
    { input: logo, left: 62, top: 36 },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output);

console.log(`Generated ${output} (${width}×${height})`);
