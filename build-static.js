const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');
fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(__dirname,'_routes.json'),path.join(dist,'_routes.json'));
fs.copyFileSync(path.join(__dirname,'_headers'),path.join(dist,'_headers'));

for (const file of ['index.html', 'boot.html', 'lv-id-url-manager.html', 'playback-health.html', 'operations.html']) {
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

console.log('LocalVision CMS v3.0.0 static build: dist refreshed.');
