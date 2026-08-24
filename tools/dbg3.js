const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => console.log('pageerror:', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await p.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await p.click('text=Начать карьеру'); await p.click('text=Суперлига');
  await p.click('.club-pick .cp'); await p.click('text=Возглавить клуб');
  await p.waitForSelector('.tabbar');
  await p.click('.tabbar button:nth-child(4)');
  await p.click('.tabs .tab:has-text("Заграница")');
  await p.waitForTimeout(300);
  await p.click('.plist .p-row'); await p.waitForTimeout(300);
  console.log('модалка:', (await p.$eval('.modal', e => e.textContent.replace(/\s+/g,' ').slice(0,160))));
  console.log('кнопки:', await p.$$eval('.modal button', els => els.map(e => e.textContent)));
  const sign = await p.$('.modal button:has-text("Подписать")');
  if (sign) await sign.click();
  await p.waitForTimeout(500);
  console.log('тост:', await p.$eval('#toast', e => e.hidden ? '(нет)' : e.textContent).catch(()=>'—'));
  console.log('модалка после:', await p.$eval('.modal', e => e.textContent.replace(/\s+/g,' ').slice(0,80)).catch(()=>'закрыта'));
  console.log('легионеров:', await p.evaluate(() => {
    const S = window.SETKA, g = S.UI.game, c = g.clubs[g.playerClubId];
    return S.Transfers.foreignCount(g, c) + '/' + S.FOREIGN_LIMIT[c.division];
  }));
  await b.close();
})();
