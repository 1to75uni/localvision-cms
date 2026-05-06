const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');
const index = path.join(dist, 'index.html');
if (!fs.existsSync(index)) {
  fs.mkdirSync(dist, { recursive: true });
  if (fs.existsSync(path.join(__dirname, 'index.html'))) {
    fs.copyFileSync(path.join(__dirname, 'index.html'), index);
  }
}
console.log('LocalVision CMS v1.6.4 static build: using prebuilt dist/ folder.');
