/* Дворец спорта снаружи: изометрия, апгрейды, время начала матча, телевидение, ёлка в декабре. */
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

  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('text=Начать карьеру');
  await page.click('text=Суперлига');
  await page.click('.club-pick .cp');
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');

  // сцена на экране арены
  await page.click('.tabbar button:nth-child(1)');
  await page.click('text=Арена');
  await page.waitForSelector('.exterior');
  const base = await page.evaluate(() => ({
    boxes: document.querySelectorAll('.exterior polygon').length,
    walkers: document.querySelectorAll('.exterior .ex-walker').length,
    name: document.querySelector('.exterior text').textContent,
  }));
  check(base.boxes > 80, 'сцена почти пустая: полигонов ' + base.boxes);
  check(base.walkers > 3, 'зрители не идут ко входу');
  await page.screenshot({ path: path.join(__dirname, '../.shots/arena-сцена.png'), clip: { x: 0, y: 90, width: 390, height: 320 } });

  // апгрейды видны в сцене
  const grown = await page.evaluate(() => {
    const g = window.SETKA.UI.game, c = g.clubs[g.playerClubId];
    const before = document.querySelectorAll('.exterior polygon').length;
    Object.assign(c.arena, { stands: 4, vip: 2, media: 3, base: 3, service: 2, shop: 2 });
    window.SETKA.UI.render();
    return { before, after: document.querySelectorAll('.exterior polygon').length };
  });
  check(grown.after > grown.before, 'апгрейды арены не видно в сцене: ' + JSON.stringify(grown));

  // имя арены следует за титульным спонсором
  const naming = await page.evaluate(() => {
    const S = window.SETKA, g = S.UI.game, c = g.clubs[g.playerClubId];
    S.Economy.restoreName(c);                 // клуб мог стартовать с титульным партнёром
    const plain = S.Economy.arenaName(c);
    S.Economy.renameFor(c, 'Севергаз');
    const sponsored = S.Economy.arenaName(c);
    S.Economy.restoreName(c);
    return { plain, sponsored, restored: S.Economy.arenaName(c) };
  });
  check(/Севергаз-Арена/.test(naming.sponsored), 'арена не берёт имя титульного партнёра: ' + naming.sponsored);
  check(naming.restored === naming.plain, 'имя арены не вернулось после разрыва: ' + naming.restored);
  console.log('нейминг:', JSON.stringify(naming));

  // время начала и освещённость
  const times = await page.evaluate(() => {
    const Wx = window.SETKA.Weather;
    const out = [];
    for (const [w, t] of [[2, 'league'], [13, 'league'], [20, 'euro'], [34, 'playoff']]) {
      const x = Wx.make(w, 'k' + w, t);
      out.push({ w, month: x.monthName, time: x.timeLabel, daylight: x.daylight, night: x.night });
    }
    return out;
  });
  check(times.every((t) => /^\d{1,2}:\d{2}$/.test(t.time)), 'время начала не проставлено: ' + JSON.stringify(times));
  check(times.some((t) => t.daylight === 'night') , 'ни один матч не выпал на тёмное время');
  console.log('время начала:', times.map((t) => t.w + ':' + t.month.slice(0, 3) + ' ' + t.time + ' ' + t.daylight).join(' | '));

  // ёлка в декабре
  const holiday = await page.evaluate(() => {
    const S = window.SETKA, g = S.UI.game, c = g.clubs[g.playerClubId];
    const dec = S.Exterior.scene(g, c, { weather: S.Weather.make(13, 'x', 'league'), fill: 0.8 });
    const sep = S.Exterior.scene(g, c, { weather: S.Weather.make(1, 'x', 'league'), fill: 0.8 });
    return { dec: dec.querySelectorAll('.ex-light').length, sep: sep.querySelectorAll('.ex-light').length };
  });
  check(holiday.dec > 10, 'в декабре нет новогодних огней: ' + holiday.dec);
  check(holiday.sep === 0, 'в сентябре откуда-то новогодние огни: ' + holiday.sep);
  console.log('новогодних огней: декабрь ' + holiday.dec + ', сентябрь ' + holiday.sep);

  // телевидение: деньги, камеры и плашка «в эфире»
  const tv = await page.evaluate(() => {
    const S = window.SETKA, g = S.UI.game, c = g.clubs[g.playerClubId];
    c.arena.media = 2;
    const fx = g.fixtures.find((f) => !f.played && f.h === c.id);
    const t = S.Economy.televised(g, c, fx, g.clubs[fx.a] || null);
    const sum = S.Economy.summary(g, c);
    return { on: !!t, fee: t && t.fee, channel: t && t.channel, share: sum.tvShare, tvMonth: sum.tv };
  });
  check(tv.share > 0.5, 'в суперлиге должны показывать большинство матчей: ' + tv.share);
  check(tv.tvMonth > 0, 'телевидение не приносит денег');
  console.log('ТВ:', JSON.stringify(tv));

  await page.click('.tabbar button:nth-child(1)');
  await page.click('text=Финансы');
  await page.waitForTimeout(300);
  const fin = await page.innerText('.screen');
  check(/Телевидение/.test(fin), 'в финансах нет раздела про телевидение');
  check(/Права на показ/.test(fin), 'в финансах нет строки прав на показ');

  // вступительный кадр перед матчем
  await page.click('.tabbar button:nth-child(1)');
  await page.waitForTimeout(200);
  // доводим календарь до недели с матчем, иначе кнопки просмотра просто нет
  for (let i = 0; i < 6 && !(await page.$('button:has-text("Смотреть матч")')); i++) {
    if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(120); continue; } }
    if (!(await clickIf('button:has-text("Следующая неделя")') || await clickIf('button:has-text("К неделе")'))) break;
    await page.waitForTimeout(150);
  }
  const started = await clickIf('button:has-text("Смотреть матч")');
  check(started, 'не удалось открыть просмотр матча');
  if (started) {
    await page.waitForSelector('.ex-intro');
    const introShot = await page.evaluate(() => ({
      scene: !!document.querySelector('.ex-intro .exterior'),
      teams: (document.querySelector('.ex-intro .vs-line') || {}).innerText || '',
    }));
    check(introShot.scene, 'во вступительном кадре нет сцены');
    check(introShot.teams.length > 3, 'во вступительном кадре нет соперников');
    await page.screenshot({ path: path.join(__dirname, '../.shots/arena-вступление.png') });
    await page.click('.ex-intro');
    await page.waitForTimeout(400);
    const live = await page.evaluate(() => ({
      court: !!document.querySelector('.court'),
      onAir: !!document.querySelector('.on-air'),
      cams: document.querySelectorAll('.court .tv-rig .tally').length,
      chip: (document.querySelector('.wx-chip') || {}).innerText || '',
    }));
    check(live.court, 'после вступления не открылась площадка');
    check(/\d{1,2}:\d{2}/.test(live.chip.replace(/\n/g, ' ')), 'в шапке нет времени начала: ' + live.chip);
    if (live.onAir) check(live.cams > 0, 'матч в эфире, но камер на площадке нет');
    console.log('матч:', JSON.stringify(live));
    await page.screenshot({ path: path.join(__dirname, '../.shots/arena-эфир.png'), clip: { x: 0, y: 60, width: 390, height: 400 } });
  }

  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
