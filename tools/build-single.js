/* Сборка одностраничной версии: все скрипты и стили встраиваются в один HTML-файл.
   Нужна для публикации там, где нельзя раздавать несколько файлов. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const js = scripts.map((src) => '/* ' + src + ' */\n' + fs.readFileSync(path.join(root, src), 'utf8')).join('\n');

const body = html
  .replace(/<link rel="stylesheet"[^>]*>/, () => '<style>\n' + css + '\n</style>')
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<link rel="icon"[^>]*>\s*/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '')
  .replace(/(<script src="[^"]+"><\/script>\s*)+/, () => '<script>\n' + js + '\n</script>\n')
  .replace(/navigator\.serviceWorker\.register\('sw\.js'\)/, 'Promise.reject()');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/setka.html'), body);
console.log('dist/setka.html — ' + (body.length / 1024).toFixed(0) + ' КБ');
