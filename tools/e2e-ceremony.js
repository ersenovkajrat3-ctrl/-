/* Кадры церемонии: выход команды, вручение кубка, подъём и салют. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
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
  // играем сезон, чтобы у игроков была статистика для наград
  await page.evaluate(() => {
    const S = window.SETKA, g = S.UI.game, Sn = S.Season;
    let guard = 0;
    while (g.phase !== 'offseason' && guard++ < 60) {
      const wk = Sn.startWeek(g);
      if (wk.seasonOver) break;
      let fx, n = 0;
      while ((fx = Sn.nextPlayerFixture(g)) && n++ < 12) Sn.playFixture(g, fx);
      Sn.completeWeek(g);
    }
    g.ceremonies = [];
    S.Ceremony.show(g, {
      type: 'league', title: 'Суперлига', subtitle: 'Чемпионский титул',
      clubId: g.playerClubId, awards: S.Season.seasonAwards(g, g.clubs[g.playerClubId].division),
    }, () => {});
  });
  const frames = [700, 1800, 2500, 3100, 3800, 4500, 5400];
  let prev = 0;
  for (const t of frames) {
    await page.waitForTimeout(t - prev);
    prev = t;
    await page.screenshot({ path: path.join(__dirname, '../.shots/cer-' + t + '.png') });
  }
  const txt = await page.$eval('.cer-stage', (e) => e.textContent.replace(/\s+/g, ' ').slice(0, 120));
  console.log('сцена:', txt);
  const cupPos = await page.$eval('.cer-cup', (e) => e.getAttribute('transform'));
  console.log('кубок:', cupPos);
  await page.click('.overlay.ceremony button');
  await page.waitForTimeout(300);
  const closed = await page.$('.overlay.ceremony');
  console.log('закрылась:', !closed);
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
})();
