/* Проверка рынка: зарубежные покупки и продажа за границу. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await page.click('text=Начать карьеру');
  await page.click('text=Суперлига');
  await page.click('.club-pick .cp');
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');
  await page.click('.tabbar button:nth-child(4)');
  await page.click('.tabs .tab:has-text("Заграница")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, '../.shots/market-заграница.png') });
  const rows = await page.$$eval('.plist .p-row', (els) => els.slice(0, 3).map((e) => e.textContent.replace(/\s+/g, ' ').slice(0, 80)));
  console.log('зарубежные игроки:\n  ' + rows.join('\n  '));
  // покупка первого доступного
  const before = await page.evaluate(() => window.SETKA.UI.game.clubs[window.SETKA.UI.game.playerClubId].squad.length);
  await page.click('.plist .p-row');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, '../.shots/market-карточка.png') });
  const signed = await page.$('.modal button:has-text("Подписать")');
  if (signed) { await signed.click(); await page.waitForTimeout(400); }
  const after = await page.evaluate(() => window.SETKA.UI.game.clubs[window.SETKA.UI.game.playerClubId].squad.length);
  console.log('состав до/после покупки:', before, '→', after);
  // продажа за рубеж
  await page.click('.tabs .tab:has-text("Продать")');
  await page.waitForTimeout(300);
  await page.click('.plist .p-row');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, '../.shots/market-продажа.png') });
  const offers = await page.$$eval('.modal .p-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').slice(0, 60)));
  console.log('предложения:\n  ' + offers.join('\n  '));
  const abroadOffer = await page.$('.modal .p-row:has-text("игрок уедет из лиги")');
  if (abroadOffer) {
    await abroadOffer.click();
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => {
      const g = window.SETKA.UI.game;
      const last = g.clubs[g.playerClubId].finance.ledger[0];
      return last.label + ' ' + Math.round(last.amount / 1e6) + ' млн';
    });
    console.log('сделка:', st);
  } else console.log('зарубежных предложений по игроку нет');
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
})();
