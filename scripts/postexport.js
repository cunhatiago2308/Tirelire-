// Turns the web export (dist/) into an installable app (PWA):
// French language, home-screen metadata (iOS + Android), manifest generated from app.json.
// Run after `expo export --platform web` (see "build:web" in package.json).
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const { expo } = require('../app.json');
const name = expo.name;
const theme = expo.web?.themeColor ?? '#000000';

const manifest = {
  name,
  short_name: expo.web?.shortName ?? name,
  description: 'Budget, ventes et marge : ton argent vraiment dispo, 100 % sur ton téléphone.',
  lang: 'fr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: expo.web?.backgroundColor ?? '#000000',
  theme_color: theme,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const head = `
    <meta name="description" content="${manifest.description}" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="${name}" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    <style>html, body { background: ${theme}; }</style>
`;

const file = path.join(dist, 'index.html');
let html = fs.readFileSync(file, 'utf8');
if (!html.includes('rel="manifest"')) {
  html = html
    .replace('<html lang="en">', '<html lang="fr">')
    .replace(
      /<meta name="viewport"[^>]*>/,
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />',
    )
    .replace('</head>', `${head}</head>`);
  fs.writeFileSync(file, html);
}
console.log(`PWA ready in dist/ (${name})`);
