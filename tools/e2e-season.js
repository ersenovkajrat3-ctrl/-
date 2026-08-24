/* Прогон целого сезона через интерфейс: кнопки недели, итоги сезона, старт следующего. */
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.click('text=Начать карьеру');
  await page.click('text=Первенство регионов');
  await page.click('.club-pick .cp:last-child');
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');

  const clickIf = async (sel) => { const b = await page.$(sel); if (b) { await b.click(); await page.waitForTimeout(120); return true; } return false; };

  let seasonDone = false;
  for (let i = 0; i < 260; i++) {
    // любое всплывающее окно закрываем его же основной кнопкой
    const modal = await page.$('.modal-back');
    if (modal) {
      if (await page.$('.modal button:has-text("Начать сезон")')) { seasonDone = true; break; }
      const btns = await page.$$('.modal button');
      if (btns.length) { await btns[btns.length - 1].click(); await page.waitForTimeout(150); continue; }
      const txt = await page.$eval('.modal', (e) => e.textContent.slice(0, 120));
      console.log('окно без кнопок:', txt);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      continue;
    }
    const played = await clickIf('button:has-text("Мгновенно")')
      || await clickIf('button:has-text("Следующая неделя")')
      || await clickIf('button:has-text("К неделе")')
      || await clickIf('button:has-text("Итоги сезона")')
      || await clickIf('button:has-text("Завершить сезон")');
    if (!played) await page.waitForTimeout(200);
    await page.waitForTimeout(160);
  }
  console.log('сезон доигран до итогов:', seasonDone);
  await page.screenshot({ path: path.join(__dirname, '../.shots/s1-итоги.png') });
  const rep = await page.$eval('.modal', (e) => e.textContent.slice(0, 200)).catch(() => 'нет модалки итогов');
  console.log('итоги сезона:', rep.replace(/\s+/g, ' '));
  await clickIf('.modal button:has-text("Начать сезон")');
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const g = window.SETKA.UI.game;
    const c = g.clubs[g.playerClubId];
    return {
      season: g.seasonLabel, week: g.week, phase: g.phase, division: c.division,
      trophies: c.trophies.length, history: c.history.length, balance: Math.round(c.finance.balance / 1e6) + ' млн',
      squad: c.squad.length, fixtures: g.fixtures.length, feed: g.feed.length,
    };
  });
  console.log('новый сезон:', JSON.stringify(st));
  await page.screenshot({ path: path.join(__dirname, '../.shots/s2-новый-сезон.png') });
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
