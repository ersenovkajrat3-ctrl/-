/* Колонка СМИ: газеты и интернет-порталы пишут о клубе, оценки и колонки на месте. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const shot = (n) => page.screenshot({ path: path.join(__dirname, '../.shots/press-' + n + '.png'), fullPage: true });
  const clickIf = async (sel) => { if (!(await page.$(sel))) return false; try { await page.click(sel, { timeout: 2500 }); } catch (e) { return false; } await page.waitForTimeout(120); return true; };
  const check = (cond, msg) => { if (!cond) errors.push('ПРОВЕРКА: ' + msg); };

  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await page.click('text=Начать карьеру');
  await page.click('text=Суперлига');
  await page.click('.club-pick .cp');
  await page.click('text=Возглавить клуб');
  await page.waitForSelector('.tabbar');

  // прокручиваем месяц, чтобы пресса успела написать
  for (let i = 0; i < 14; i++) {
    if (await page.$('.overlay.ceremony')) { await clickIf('.overlay.ceremony button'); continue; }
    if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(120); continue; } }
    if (!(await clickIf('button:has-text("Мгновенно")') || await clickIf('button:has-text("Следующая неделя")') || await clickIf('button:has-text("К неделе")'))) break;
    await page.waitForTimeout(130);
  }
  for (let i = 0; i < 6; i++) {
    if (await page.$('.overlay.ceremony')) { await clickIf('.overlay.ceremony button'); continue; }
    if (await page.$('.modal-back')) { const b = await page.$$('.modal button'); if (b.length) { await b[b.length - 1].click(); await page.waitForTimeout(150); continue; } }
    break;
  }

  await page.click('.tabbar button:nth-child(5)');
  await page.waitForTimeout(250);
  check(await page.$('.post'), 'соцсети пустые');
  await shot('соцсети');

  await page.click('.seg button:has-text("СМИ")');
  await page.waitForTimeout(300);
  const articles = await page.$$('.article');
  check(articles.length > 0, 'нет публикаций в колонке СМИ');
  const kinds = await page.$$eval('.article .kind', (n) => [...new Set(n.map((e) => e.textContent))]);
  check(kinds.includes('газета') && kinds.includes('интернет-портал'), 'нет обоих типов СМИ: ' + kinds.join('/'));
  const marks = await page.$$eval('.article .mark', (n) => n.map((e) => e.textContent));
  check(marks.length > 0, 'нет оценок за матч');
  check(marks.every((m) => +m >= 1 && +m <= 10), 'оценка вне диапазона: ' + marks.join(','));
  const outlets = await page.$$('.outlet-row');
  check(outlets.length >= 5, 'в суперлиге должно писать много изданий, найдено ' + outlets.length);
  check(await page.$('.press-bar i'), 'нет индикатора тона прессы');
  const first = await page.$eval('.article', (e) => e.innerText.replace(/\n/g, ' · ').slice(0, 160));
  console.log('издания:', outlets.length, '| публикаций:', articles.length, '| оценок:', marks.length);
  console.log('первая публикация:', first);
  await shot('сми');

  // назад в соцсети и обратно — вкладки не должны ломаться
  await page.click('.seg button:has-text("Соцсети")');
  await page.waitForTimeout(200);
  check(await page.$('.post'), 'соцсети не вернулись');
  await page.click('.seg button:has-text("СМИ")');
  await page.waitForTimeout(200);
  check(await page.$('.article'), 'СМИ не вернулись');

  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
