const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });

for (const file of ['index.html', 'boot.html', 'lv-id-url-manager.html']) {
  const from = path.join(__dirname, file);
  const to = path.join(dist, file);
  if (fs.existsSync(from)) fs.copyFileSync(from, to);
}

const assetsFrom = path.join(__dirname, 'assets');
const assetsTo = path.join(dist, 'assets');
if (fs.existsSync(assetsFrom)) {
  fs.mkdirSync(assetsTo, { recursive: true });
  for (const file of fs.readdirSync(assetsFrom)) {
    fs.copyFileSync(path.join(assetsFrom, file), path.join(assetsTo, file));
  }
}

console.log('LocalVision CMS v1.8.1 API DIET static build: snapshot + offline-first API; dist refreshed.');
