import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgIcon = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0f172a" rx="100"/>
  <circle cx="256" cy="256" r="160" fill="#3b82f6" />
  <text x="256" y="296" font-family="Arial" font-size="120" font-weight="bold" fill="white" text-anchor="middle">AO</text>
</svg>
`;

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

async function main() {
  await sharp(Buffer.from(svgIcon))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  
  await sharp(Buffer.from(svgIcon))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // Maskable icon
  const maskableSvg = `
  <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#0f172a" />
    <circle cx="256" cy="256" r="120" fill="#3b82f6" />
    <text x="256" y="286" font-family="Arial" font-size="100" font-weight="bold" fill="white" text-anchor="middle">AO</text>
  </svg>
  `;
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), Buffer.from(svgIcon)); // Just mock it, ideally sharp converts to ico but sharp doesn't support ico directly. We can just use svg as favicon.
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgIcon);
}

main().catch(console.error);
