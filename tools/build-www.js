/* Сборка веб-части для нативной обёртки: копирует игру в www/ без сервис-воркера
   (в приложении он не нужен — все файлы и так лежат внутри пакета). */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'www');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const copy = (rel) => {
  const from = path.join(root, rel);
  const to = path.join(out, rel);
  fs.cpSync(from, to, { recursive: true });
};
['src', 'assets', 'manifest.json'].forEach(copy);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  // в нативной обёртке нет смысла в офлайн-кэше: файлы уже локальные
  .replace(/<script src="src\/app\.js"><\/script>/, '<script>window.SETKA_NATIVE = true;</script>\n<script src="src/app.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

console.log('www/ готов: ' + fs.readdirSync(out).join(', '));
