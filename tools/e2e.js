/* Сквозной прогон в браузере: старт → выбор клуба → матч → неделя. Ловит ошибки консоли. */
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const SHOT = path.join(__dirname, '../.shots');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { errors.push('ШАГ «' + name + '»: ' + e.message); }
    await page.screenshot({ path: path.join(SHOT, name + '.png') });
    console.log('  ✓ ' + name);
  };

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await step('01-старт', async () => { await page.waitForSelector('text=Начать карьеру', { timeout: 5000 }); });
  await step('02-дивизионы', async () => { await page.click('text=Начать карьеру'); await page.waitForSelector('text=Первенство регионов'); });
  await step('03-клубы', async () => { await page.click('text=Высшая лига Б'); await page.waitForSelector('.club-pick .cp'); });
  await step('04-карточка-клуба', async () => { await page.click('.club-pick .cp'); await page.waitForSelector('text=Возглавить клуб'); });
  await step('05-клуб', async () => { await page.click('text=Возглавить клуб'); await page.waitForSelector('.tabbar'); });
  await step('06-состав', async () => { await page.click('.tabbar button:nth-child(2)'); await page.waitForSelector('text=Шестёрка'); });
  await step('07-тактика', async () => { await page.click('.tabs .tab:has-text("Тактика")'); await page.waitForSelector('text=Подача'); });
  await step('08-рынок', async () => { await page.click('.tabbar button:nth-child(4)'); await page.waitForTimeout(300); });
  await step('09-лента', async () => { await page.click('.tabbar button:nth-child(5)'); await page.waitForTimeout(300); });
  await step('10-матчи', async () => { await page.click('.tabbar button:nth-child(3)'); await page.waitForTimeout(300); });
  await step('11-таблица', async () => { await page.click('.tabs .tab:has-text("Таблица")'); await page.waitForSelector('table.tbl'); });
  await step('12-арена', async () => {
    await page.click('.tabbar button:nth-child(1)');
    await page.click('text=Арена'); await page.waitForSelector('text=Лицензия CEV');
  });
  await step('13-спонсоры', async () => {
    await page.click('.tabbar button:nth-child(1)');
    await page.click('text=Спонсоры'); await page.waitForTimeout(300);
  });
  await step('14-финансы', async () => {
    await page.click('.tabbar button:nth-child(1)');
    await page.click('text=Финансы'); await page.waitForTimeout(300);
  });
  await step('15-матч-старт', async () => {
    await page.click('.tabbar button:nth-child(1)');
    for (let i = 0; i < 4; i++) {
      if (await page.$('button:has-text("Смотреть матч")')) break;
      const nx = await page.$('button:has-text("Следующая неделя")') || await page.$('button:has-text("К неделе")');
      if (nx) { await nx.click(); await page.waitForTimeout(600); }
      const cont = await page.$('.modal button:has-text("Продолжить")');
      if (cont) { await cont.click(); await page.waitForTimeout(300); }
    }
    await page.click('text=Смотреть матч');
    await page.waitForSelector('.court', { timeout: 5000 });
    await page.waitForTimeout(1200);
  });
  await step('16-матч-ускорение', async () => {
    await page.click('.m-ctrl button:has-text("×4")');
    await page.waitForTimeout(800);
  });
  await step('17-тайм-аут', async () => {
    const b = await page.$('.m-ctrl button:has-text("Тайм-аут")');
    if (b) await b.click();
    await page.waitForTimeout(400);
  });
  await step('18-до-конца', async () => {
    await page.click('.m-ctrl button:has-text("До конца")');
    await page.waitForSelector('text=Итоги матча', { timeout: 10000 });
  });
  await step('19-итоги-матча', async () => {
    await page.click('text=Итоги матча');
    await page.waitForTimeout(600);
  });
  await step('20-после-матча', async () => {
    const next = await page.$('.modal button:has-text("Дальше")');
    if (next) await next.click();
    await page.waitForTimeout(900);
    const cont = await page.$('.modal button:has-text("Продолжить")');
    if (cont) await cont.click();
    await page.waitForTimeout(400);
  });
  // несколько недель подряд мгновенной симуляцией
  await step('21-пять-недель', async () => {
    for (let i = 0; i < 5; i++) {
      const btn = await page.$('button:has-text("Мгновенно")') || await page.$('button:has-text("Следующая неделя")');
      if (!btn) break;
      await btn.click();
      await page.waitForTimeout(500);
      const dalee = await page.$('.modal button:has-text("Дальше")');
      if (dalee) { await dalee.click(); await page.waitForTimeout(400); }
      const cont = await page.$('.modal button:has-text("Продолжить")');
      if (cont) { await cont.click(); await page.waitForTimeout(300); }
    }
  });
  await step('22-таблица-после', async () => {
    await page.click('.tabbar button:nth-child(3)');
    await page.click('.tabs .tab:has-text("Таблица")');
    await page.waitForTimeout(400);
  });
  const state = await page.evaluate(() => {
    const g = window.SETKA.UI.game;
    return { week: g.week, results: g.results.length, feed: g.feed.length, balance: g.clubs[g.playerClubId].finance.balance };
  });
  console.log('\nсостояние:', JSON.stringify(state));
  console.log(errors.length ? '\nОШИБКИ:\n' + errors.join('\n') : '\nошибок нет');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
