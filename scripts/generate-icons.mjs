// Renders the PWA icons in public/ from the app's leaf logo. Run: node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { writeFileSync } from 'node:fs';

const leaf = '<path d="M9 20c0-6 5-10 14-11-1 9-5 14-11 14-1.5 0-3-1-3-3z" fill="#fff"/>';
// "any" icon: rounded square like the favicon. "maskable": full-bleed background, logo inside the 80% safe zone.
const anySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#4a8259"/>${leaf}</svg>`;
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#4a8259"/><g transform="translate(16 16) scale(0.68) translate(-16 -16)">${leaf}</g></svg>`;
const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#4a8259"/><g transform="translate(16 16) scale(0.8) translate(-16 -16)">${leaf}</g></svg>`;

const out = [
  ['public/pwa-192x192.png', anySvg, 192],
  ['public/pwa-512x512.png', anySvg, 512],
  ['public/maskable-512x512.png', maskSvg, 512],
  ['public/apple-touch-icon.png', appleSvg, 180],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, svg, size] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log('wrote', file);
}
await browser.close();
