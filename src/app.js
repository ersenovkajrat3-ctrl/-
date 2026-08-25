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
    box.appendChild(h('button', { class: 'btn full mt', onclick: () => foundScreen() }, 'Создать свой клуб'));
    box.appendChild(h('div', { class: 'tiny dim center mt-xs', text: 'Свой клуб заявляют в первенство регионов — путь наверх с самого низа' }));
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
        UI.crest(c, 40),
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
        h('div', { class: 'row mb', style: 'gap:12px' },
          UI.crest(club, 56),
          h('div', null,
            h('div', { class: 'small muted', text: club.city + ' · ' + DIVISIONS[club.division].name }),
            h('div', { class: 'tiny dim', text: 'форма: ' + S.Identity.of(club).palette }))),
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

  /* ---------- свой клуб ---------- */
  /* Клуб можно не выбрать из готовых, а основать: название, город, форма и эмблема —
     всё своё. Заявка идёт в нижний дивизион: слабейший состав лиги, самый маленький зал,
     ни одного спонсора и стартовый взнос учредителя на три месяца зарплат. */
  function foundScreen() {
    const I = S.Identity;
    // в этом мире клуб уже основывали: пересобираем, иначе второе основание съест ещё один клуб
    if (preview && preview.founding) preview = null;
    if (!preview) preview = W.createWorld((Date.now() % 1e9) >>> 0);
    const g = preview;
    const rng = g._rng;
    const draft = UI.foundDraft || (UI.foundDraft = {
      name: rng.pick(S.CLUB_NAME_IDEAS),
      city: rng.pick(S.CITIES),
      identity: null,
    });
    if (!draft.identity) {
      const pal = rng.pick(I.PALETTE);
      draft.identity = I.build({ baseName: draft.name }, pal, rng.pick(I.PATTERNS), rng.pick(I.CRESTS));
    }

    const scr = document.getElementById('screen');
    scr.className = 'screen plain';
    scr.innerHTML = '';
    scr.appendChild(h('div', { class: 'hero', style: 'padding:18px 10px 6px' },
      h('h1', { text: 'Свой клуб', style: 'font-size:26px' }),
      h('p', { text: 'Название, город и форма — ваши. Лига — самая нижняя' })));

    const preview3 = h('div', { class: 'row center', style: 'gap:14px;justify-content:center;padding:4px 0 10px' });
    const title = h('div', { class: 'center' });
    const redraw = () => {
      draft.identity.monogram = I.monogram(draft.name);
      const stub = { baseName: draft.name, name: draft.name, city: draft.city, identity: draft.identity };
      preview3.innerHTML = '';
      preview3.appendChild(S.Crest.crestNode(stub, 76));
      preview3.appendChild(S.Crest.shirtSvg({ shirt: draft.identity.primary, trim: draft.identity.secondary, pattern: draft.identity.pattern }, 76));
      title.innerHTML = '';
      title.appendChild(h('div', { style: 'font-weight:800;font-size:18px', text: draft.name }));
      title.appendChild(h('div', { class: 'tiny dim', text: draft.city + ' · ' + DIVISIONS[DIVISIONS.length - 1].name }));
    };

    const nameInput = h('input', {
      class: 'btn full', style: 'text-align:left', maxlength: 24, value: draft.name,
      placeholder: 'Название клуба',
      oninput: (e) => { draft.name = e.target.value; redraw(); },
    });
    const cityInput = h('input', {
      class: 'btn full', style: 'text-align:left', maxlength: 24, value: draft.city,
      placeholder: 'Город', list: 'cityList',
      oninput: (e) => { draft.city = e.target.value; redraw(); },
    });
    const datalist = h('datalist', { id: 'cityList' });
    S.CITIES.forEach((c) => datalist.appendChild(h('option', { value: c })));

    const dice = h('button', {
      class: 'btn', onclick: () => {
        draft.name = rng.pick(S.CLUB_NAME_IDEAS);
        draft.city = rng.pick(S.CITIES);
        nameInput.value = draft.name;
        cityInput.value = draft.city;
        redraw();
      },
    }, 'Наугад');

    const colorRow = h('div', { class: 'row wrap', style: 'gap:8px' });
    I.PALETTE.forEach((pal) => {
      colorRow.appendChild(h('button', {
        class: 'swatch' + (draft.identity.primary === pal.primary ? ' on' : ''),
        style: 'background:' + pal.primary, title: pal.name,
        onclick: () => {
          draft.identity.primary = pal.primary;
          draft.identity.secondary = pal.trim;
          draft.identity.palette = pal.name;
          draft.identity.ink = I.inkOn(pal.primary);
          foundScreen();
        },
      }));
    });
    const patternNames = { solid: 'Сплошная', stripes: 'Полосы', sash: 'Диагональ', hoop: 'Обруч', split: 'Пополам' };
    const patternRow = h('div', { class: 'seg' });
    I.PATTERNS.forEach((p) => patternRow.appendChild(h('button', {
      class: draft.identity.pattern === p ? 'on' : '',
      onclick: () => { draft.identity.pattern = p; foundScreen(); },
    }, patternNames[p])));
    const crestNames = { shield: 'Щит', circle: 'Круг', diamond: 'Ромб', hex: 'Шестигр.' };
    const crestRow = h('div', { class: 'seg' });
    I.CRESTS.forEach((cr) => crestRow.appendChild(h('button', {
      class: draft.identity.crest === cr ? 'on' : '',
      onclick: () => { draft.identity.crest = cr; foundScreen(); },
    }, crestNames[cr])));

    redraw();
    const card = h('div', { class: 'card' },
      preview3, title,
      h('div', { class: 'section-title', style: 'margin-left:0', text: 'Название и город' }),
      nameInput,
      h('div', { class: 'row mt', style: 'gap:8px' }, h('span', { class: 'grow' }, cityInput), dice),
      datalist,
      h('div', { class: 'section-title', style: 'margin-left:0', text: 'Цвет' }), colorRow,
      h('div', { class: 'section-title', style: 'margin-left:0', text: 'Рисунок майки' }), patternRow,
      h('div', { class: 'section-title', style: 'margin-left:0', text: 'Эмблема' }), crestRow);
    scr.appendChild(card);

    const sameCity = Object.values(g.clubs).filter((c) => c.city === draft.city.trim());
    scr.appendChild(h('div', { class: 'card tight tiny muted' },
      'Клуб заявят в ' + DIVISIONS[DIVISIONS.length - 1].name.toLowerCase() + ': состав слабее всех в лиге, зал на ' + W.FOUND_CAPACITY + ' мест, '
      + 'ни одного спонсора и пустые трибуны. Всё остальное придётся заработать.'
      + (sameCity.length ? ' В этом городе уже играет ' + sameCity.map((c) => c.name).join(', ') + ' — будет городское дерби.' : '')));

    scr.appendChild(h('button', {
      class: 'btn primary full mt', onclick: () => {
        const nm = draft.name.trim(), ct = draft.city.trim();
        if (nm.length < 2) { UI.toast('Придумайте название клуба'); return; }
        if (ct.length < 2) { UI.toast('Укажите город'); return; }
        confirmFound(nm, ct, draft.identity);
      },
    }, 'Основать клуб'));
    scr.appendChild(h('button', { class: 'btn ghost full mt', onclick: startScreen }, 'Назад'));
  }

  function confirmFound(name, city, identity) {
    const g = preview;
    const res = W.foundClub(g, { name, city, identity: Object.assign({}, identity) });
    const club = res.club;
    g.founding = true;   // мир уже изменён: назад к чистому листу только пересборкой
    UI.modal(club.name, (m) => {
      const power = Math.round(W.clubPower(g, club));
      const squad = club.squad.map((id) => g.players[id]).sort((a, b) => P.overall(b) - P.overall(a)).slice(0, 5);
      return [
        h('div', { class: 'row mb', style: 'gap:12px' },
          UI.crest(club, 56),
          h('div', null,
            h('div', { class: 'small muted', text: club.city + ' · ' + DIVISIONS[club.division].name }),
            h('div', { class: 'tiny dim', text: 'клуб основан в сезоне ' + club.foundedSeason }))),
        h('div', { class: 'stat-grid mb' },
          UI.stat(power + '', 'состав'),
          UI.stat(U.num(W.arenaCapacity(club)), 'арена'),
          UI.stat(U.money(club.finance.balance), 'касса')),
        h('div', { class: 'card tight tiny muted' },
          'Место в лиге освобождает ' + res.leaving.name + ' (' + res.leaving.city + '), снявшийся с соревнований. '
          + 'Спонсоров нет — первые предложения придут, когда о клубе начнут писать.'),
        h('div', { class: 'section-title', style: 'margin-left:0', text: 'Кого удалось собрать' }),
        ...squad.map((p) => UI.playerRow(p, null)),
        h('button', {
          class: 'btn primary full mt', onclick: () => {
            m.close();
            delete g.founding;
            W.assignPlayerClub(g, club.id);
            Sn.startSeason(g);
            preview = null;
            UI.foundDraft = null;
            bootGame(g);
            UI.toast(club.name + ' заявлен в ' + DIVISIONS[club.division].name.toLowerCase());
          },
        }, 'Возглавить клуб'),
        h('button', {
          class: 'btn ghost full mt', onclick: () => {
            // мир уже изменён — пересобираем его заново, чтобы вернуться к чистому листу
            m.close();
            preview = null;
            foundScreen();
          },
        }, 'Переделать'),
      ];
    });
  }

  /* ---------- запуск партии ---------- */
  function bootGame(g) {
    UI.game = g;
    const saved = S.Save.loadSettings();
    if (saved) g.settings = Object.assign(g.settings || {}, saved);
    S.Audio.setEnabled(g.settings.sound !== false);
    UI.applyTheme();
    document.getElementById('screen').className = 'screen';
    UI.tab = 'club';
    UI.render();
    S.Save.save(g);
  }

  /* ---------- итоги сезона ---------- */
  UI.seasonReportModal = function (rep) {
    const g = UI.game;
    g.lastReport = rep;
    UI.seasonReport(true);
  };

  UI.seasonReport = function (again) {
    const g = UI.game;
    if (!again && g.phase !== 'preseason') {
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
    if (!again && S.Ceremony.drain(g, () => UI.seasonReport(true))) return;
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
      if (rep.board) {
        nodes.push(h('div', { class: 'card tight' + (rep.board.met ? ' good' : rep.board.failed ? ' bad' : '') },
          h('div', { class: 'small', text: rep.board.text }),
          h('div', { class: 'tiny dim', text: 'Доверие совета: ' + rep.board.trust + ' из 100' })));
      }
      if (rep.fans) {
        nodes.push(h('div', { class: 'card tight' },
          h('div', { class: 'tiny dim', text: 'ТРИБУНЫ' }),
          h('div', { class: 'small', text: S.Fans.moodLabel(rep.fans.mood) + ' · ' + U.num(rep.fans.members) + ' ' + U.plural(rep.fans.members, ['абонемент', 'абонемента', 'абонементов']) }),
          ...rep.fans.demands.map((d) => h('div', { class: 'tiny ' + (d.done ? 'good' : 'dim'), text: (d.done ? '✓ ' : '· ') + d.text }))));
      }
      if (rep.awards && rep.awards.mvp) {
        nodes.push(h('button', {
          class: 'btn full mt', onclick: () => {
            m.close();
            S.Ceremony.show(g, {
              type: 'awards', title: 'Награды сезона', subtitle: rep.awards.division,
              clubId: club.id, awards: rep.awards, season: rep.season,
            }, () => UI.seasonReportModal(rep));
          },
        }, 'Церемония награждения'));
      }
      nodes.push(h('button', {
        class: 'btn primary full mt', onclick: () => {
          m.close();
          Sn.startSeason(g);
          S.Save.save(g);
          UI.go('club');
          UI.toast('Сезон ' + g.seasonLabel + ' начался');
        },
      }, 'Начать сезон ' + Sn.seasonLabel(g.season)));
      return nodes;
    });
  };

  /* ---------- смена клуба по своей воле ---------- */
  /* Уволить тренера в «Сетке» нельзя: совет может быть недоволен, но карьера продолжается.
     Сменить клуб можно только самому — из настроек. */
  UI.changeClubScreen = function () {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    document.getElementById('topbar').hidden = true;
    document.getElementById('tabbar').hidden = true;
    const scr = document.getElementById('screen');
    scr.className = 'screen plain';
    scr.innerHTML = '';
    scr.appendChild(h('div', { class: 'hero', style: 'padding:26px 12px 10px' },
      h('h1', { text: 'Новый клуб', style: 'font-size:28px' }),
      h('p', { text: 'Карьера продолжается: вы уходите из «' + club.baseName + '» и принимаете другую команду. Трофеи и стаж остаются с вами.' })));

    const list = Object.values(g.clubs).filter((c) => !c.isPlayer)
      .sort((a, b) => a.division - b.division || b.reputation - a.reputation);
    const box = h('div', { class: 'club-pick' });
    list.forEach((c) => {
      box.appendChild(h('button', {
        class: 'cp', onclick: () => {
          UI.confirm('Принять ' + c.name + '?', 'Вы покидаете «' + club.baseName + '». Сезон начнётся заново с новым клубом.', () => {
            club.isPlayer = false;
            W.assignPlayerClub(g, c.id);
            g.career = g.career || { clubs: [] };
            g.career.clubs.push({ club: club.name, seasons: club.history.length, trophies: club.trophies.length });
            g.board = Sn.makeObjective(g, c);
            g.board.trust = 60;
            Sn.startSeason(g);
            document.getElementById('screen').className = 'screen';
            UI.go('club');
            UI.toast('Вы приняли ' + c.name);
            S.Save.save(g);
          }, 'Принять клуб');
        },
      },
        UI.crest(c, 40),
        h('span', { class: 'grow' },
          h('div', { style: 'font-weight:700', text: c.name }),
          h('div', { class: 'tiny dim', text: DIVISIONS[c.division].name + ' · состав ' + Math.round(W.clubPower(g, c)) + ' · трибуны ' + Math.round(c.fans.mood) }))));
    });
    scr.appendChild(box);
    scr.appendChild(h('button', {
      class: 'btn ghost full mt', onclick: () => { document.getElementById('screen').className = 'screen'; UI.go('settings'); },
    }, 'Остаться в клубе'));
  };

  /* ---------- инициализация ---------- */
  function init() {
    // тема применяется до первого экрана, чтобы не мигнуть чужим фоном
    const saved = S.Save.loadSettings();
    if (saved && saved.theme && saved.theme !== 'system') document.documentElement.dataset.theme = saved.theme;
    S.Audio.init();
    ['click', 'touchstart'].forEach((e) => window.addEventListener(e, () => S.Audio.resume(), { once: true }));
    startScreen();
    // в нативной обёртке файлы и так локальные — сервис-воркер там не нужен
    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !global.SETKA_NATIVE) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* офлайн-режим необязателен */ });
    }
    window.addEventListener('beforeunload', () => { if (UI.game) S.Save.save(UI.game); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
