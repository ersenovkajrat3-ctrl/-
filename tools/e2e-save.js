/* Проверка сохранения: сыграть несколько недель, перезагрузить страницу, продолжить карьеру. */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await page.click('text=Начать карьеру');
  await page.click('text=Высшая лига А');
  await page.click('.club-pick .cp');
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');
  const clickIf = async (sel) => { const b = await page.$(sel); if (b) { await b.click(); await page.waitForTimeout(150); return true; } return false; };
  for (let i = 0; i < 24; i++) {
    if (await page.$('.modal-back')) {
      const btns = await page.$$('.modal button');
      if (btns.length) { await btns[btns.length - 1].click(); await page.waitForTimeout(150); continue; }
    }
    await clickIf('button:has-text("Мгновенно")') || await clickIf('button:has-text("Следующая неделя")') || await clickIf('button:has-text("К неделе")');
    await page.waitForTimeout(200);
  }
  const before = await page.evaluate(() => {
    const g = window.SETKA.UI.game, c = g.clubs[g.playerClubId];
    return { week: g.week, results: g.results.length, balance: c.finance.balance, squad: c.squad.length, rng: g._rng.a, feed: g.feed.length, sizeKB: Math.round(JSON.stringify(window.SETKA.Save ? localStorage.getItem(window.SETKA.Save.KEY) || '' : '').length / 1024) };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('text=Продолжить карьеру');
  await page.waitForSelector('.tabbar');
  const after = await page.evaluate(() => {
    const g = window.SETKA.UI.game, c = g.clubs[g.playerClubId];
    return { week: g.week, results: g.results.length, balance: c.finance.balance, squad: c.squad.length, rng: g._rng.a, feed: g.feed.length };
  });
  // и продолжаем играть после загрузки
  for (let i = 0; i < 4; i++) {
    if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(150); continue; } }
    await clickIf('button:has-text("Мгновенно")') || await clickIf('button:has-text("Следующая неделя")') || await clickIf('button:has-text("К неделе")');
    await page.waitForTimeout(250);
  }
  const later = await page.evaluate(() => { const g = window.SETKA.UI.game; return { week: g.week, results: g.results.length }; });
  console.log('до перезагрузки:', JSON.stringify(before));
  console.log('после загрузки: ', JSON.stringify(after));
  console.log('игра продолжается:', JSON.stringify(later));
  // журнал результатов при сохранении обрезается до 150 записей — это ожидаемо
  const same = ['week', 'balance', 'squad', 'rng'].every((k) => before[k] === after[k])
    && after.results === Math.min(before.results, 150) && after.feed === Math.min(before.feed, 60);
  console.log(same ? 'состояние восстановлено полностью' : 'РАСХОЖДЕНИЕ ПОСЛЕ ЗАГРУЗКИ');
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
  process.exit(same && !errors.length ? 0 : 1);
})();
