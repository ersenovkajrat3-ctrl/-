/* Свой клуб: основание в любом городе и старт с самого низа. */
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
  const shot = (n) => page.screenshot({ path: path.join(__dirname, '../.shots/found-' + n + '.png'), fullPage: true });

  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('text=Создать свой клуб');
  await page.waitForSelector('input[placeholder="Название клуба"]');

  // название и город вписываются свободно
  await page.fill('input[placeholder="Название клуба"]', 'Метеор');
  await page.fill('input[placeholder="Город"]', 'Череповец');
  await page.waitForTimeout(150);
  check((await page.innerText('.card')).includes('Метеор'), 'превью не подхватило название');
  check((await page.innerText('.card')).includes('Череповец'), 'превью не подхватило город');
  check(await page.$('datalist#cityList option'), 'нет подсказок городов');
  const cities = await page.$$eval('datalist#cityList option', (n) => n.length);
  check(cities > 80, 'мало городов в подсказках: ' + cities);

  // форма и эмблема настраиваются
  await page.click('.seg button:has-text("Полосы")');
  await page.waitForTimeout(120);
  await page.click('.seg button:has-text("Ромб")');
  await page.waitForTimeout(120);
  const swatches = await page.$$('.swatch');
  await swatches[3].click();
  await page.waitForTimeout(150);
  check((await page.innerText('.card')).includes('Метеор'), 'настройки формы сбросили название');
  await shot('форма');

  // основать -> переделать -> основать снова: лига не должна терять клубы
  await page.click('button:has-text("Основать клуб")');
  await page.waitForSelector('.modal');
  await page.click('.modal button:has-text("Переделать")');
  await page.waitForSelector('input[placeholder="Название клуба"]');
  await page.fill('input[placeholder="Название клуба"]', 'Метеор');
  await page.fill('input[placeholder="Город"]', 'Череповец');
  await page.click('.seg button:has-text("Полосы")');
  await page.click('.seg button:has-text("Ромб")');
  await page.waitForTimeout(150);

  await page.click('button:has-text("Основать клуб")');
  await page.waitForSelector('.modal');
  const modalText = await page.innerText('.modal');
  check(/снявшийся с соревнований/.test(modalText), 'не сказано, кто освободил место');
  await shot('подтверждение');
  await page.click('.modal button:has-text("Возглавить клуб")');
  await page.waitForSelector('.tabbar');
  await page.waitForTimeout(300);

  const state = await page.evaluate(() => {
    const g = window.SETKA.UI.game;
    const c = g.clubs[g.playerClubId];
    const W = window.SETKA.World;
    const div = g.divisions[c.division];
    const powers = div.clubIds.map((id) => W.clubPower(g, g.clubs[id]));
    return {
      name: c.name, city: c.city, division: c.division, divName: div.name,
      founded: !!c.founded, sponsors: c.finance.sponsors.length, balance: c.finance.balance,
      squad: c.squad.length, arena: W.arenaCapacity(c), members: c.fans.members,
      power: Math.round(W.clubPower(g, c)), weakest: Math.round(Math.min.apply(null, powers)),
      smallestArena: Math.min.apply(null, div.clubIds.map((id) => W.arenaCapacity(g.clubs[id]))),
      fewestMembers: Math.min.apply(null, div.clubIds.map((id) => g.clubs[id].fans.members)),
      clubsInDiv: div.clubIds.length, fixtures: g.fixtures.filter((f) => f.h === c.id || f.a === c.id).length,
      board: g.board.text, pattern: c.identity.pattern, crest: c.identity.crest,
      duplicateNames: Object.values(g.clubs).filter((x) => x.name === c.name).length,
    };
  });
  check(state.name === 'Метеор' && state.city === 'Череповец', 'клуб создан не с теми данными: ' + JSON.stringify(state));
  check(state.division === 3, 'клуб должен стартовать в нижнем дивизионе, а он в ' + state.divName);
  check(state.founded, 'нет отметки об основании');
  check(state.sponsors === 0, 'у нового клуба не должно быть спонсоров');
  check(state.power === state.weakest, 'состав должен быть слабейшим в лиге: ' + state.power + ' против ' + state.weakest);
  check(state.clubsInDiv === 12, 'размер дивизиона изменился: ' + state.clubsInDiv);
  check(state.fixtures === 22, 'клуб не попал в календарь: матчей ' + state.fixtures);
  check(state.members === state.fewestMembers, 'абонементов должно быть меньше всех в лиге: ' + state.members);
  check(state.arena === state.smallestArena, 'зал должен быть самым маленьким в лиге: ' + state.arena);
  check(state.duplicateNames === 1, 'клуб задвоился в мире');
  check(state.pattern === 'stripes' && state.crest === 'diamond', 'форма и эмблема не сохранились: ' + state.pattern + '/' + state.crest);
  console.log('клуб:', JSON.stringify(state));

  // играем несколько недель: календарь, таблица и касса работают
  const clickIf = async (sel) => { if (!(await page.$(sel))) return false; try { await page.click(sel, { timeout: 2500 }); } catch (e) { return false; } await page.waitForTimeout(120); return true; };
  for (let i = 0; i < 12; i++) {
    if (await page.$('.overlay.ceremony')) { await clickIf('.overlay.ceremony button'); continue; }
    if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(120); continue; } }
    if (!(await clickIf('button:has-text("Мгновенно")') || await clickIf('button:has-text("Следующая неделя")') || await clickIf('button:has-text("К неделе")'))) break;
  }
  const after = await page.evaluate(() => {
    const g = window.SETKA.UI.game;
    const c = g.clubs[g.playerClubId];
    const div = g.divisions[c.division];
    return { week: g.week, played: div.table[c.id].p, balance: c.finance.balance, offers: (g.offers.sponsors || []).length, media: Math.round(c.mediaIndex) };
  });
  check(after.played > 0, 'клуб не сыграл ни одного матча');
  check(after.offers > 0, 'новичку не пришло ни одного спонсорского предложения');
  console.log('после ' + after.week + ' недель:', JSON.stringify(after));
  for (let i = 0; i < 6; i++) {
    if (await page.$('.overlay.ceremony')) { await clickIf('.overlay.ceremony button'); continue; }
    if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(150); continue; } }
    break;
  }
  await page.click('.tabbar button:nth-child(1)');
  await page.waitForTimeout(250);
  await shot('клуб');

  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
