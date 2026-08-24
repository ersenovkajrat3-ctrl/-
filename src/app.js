/* Сетка — запуск приложения: стартовый экран, выбор клуба, итоги сезона, увольнение. */
(function (global) {
  const S = global.SETKA;
  const { U, DIVISIONS } = S;
  const P = S.Players, W = S.World, Ec = S.Economy, Sn = S.Season;
  const UI = S.UI, h = UI.h;

  /* ---------- стартовый экран ---------- */
  function startScreen() {
    document.getElementById('topbar').hidden = true;
    document.getElementById('tabbar').hidden = true;
    const scr = document.getElementById('screen');
    scr.className = 'screen plain';
    scr.innerHTML = '';
    scr.appendChild(h('div', { class: 'hero' },
      h('div', { class: 'logo' }, ballLogo(46)),
      h('h1', { text: 'Сетка' }),
      h('p', { text: 'Менеджер волейбольного клуба: от первенства регионов до еврокубков' })));

    const box = h('div', { class: 'card' });
    if (S.Save.hasSave()) {
      box.appendChild(h('button', {
        class: 'btn primary full', onclick: () => {
          const g = S.Save.load();
          if (!g) { UI.toast('Сохранение повреждено'); return; }
          bootGame(g);
        },
      }, 'Продолжить карьеру'));
      box.appendChild(h('button', { class: 'btn full mt', onclick: () => pickDivision() }, 'Новая карьера'));
    } else {
      box.appendChild(h('button', { class: 'btn primary full', onclick: () => pickDivision() }, 'Начать карьеру'));
    }
    scr.appendChild(box);

    scr.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-title', style: 'margin:0 0 6px', text: 'Что внутри' }),
      ...[
        ['Шесть амплуа и настоящая ротация', 'связующий, диагональный, доигровщики, центральные и либеро, который меняет центрального сзади и не подаёт'],
        ['Матч по фазам', 'подача пробивает приём, приём задаёт пас, атака пробивает блок и защиту — с тайм-аутами, заменами и видеопросмотром'],
        ['Пирамида из четырёх дивизионов', 'плей-офф с квалификацией, Кубок страны и еврокубки CEV как эндгейм'],
        ['Экономика клуба', 'билеты, спонсоры с ребрендингом, арена как капитальные вложения и лимит легионеров'],
      ].map(([t, d]) => h('div', { class: 'mb' },
        h('div', { class: 'small', text: '• ' + t }),
        h('div', { class: 'tiny dim', style: 'padding-left:12px', text: d })))));

    scr.appendChild(h('div', { class: 'tiny dim center', style: 'padding:6px 10px 20px' },
      'Все клубы, лиги, спонсоры и игроки вымышлены. Структура турниров вдохновлена реальной, но это альтернативная реальность, а не симуляция существующих соревнований.'));
  }

  function ballLogo(size) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 48 48');
    s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', '#21160a');
    s.setAttribute('stroke-width', '2.6');
    s.setAttribute('stroke-linecap', 'round');
    s.innerHTML = '<circle cx="24" cy="24" r="18"/><path d="M24 6c-6 6-9 12-9 18s3 12 9 18"/><path d="M6.5 20c8 1.5 15 5 20 11.5"/><path d="M41.5 20c-8 1.5-15 5-20 11.5" opacity=".55"/>';
    return s;
  }

  /* ---------- выбор дивизиона ---------- */
  function pickDivision() {
    const scr = document.getElementById('screen');
    scr.innerHTML = '';
    scr.appendChild(h('div', { class: 'hero', style: 'padding:20px 10px 10px' },
      h('h1', { text: 'С чего начнём', style: 'font-size:26px' }),
      h('p', { text: 'Чем ниже дивизион, тем длиннее путь наверх' })));
    const notes = [
      'Максимальная сложность на старте: сильные соперники, но большой бюджет и еврокубки рядом.',
      'Крепкий второй эшелон: реальный шанс подняться в Суперлигу за пару сезонов.',
      'Полупрофессиональный уровень: маленькие залы, скромные деньги, лимита на легионеров нет.',
      'Любительский старт с нуля — классическая карьера «из низов», как её задумывали.',
    ];
    const box = h('div', { class: 'club-pick' });
    DIVISIONS.forEach((d, i) => {
      box.appendChild(h('button', {
        class: 'cp', onclick: () => pickClub(d.id),
      },
        h('span', { class: 'crest', text: d.short.replace('-', '') }),
        h('span', { class: 'grow' },
          h('div', { style: 'font-weight:700', text: d.name }),
          h('div', { class: 'tiny dim', text: notes[i] }))));
    });
    scr.appendChild(box);
    scr.appendChild(h('button', { class: 'btn ghost full mt', onclick: startScreen }, 'Назад'));
  }

  /* ---------- выбор клуба ---------- */
  let preview = null;
  function pickClub(divId) {
    const scr = document.getElementById('screen');
    scr.innerHTML = '';
    if (!preview) preview = W.createWorld((Date.now() % 1e9) >>> 0);
    const g = preview;
    scr.appendChild(h('div', { class: 'hero', style: 'padding:18px 10px 8px' },
      h('h1', { text: DIVISIONS[divId].name, style: 'font-size:24px' }),
      h('p', { text: 'Выберите клуб — с ним вы начнёте карьеру' })));
    const list = Object.values(g.clubs).filter((c) => c.division === divId)
      .sort((a, b) => b.reputation - a.reputation);
    const box = h('div', { class: 'club-pick' });
    list.forEach((c) => {
      const power = Math.round(W.clubPower(g, c));
      box.appendChild(h('button', {
        class: 'cp', onclick: () => confirmClub(c),
      },
        h('span', { class: 'crest', text: UI.crestLetter(c.name) }),
        h('span', { class: 'grow' },
          h('div', { style: 'font-weight:700' }, c.name, h('span', { class: 'dim', style: 'font-weight:400', text: ' · ' + c.city })),
          h('div', { class: 'tiny dim', text: 'состав ' + power + ' · арена ' + U.num(W.arenaCapacity(c)) + ' мест · бюджет ' + U.money(c.finance.balance) })),
        h('span', { class: 'ovr ' + UI.ovrClass(power), text: power })));
    });
    scr.appendChild(box);
    scr.appendChild(h('button', { class: 'btn ghost full mt', onclick: pickDivision }, 'Назад'));
  }

  function confirmClub(club) {
    const g = preview;
    UI.modal(club.name, (m) => {
      const power = Math.round(W.clubPower(g, club));
      const squad = club.squad.map((id) => g.players[id]).sort((a, b) => P.overall(b) - P.overall(a)).slice(0, 5);
      return [
        h('div', { class: 'small muted mb', text: club.city + ' · ' + DIVISIONS[club.division].name }),
        h('div', { class: 'stat-grid mb' },
          UI.stat(power + '', 'состав'),
          UI.stat(U.num(W.arenaCapacity(club)), 'арена'),
          UI.stat(Math.round(club.mediaIndex) + '', 'медийность')),
        h('div', { class: 'section-title', style: 'margin-left:0', text: 'Лидеры состава' }),
        ...squad.map((p) => UI.playerRow(p, null)),
        h('button', {
          class: 'btn primary full mt', onclick: () => {
            m.close();
            W.assignPlayerClub(g, club.id);
            Sn.startSeason(g);
            preview = null;
            bootGame(g);
            UI.toast('Добро пожаловать в ' + club.name);
          },
        }, 'Возглавить клуб'),
      ];
    });
  }

  /* ---------- запуск партии ---------- */
  function bootGame(g) {
    UI.game = g;
    const saved = S.Save.loadSettings();
    if (saved) g.settings = Object.assign(g.settings || {}, saved);
    S.Audio.setEnabled(g.settings.sound !== false);
    document.getElementById('screen').className = 'screen';
    UI.tab = 'club';
    UI.render();
    S.Save.save(g);
  }

  /* ---------- итоги сезона ---------- */
  UI.seasonReport = function () {
    const g = UI.game;
    if (g.phase !== 'preseason') {
      // досимулировать остаток календаря, если игрок нажал «завершить сезон» раньше
      let guard = 0;
      while (g.phase !== 'offseason' && guard++ < 45) {
        const wk = Sn.startWeek(g);
        if (wk.seasonOver) break;
        let fx, n = 0;
        while ((fx = Sn.nextPlayerFixture(g)) && n++ < 12) Sn.playFixture(g, fx);
        Sn.completeWeek(g);
      }
      Sn.endSeason(g);
    }
    const rep = g.lastReport;
    const club = g.clubs[g.playerClubId];
    S.Save.save(g);
    UI.render();
    UI.modal('Итоги сезона ' + rep.season, (m) => {
      const pl = rep.player;
      const nodes = [
        h('div', { class: 'center mb' },
          h('div', { class: 'big ' + (pl.champion ? 'accent' : pl.relegated ? 'bad' : ''), text: pl.position + '-е место' }),
          h('div', { class: 'small muted', text: DIVISIONS[club.division].name })),
      ];
      if (pl.champion) nodes.push(h('div', { class: 'card tight center good', text: 'Чемпион! Титул забран в плей-офф.' }));
      if (pl.relegated) nodes.push(h('div', { class: 'card tight center bad', text: 'Вылет дивизионом ниже.' }));
      if (pl.euro) nodes.push(h('div', { class: 'card tight center teal', text: 'Клуб получил путёвку в еврокубки CEV.' }));
      if (g.euro && g.euro.result) nodes.push(h('div', { class: 'card tight center small' }, g.euro.name + ': ', h('b', { text: g.euro.result })));
      nodes.push(h('div', { class: 'card' },
        h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Доходы за сезон'), h('b', { class: 'good', text: U.money(club.finance.seasonIncome) })),
        h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Расходы'), h('b', { class: 'bad', text: U.money(club.finance.seasonSpend) })),
        h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Баланс'), h('b', { text: U.money(club.finance.balance) }))));
      const promoted = rep.divisions.map((d) => d.promoted.map((id) => g.clubs[id].name)).flat();
      nodes.push(h('div', { class: 'section-title', style: 'margin-left:0', text: 'Чемпионы дивизионов' }));
      rep.divisions.forEach((d) => {
        nodes.push(h('div', { class: 'row between small', style: 'padding:3px 0' },
          h('span', { class: 'muted', text: d.name }),
          h('b', { text: d.champion ? g.clubs[d.champion].name : '—' })));
      });
      if (rep.dismissed) {
        nodes.push(h('div', { class: 'card tight bad center mt', text: 'Совет директоров расторг контракт с вами.' }));
        nodes.push(h('button', { class: 'btn full danger mt', onclick: () => { m.close(); UI.dismissedScreen(); } }, 'Дальше'));
      } else {
        nodes.push(h('button', {
          class: 'btn primary full mt', onclick: () => {
            m.close();
            Sn.startSeason(g);
            S.Save.save(g);
            UI.go('club');
            UI.toast('Сезон ' + g.seasonLabel + ' начался');
          },
        }, 'Начать сезон ' + Sn.seasonLabel(g.season)));
      }
      return nodes;
    });
  };

  /* ---------- увольнение ---------- */
  UI.dismissedScreen = function () {
    const g = UI.game;
    const reason = g.dismissed && g.dismissed.reason === 'финансы'
      ? 'Клуб четыре месяца подряд не сводил баланс.'
      : 'Задача сезона не выполнена.';
    g.dismissed = null;
    document.getElementById('topbar').hidden = true;
    document.getElementById('tabbar').hidden = true;
    const scr = document.getElementById('screen');
    scr.className = 'screen plain';
    scr.innerHTML = '';
    scr.appendChild(h('div', { class: 'hero' },
      h('h1', { text: 'Вы уволены', style: 'font-size:30px' }),
      h('p', { text: reason })));
    const club = g.clubs[g.playerClubId];
    const options = Object.values(g.clubs)
      .filter((c) => c.division >= Math.min(3, club.division) && !c.isPlayer)
      .sort((a, b) => a.reputation - b.reputation).slice(0, 8);
    scr.appendChild(h('div', { class: 'section-title', text: 'Кто готов вас взять' }));
    const box = h('div', { class: 'club-pick' });
    options.forEach((c) => {
      box.appendChild(h('button', {
        class: 'cp', onclick: () => {
          club.isPlayer = false;
          W.assignPlayerClub(g, c.id);
          g.board = Sn.makeObjective(g, c);
          g.inbox.unshift({ week: 0, kind: 'board', text: 'Новый клуб, новая задача: ' + g.board.text });
          document.getElementById('screen').className = 'screen';
          UI.go('club');
          UI.toast('Вы приняли ' + c.name);
          S.Save.save(g);
        },
      },
        h('span', { class: 'crest', text: UI.crestLetter(c.name) }),
        h('span', { class: 'grow' },
          h('div', { style: 'font-weight:700', text: c.name }),
          h('div', { class: 'tiny dim', text: DIVISIONS[c.division].name + ' · состав ' + Math.round(W.clubPower(g, c)) }))));
    });
    scr.appendChild(box);
    scr.appendChild(h('button', {
      class: 'btn ghost full mt', onclick: () => { S.Save.clear(); location.reload(); },
    }, 'Начать новую карьеру'));
  };

  /* ---------- инициализация ---------- */
  function init() {
    S.Audio.init();
    ['click', 'touchstart'].forEach((e) => window.addEventListener(e, () => S.Audio.resume(), { once: true }));
    startScreen();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* офлайн-режим необязателен */ });
    }
    window.addEventListener('beforeunload', () => { if (UI.game) S.Save.save(UI.game); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
