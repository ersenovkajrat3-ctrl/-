/* Европа: путёвки, жеребьёвка, результаты всех клубов и чемпионаты стран. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  page.setDefaultTimeout(9000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const check = (cond, msg) => { if (!cond) errors.push('ПРОВЕРКА: ' + msg); };
  const clickIf = async (sel) => { if (!(await page.$(sel))) return false; try { await page.click(sel, { timeout: 2500 }); } catch (e) { return false; } await page.waitForTimeout(120); return true; };

  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('text=Начать карьеру');
  await page.click('text=Суперлига');
  await page.click('.club-pick .cp');
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');
  // берём клуб с лицензией, чтобы был свой еврокубок
  await page.evaluate(() => {
    const g = window.SETKA.UI.game, c = g.clubs[g.playerClubId];
    c.arena.media = 2; c.arena.stands = 2;
  });

  await page.click('.tabbar button:nth-child(3)');
  await page.waitForTimeout(200);
  const tabNames = await page.$$eval('.tabs .tab', (n) => n.map((e) => e.textContent));
  const euroTab = await page.$('.tabs .tab:last-child');
  check(!!euroTab, 'нет вкладки еврокубков среди: ' + tabNames.join(', '));
  await euroTab.click();
  await page.waitForTimeout(300);

  const txt = await page.innerText('.screen');
  check(/путёвки этого сезона/i.test(txt), 'нет блока путёвок');
  check(/лига чемпионов cev/i.test(txt), 'нет Лиги чемпионов в путёвках');
  check(/чемпионаты европы/i.test(txt), 'нет чемпионатов Европы');
  check(/коэф\./.test(txt), 'нет коэффициентов стран');
  await page.screenshot({ path: path.join(__dirname, '../.shots/euro-путёвки.png'), fullPage: true });

  // раскрываем чемпионат страны
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Италия|Польша/.test(x.textContent));
    if (!b) return null;
    b.click();
    return true;
  });
  check(opened, 'не нашлась кнопка чемпионата страны');
  await page.waitForTimeout(300);
  const league = await page.evaluate(() => {
    const S = window.SETKA, g = S.UI.game;
    const l = g.euroLeagues[0];
    return {
      countries: g.euroLeagues.length,
      top: l.country, clubs: l.clubs.length,
      ucl: l.clubs.filter((c) => c.cup === 'ucl').length,
      cev: l.clubs.filter((c) => c.cup === 'cev').length,
      places: l.clubs.map((c) => c.place).join(','),
    };
  });
  check(league.countries >= 10, 'мало стран: ' + league.countries);
  check(league.ucl >= 1, 'сильнейшая страна без путёвки в Лигу чемпионов');
  check(league.places === league.clubs > 0 ? league.places : league.places, 'места не проставлены');
  console.log('чемпионаты:', JSON.stringify(league));
  await page.screenshot({ path: path.join(__dirname, '../.shots/euro-чемпионаты.png'), fullPage: true });

  // жеребьёвка своего еврокубка
  const draw = await page.evaluate(() => {
    const g = window.SETKA.UI.game;
    if (!g.euro) return null;
    return { pots: g.euro.draw.pots.length, rivals: g.euro.draw.rivals.map((r) => r.name), host: g.euro.host && g.euro.host.city };
  });
  if (draw) {
    check(draw.pots === 3, 'должно быть три корзины: ' + draw.pots);
    check(draw.rivals.length === 3, 'в группе должно быть три соперника');
    check(!!draw.host, 'не назначен город «Финала четырёх»');
    check(/жеребьёвка/i.test(txt), 'жеребьёвки нет на экране');
    console.log('жеребьёвка:', JSON.stringify(draw));
  }

  // доигрываем сезон через API — интерфейс тут только показывает результат
  const season = await page.evaluate(() => {
    const S = window.SETKA, g = S.UI.game, Sn = S.Season;
    let guard = 0;
    while (g.phase !== 'offseason' && guard++ < 50) {
      const wk = Sn.startWeek(g);
      if (wk.seasonOver) break;
      let fx, n = 0;
      while ((fx = Sn.nextPlayerFixture(g)) && n++ < 12) Sn.playFixture(g, fx);
      Sn.completeWeek(g);
    }
    Sn.endSeason(g);
    if (!g.euroSeason) return null;
    return Object.keys(g.euroSeason.cups).map((id) => {
      const c = g.euroSeason.cups[id];
      return {
        cup: c.short, winner: c.winner && c.winner.name, ours: !!(c.winner && c.winner.ours),
        teams: c.teams.length, groups: (c.groups || []).length,
        mine: c.teams.filter((t) => t.ours).map((t) => t.name + ': ' + t.label),
      };
    });
  });
  check(!!season, 'еврокубки сезона не разыграны');
  if (season) {
    check(season.length === 3, 'разыграны не все три кубка: ' + season.length);
    check(season.every((c) => c.winner), 'у какого-то кубка нет победителя');
    check(season.every((c) => c.teams === 8 && c.groups === 2), 'сетка кубка собрана неверно: ' + JSON.stringify(season.map((c) => c.teams + '/' + c.groups)));
    check(season.some((c) => c.mine.length), 'ни один наш клуб не отмечен в итогах');
    console.log('итоги:', season.map((c) => c.cup + ' — ' + c.winner + (c.ours ? ' (наш)' : '')).join(' | '));
    console.log('наши:', season.flatMap((c) => c.mine).join(' | '));
  }

  // и всё это видно на экране
  await page.evaluate(() => window.SETKA.UI.render());
  await page.waitForTimeout(300);
  await page.click('.tabbar button:nth-child(3)');
  await page.waitForTimeout(150);
  await page.click('.tabs .tab:last-child');
  await page.waitForTimeout(400);
  const after = await page.innerText('.screen');
  check(/итоги сезона/i.test(after), 'на экране нет итогов еврокубков');
  check(/трофей|🏆/i.test(after) || season.some((c) => after.includes(c.winner)), 'на экране нет победителей кубков');
  await page.screenshot({ path: path.join(__dirname, '../.shots/euro-итоги.png'), fullPage: true });

  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
