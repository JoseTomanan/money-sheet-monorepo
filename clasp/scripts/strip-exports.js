const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distLib = path.join(root, 'dist', 'lib');

if (fs.existsSync(distLib)) {
  for (const f of fs.readdirSync(distLib).filter(f => f.endsWith('.js'))) {
    const p = path.join(distLib, f);
    const content = fs.readFileSync(p, 'utf8')
      .replace(/^export (function|const|let|var) /gm, '$1 ');
    fs.writeFileSync(p, content);
  }
}

fs.copyFileSync(
  path.join(root, 'src', 'appsscript.json'),
  path.join(root, 'dist', 'appsscript.json')
);
