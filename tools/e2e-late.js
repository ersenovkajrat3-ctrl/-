/* Проверка поздних экранов: плей-офф, кубок, еврокубок, лента, заявка. */
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
  await page.click('.club-pick .cp');           // самый сильный клуб — попадёт в еврокубки
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');
  // быстро прокручиваем сезон в состоянии игры, минуя интерфейс
  await page.evaluate(() => {
    const S = window.SETKA, g = S.UI.game, Sn = S.Season;
    g.clubs[g.playerClubId].arena.media = 2;            // лицензия CEV
    Sn.startSeason(g);
    let guard = 0;
    while (g.phase !== 'offseason' && guard++ < 40) {
      const wk = Sn.startWeek(g);
      if (wk.seasonOver) break;
      let fx, n = 0;
      while ((fx = Sn.nextPlayerFixture(g)) && n++ < 12) Sn.playFixture(g, fx);
      Sn.completeWeek(g);
      if (g.week >= 33) break;
    }
    S.UI.render();
  });
  const shot = async (name) => { await page.screenshot({ path: path.join(__dirname, '../.shots/late-' + name + '.png') }); };
  await page.click('.tabbar button:nth-child(3)');
  await page.click('.tabs .tab:has-text("Плей-офф")'); await page.waitForTimeout(300); await shot('плей-офф');
  await page.click('.tabs .tab:has-text("Кубок")'); await page.waitForTimeout(300); await shot('кубок');
  const euroTab = await page.$('.tabs .tab:has-text("ЛЧ")');
  if (euroTab) { await euroTab.click(); await page.waitForTimeout(300); await shot('еврокубок'); }
  else console.log('еврокубковой вкладки нет');
  await page.click('.tabbar button:nth-child(5)'); await page.waitForTimeout(300); await shot('лента');
  await page.click('.tabbar button:nth-child(2)');
  await page.click('.tabs .tab:has-text("Заявка")'); await page.waitForTimeout(300); await shot('заявка');
  await page.click('.tabbar button:nth-child(1)');
  await page.click('text=Финансы'); await page.waitForTimeout(300); await shot('финансы');
  const info = await page.evaluate(() => {
    const g = window.SETKA.UI.game;
    return { week: g.week, phase: g.phase, euro: g.euro ? g.euro.name + '/' + (g.euro.result || g.euro.stage) : 'нет', cup: !!g.cup.winner, playoffs: !!g.playoffs };
  });
  console.log('состояние:', JSON.stringify(info));
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
})();
