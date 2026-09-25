// Generates every app / PWA icon from one SVG (run: node scripts/make-icons.js, needs Playwright + Chromium).
// Design: green rising trend line with an arrow head on black.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const GREEN = '#22C55E';
const glyph = (color, scale) => `
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)"
     fill="none" stroke="${color}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20,72 38,50 52,61 78,30" />
    <polyline points="62,29 79,29 79,46" />
  </g>`;
const svg = ({ bg, color = GREEN, scale = 1, glow = false }) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <defs>
      <radialGradient id="g" cx="50%" cy="45%" r="55%">
        <stop offset="0" stop-color="${GREEN}" stop-opacity="0.22" />
        <stop offset="1" stop-color="${GREEN}" stop-opacity="0" />
      </radialGradient>
    </defs>
    ${bg ? `<rect width="100" height="100" fill="${bg}" />` : ''}
    ${glow ? '<rect width="100" height="100" fill="url(#g)" />' : ''}
    ${glyph(color, scale)}
  </svg>`;

const root = path.join(__dirname, '..');
const targets = [
  ['assets/icon.png', 1024, { bg: '#000', glow: true, scale: 0.9 }],
  ['assets/android-icon-foreground.png', 512, { scale: 0.62 }],
  ['assets/android-icon-background.png', 512, { bg: '#000', glow: true, scale: 0 }],
  ['assets/android-icon-monochrome.png', 432, { color: '#fff', scale: 0.62 }],
  ['assets/splash-icon.png', 1024, { scale: 0.9 }],
  ['assets/favicon.png', 48, { bg: '#000', scale: 1.05 }],
  ['public/icons/icon-192.png', 192, { bg: '#000', glow: true, scale: 0.9 }],
  ['public/icons/icon-512.png', 512, { bg: '#000', glow: true, scale: 0.9 }],
  ['public/icons/maskable-512.png', 512, { bg: '#000', glow: true, scale: 0.7 }],
  ['public/icons/apple-touch-icon.png', 180, { bg: '#000', glow: true, scale: 0.9 }],
];

(async () => {
  const browser = await chromium.launch();
  for (const [file, size, opts] of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(opts)}</body></html>`);
    await page.screenshot({ path: path.join(root, file), omitBackground: true });
    await page.close();
    console.log('✓', file);
  }
  await browser.close();
})();
