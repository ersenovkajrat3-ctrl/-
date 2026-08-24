/* Оформление Android-обёртки: цвета, иконки, заставка, портретная ориентация.
   Скрипт идемпотентный — его можно прогонять после каждого `npx cap add android`. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const res = path.join(root, 'android/app/src/main/res');

const BG = '#0b1120';
const ballSvg = fs.readFileSync(path.join(root, 'assets/icons/icon.svg'), 'utf8');
// для adaptive-иконки нужен только мяч без подложки: подложку рисует система
const ballOnly = ballSvg.replace(/<rect width="512" height="512" rx="112" fill="#0b1120"\/>/, '');

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/* Каждый кадр рисуем на своей странице: так надёжнее, чем менять размер вьюпорта,
   особенно для картинок с прозрачным фоном. */
async function render(browser, html, width, height, file, transparent) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<style>svg{width:100%;height:100%;display:block}</style>
    <body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${transparent ? 'transparent' : BG}">${html}</body>`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: !!transparent });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  for (const [dpi, k] of Object.entries(DENSITIES)) {
    const s = Math.round(48 * k);
    // обычная иконка — мяч на тёмной подложке со скруглением
    await render(browser, `<div style="width:${s}px;height:${s}px;background:${BG};display:grid;place-items:center">
      <div style="width:${s}px;height:${s}px">${ballSvg}</div></div>`, s, s,
      path.join(res, 'mipmap-' + dpi, 'ic_launcher.png'));
    // круглая иконка
    await render(browser, `<div style="width:${s}px;height:${s}px;background:${BG};border-radius:50%;display:grid;place-items:center;overflow:hidden">
      <div style="width:${s}px;height:${s}px">${ballSvg}</div></div>`, s, s,
      path.join(res, 'mipmap-' + dpi, 'ic_launcher_round.png'), true);
    // передний план adaptive-иконки: холст 108dp, безопасная зона 72dp
    const f = Math.round(108 * k);
    await render(browser, `<div style="width:${f}px;height:${f}px;display:grid;place-items:center">
      <div style="width:${Math.round(f * 0.62)}px;height:${Math.round(f * 0.62)}px">${ballOnly}</div></div>`, f, f,
      path.join(res, 'mipmap-' + dpi, 'ic_launcher_foreground.png'), true);
  }

  // заставка: тот же фон, что и у приложения, чтобы запуск не мигал белым
  const splash = (w, hh) => `<div style="width:${w}px;height:${hh}px;background:${BG};display:grid;place-items:center">
    <div style="width:${Math.round(Math.min(w, hh) * 0.30)}px;height:${Math.round(Math.min(w, hh) * 0.30)}px">${ballSvg}</div></div>`;
  const splashSizes = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  for (const [dpi, [w, hh]] of Object.entries(splashSizes)) {
    await render(browser, splash(w, hh), w, hh, path.join(res, 'drawable-port-' + dpi, 'splash.png'));
    await render(browser, splash(hh, w), hh, w, path.join(res, 'drawable-land-' + dpi, 'splash.png'));
  }
  await render(browser, splash(720, 1280), 720, 1280, path.join(res, 'drawable', 'splash.png'));
  await browser.close();

  // цвета темы: в шаблоне Capacitor на них есть ссылки, но самого файла нет
  fs.writeFileSync(path.join(res, 'values/colors.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#080D17</color>
    <color name="colorPrimaryDark">#05090F</color>
    <color name="colorAccent">#FF9F1C</color>
    <color name="ic_launcher_background">${BG.toUpperCase()}</color>
</resources>
`);
  fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background_unused">${BG.toUpperCase()}</color>
</resources>
`);

  // портретная ориентация: игра свёрстана под вертикальный экран
  const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('android:screenOrientation')) {
    manifest = manifest.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"');
    fs.writeFileSync(manifestPath, manifest);
  }

  // версия приложения
  const gradlePath = path.join(root, 'android/app/build.gradle');
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionName "[^"]*"/, 'versionName "1.0.0"');
  fs.writeFileSync(gradlePath, gradle);

  console.log('иконки, заставка, цвета и манифест обновлены');
})();
