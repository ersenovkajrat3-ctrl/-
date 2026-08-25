/* Сборные: турнир между сезонами, бегущая строка и экран сборной. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const shot = (n) => page.screenshot({ path: path.join(__dirname, '../.shots/nat-' + n + '.png') });
  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await page.click('text=Начать карьеру');
  await page.click('text=Суперлига');
  await page.click('.club-pick .cp');
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');
  // до турнира: строка про лигу и «ближайший турнир»
  await page.waitForTimeout(300);
  await shot('до-турнира');
  // прокручиваем сезон целиком, чтобы сборная сыграла
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
    Sn.endSeason(g);
    g.ceremonies = [];
    Sn.startSeason(g);
    S.UI.render();
  });
  await page.waitForTimeout(400);
  await shot('строка');
  const ticker = await page.$eval('#ticker', (e) => e.textContent.replace(/\s+/g, ' ').slice(0, 220));
  console.log('бегущая строка:', ticker);
  const moving = await page.$eval('.ticker-track', (e) => getComputedStyle(e).animationName + ' ' + getComputedStyle(e).animationDuration);
  console.log('анимация ленты:', moving);
  await page.click('#ticker button');
  await page.waitForTimeout(500);
  await shot('экран-сборной');
  const nat = await page.$eval('#screen', (e) => e.textContent.replace(/\s+/g, ' ').slice(0, 200));
  console.log('экран сборной:', nat);
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
})();
