/* Рендер PNG-иконок из SVG через встроенный Chromium. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../assets/icons/icon.svg'), 'utf8');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const sizes = [[192, 'icon-192.png', false], [512, 'icon-512.png', false], [512, 'icon-maskable.png', true], [180, 'icon-180.png', false]];
  for (const [size, name, maskable] of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const scale = maskable ? 0.72 : 1;
    await page.setContent(`<body style="margin:0;background:#0b1120;display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${size * scale}px;height:${size * scale}px">${svg}</div></body>`);
    await page.screenshot({ path: path.join(__dirname, '../assets/icons/', name), omitBackground: false });
    await page.close();
  }
  await browser.close();
  console.log('иконки готовы');
})();
