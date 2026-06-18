/*
 * Copies the web app (index.html, src, styles, data) into ./app so electron-
 * builder can bundle a self-contained desktop app. Cross-platform (Node fs).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'app');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const item of ['index.html', 'src', 'styles', 'data']) {
  const from = path.join(root, item);
  const to = path.join(out, item);
  if (fs.existsSync(from)) {
    fs.cpSync(from, to, { recursive: true });
    console.log('copied', item);
  }
}
console.log('App copied to', out);
