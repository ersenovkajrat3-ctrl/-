/* Погода за стенами зала: месяц матча, улица вокруг здания, осадки и их влияние на кассу. */
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
  const clickIf = async (sel) => { if (!(await page.$(sel))) return false; try { await page.click(sel, { timeout: 2500 }); } catch (e) { return false; } await page.waitForTimeout(110); return true; };
  const closeAll = async () => {
    for (let i = 0; i < 6; i++) {
      if (await page.$('.overlay.ceremony')) { await clickIf('.overlay.ceremony button'); continue; }
      if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(140); continue; } }
      break;
    }
  };

  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await page.click('text=Начать карьеру');
  await page.click('text=Суперлига');
  await page.click('.club-pick .cp');
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');

  // прогноз стоит в карточке ближайшего матча
  check(await page.$('.next-match .wx-chip'), 'нет прогноза в карточке матча');

  // календарь сезона: сентябрь -> июнь, и погода на неделю не прыгает между вызовами
  const arc = await page.evaluate(() => {
    const Wx = window.SETKA.Weather;
    const out = [];
    for (let w = 0; w <= 37; w += 3) {
      const a = Wx.make(w, 'fx' + w), b = Wx.make(w, 'fx' + w);
      out.push({ w, month: a.monthName, kind: a.kind, temp: a.temp, cover: a.cover, same: a.label === b.label });
    }
    return out;
  });
  check(arc.every((x) => x.same), 'погода не детерминирована');
  const months = arc.map((x) => x.month);
  check(months[0] === 'сентябрь', 'сезон должен начинаться в сентябре, а не в ' + months[0]);
  check(months.includes('январь') && months.includes('май'), 'в сезоне нет зимы или весны: ' + months.join(','));
  const winter = arc.filter((x) => ['декабрь', 'январь', 'февраль'].includes(x.month));
  check(winter.every((x) => x.temp < 0 && x.cover > 0.5), 'зимой должно быть морозно и снежно');
  const autumn = arc.filter((x) => x.month === 'октябрь');
  check(autumn.every((x) => x.cover === 0), 'в октябре снега на земле быть не должно');
  console.log('дуга сезона:', arc.map((x) => x.w + ':' + x.month.slice(0, 3) + ' ' + x.temp + '° ' + x.kind).join(' | '));

  // осадки и посещаемость связаны
  const eff = await page.evaluate(() => {
    const Wx = window.SETKA.Weather;
    const mk = (kind) => ({ kind, temp: -5 });
    return { blizzard: Wx.attendanceFactor(mk('blizzard')), bloom: Wx.attendanceFactor(mk('bloom')), cloud: Wx.attendanceFactor(mk('cloud')) };
  });
  check(eff.blizzard < eff.cloud && eff.cloud < eff.bloom, 'погода не влияет на посещаемость: ' + JSON.stringify(eff));

  // смотрим матчи в разные месяцы
  const seen = [];
  for (const target of [2, 16, 33]) {
    for (let i = 0; i < 45; i++) {
      const wk = await page.evaluate(() => window.SETKA.UI.game.week);
      if (wk >= target) break;
      if (await page.$('.overlay.ceremony')) { await clickIf('.overlay.ceremony button'); continue; }
      if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(110); continue; } }
      if (!(await clickIf('button:has-text("Мгновенно")') || await clickIf('button:has-text("Следующая неделя")') || await clickIf('button:has-text("К неделе")'))) break;
    }
    await closeAll();
    await page.click('.tabbar button:nth-child(1)');
    await page.waitForTimeout(180);
    if (!(await clickIf('button:has-text("Смотреть матч")'))) continue;
    await page.waitForSelector('.court');
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => {
      const svg = document.querySelector('.court');
      const wx = window.SETKA.Weather.forFixture(window.SETKA.UI.game, window.SETKA.UI.game.fixtures.find((f) => f.played === false) || {});
      return {
        week: window.SETKA.UI.game.week,
        chip: (document.querySelector('.wx-chip') || {}).innerText || '',
        outside: !!svg.querySelector('.wx-outside'),
        drops: svg.querySelectorAll('.wx-drop').length,
        masked: !!svg.querySelector('.wx-drops[mask]'),
        box: svg.getAttribute('viewBox'),
        intro: (document.querySelector('.m-log .m-line') || {}).innerText || '',
      };
    });
    check(info.outside, 'нет улицы вокруг здания на неделе ' + info.week);
    check(/^-\d+ -\d+ /.test(info.box), 'кадр не расширен под улицу: ' + info.box);
    if (info.drops) check(info.masked, 'осадки не обрезаны по стенам зала');
    check(/[а-я]+ \+?-?\d+°/.test(info.chip.replace(/\n/g, ' ')), 'нет месяца и температуры в шапке: ' + info.chip);
    seen.push('нед.' + info.week + ' ' + info.chip.replace(/\n/g, ' ') + ' капель:' + info.drops);
    await page.screenshot({ path: path.join(__dirname, '../.shots/weather-' + target + '.png'), clip: { x: 0, y: 90, width: 390, height: 330 } });
    for (let i = 0; i < 60; i++) { if (!(await page.$('.court'))) break; if (!(await clickIf('button:has-text("Пропустить")') || await clickIf('button:has-text("Выйти")') || await clickIf('button:has-text("Закрыть")') || await clickIf('.m-ctrl button:last-child'))) break; }
    await closeAll();
  }
  check(seen.length >= 2, 'не удалось посмотреть матчи в разные месяцы');
  console.log('матчи:', seen.join(' | '));

  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
