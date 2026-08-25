/* Снимки оформления: таблица с эмблемами, лента, редактор формы, карточка игрока. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const shot = (n) => page.screenshot({ path: path.join(__dirname, '../.shots/design-' + n + '.png') });
  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await page.click('text=Начать карьеру');
  await page.click('text=Суперлига');
  await page.click('.club-pick .cp');
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');
  await page.waitForTimeout(300);
  await shot('клуб');
  await page.click('.tabbar button:nth-child(3)');
  await page.click('.tabs .tab:has-text("Таблица")');
  await page.waitForTimeout(400); await shot('таблица');
  await page.click('.tabs .tab:has-text("Календарь")');
  await page.waitForTimeout(300); await shot('календарь');
  await page.click('.tabbar button:nth-child(5)');
  await page.waitForTimeout(300); await shot('лента');
  await page.click('.tabbar button:nth-child(2)');
  await page.click('.tabs .tab:has-text("Заявка")');
  await page.waitForTimeout(300);
  await page.click('.plist .p-row');
  await page.waitForTimeout(400); await shot('игрок');
  await page.keyboard.press('Escape');
  await page.click('.modal-back', { position: { x: 10, y: 10 } }).catch(() => {});
  await page.waitForTimeout(200);
  await page.click('.tabbar button:nth-child(1)');
  await page.click('text=Настройки');
  await page.waitForTimeout(200);
  await page.click('text=Форма и эмблема');
  await page.waitForTimeout(500); await shot('редактор-формы');
  // прокручиваем сезон, чтобы накопились данные для графиков
  await page.keyboard.press('Escape');
  await page.click('.modal-back', { position: { x: 10, y: 10 } }).catch(() => {});
  await page.click('.tabbar button:nth-child(1)');
  const clickIf = async (sel) => { if (!(await page.$(sel))) return false; try { await page.click(sel, { timeout: 2500 }); } catch (e) { return false; } await page.waitForTimeout(120); return true; };
  for (let i = 0; i < 40; i++) {
    if (await page.$('.overlay.ceremony')) { await clickIf('.overlay.ceremony button'); continue; }
    if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(120); continue; } }
    if (!(await clickIf('button:has-text("Мгновенно")') || await clickIf('button:has-text("Следующая неделя")') || await clickIf('button:has-text("К неделе")'))) break;
    await page.waitForTimeout(140);
  }
  // закрываем всё, что могло остаться открытым после прокрутки сезона
  for (let i = 0; i < 6; i++) {
    if (await page.$('.overlay.ceremony')) { await clickIf('.overlay.ceremony button'); continue; }
    if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(150); continue; } }
    break;
  }
  await page.click('.tabbar button:nth-child(1)');
  await page.waitForTimeout(400); await shot('клуб-график');
  await page.click('text=Финансы'); await page.waitForTimeout(400); await shot('финансы-график');
  await page.click('.tabbar button:nth-child(1)');
  await page.click('text=Арена'); await page.waitForTimeout(400); await shot('арена-график');
  await page.click('.tabbar button:nth-child(2)');
  await page.click('.tabs .tab:has-text("Заявка")'); await page.waitForTimeout(300);
  await page.click('.plist .p-row'); await page.waitForTimeout(500); await shot('радар');
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
})();
