/* Сетка — экраны: матчи и таблицы, рынок, лента «Подача», арена, спонсоры, финансы,
   а также ход недели и итоги сезона. */
(function (global) {
  const S = global.SETKA;
  const { U, DIVISIONS, ARENA_UPGRADES, EURO_CUPS, TONES, FOREIGN_LIMIT, ROLES } = S;
  const P = S.Players, W = S.World, Ec = S.Economy, Sn = S.Season, Tr = S.Transfers;
  const UI = S.UI, h = UI.h;

  /* ================= МАТЧИ ================= */
  UI.screenMatches = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const sub = UI.sub.matches || 'cal';
    const tabs = [['cal', 'Календарь'], ['table', 'Таблица'], ['po', 'Плей-офф'], ['cup', 'Кубок']];
    if (g.euro) tabs.push(['euro', g.euro.short]);
    scr.appendChild(h('div', { class: 'tabs' },
      ...tabs.map(([id, label]) => h('button', {
        class: 'tab' + (sub === id ? ' on' : ''), onclick: () => UI.go('matches', id),
      }, label))));
    ({ cal: tabCalendar, table: tabTable, po: tabPlayoff, cup: tabCup, euro: tabEuro }[sub] || tabCalendar)(scr, club);
  };

  function fixtureRow(g, fx, club) {
    const isHome = fx.h === club.id;
    const oppId = isHome ? fx.a : fx.h;
    const opp = Sn.team(g, oppId);
    const res = fx.result;
    const won = res && (isHome ? res.score[0] > res.score[1] : res.score[1] > res.score[0]);
    return h('button', {
      class: 'p-row', style: 'width:100%;text-align:left',
      onclick: () => res ? UI.matchReport(fx) : UI.go('club'),
    },
      h('span', { style: 'flex:0 0 34px' },
        h('div', { class: 'tiny dim center', text: 'н.' + fx.week }),
        h('div', { class: 'tiny center', text: isHome ? 'дома' : 'гости' })),
      h('span', { class: 'grow' },
        h('div', { class: 'p-name ellipsis', text: opp ? opp.name : '—' }),
        h('div', { class: 'p-meta', text: UI.compLabel(fx) + (fx.cancelled ? ' · не понадобился' : '') })),
      res
        ? h('span', { class: 'pill ' + (won ? 'good' : 'bad'), text: (isHome ? res.score : [res.score[1], res.score[0]]).join(':') })
        : h('span', { class: 'pill', text: '—' }));
  }

  function tabCalendar(scr, club) {
    const g = UI.game;
    const list = g.fixtures
      .filter((f) => (f.h === club.id || f.a === club.id) && !(f.cancelled && !f.result))
      .sort((a, b) => a.week - b.week || (a.gameNo || 0) - (b.gameNo || 0));
    if (!list.length) { scr.appendChild(h('div', { class: 'empty', text: 'Календарь появится в начале сезона.' })); return; }
    const box = h('div', { class: 'plist' });
    list.forEach((fx) => box.appendChild(fixtureRow(g, fx, club)));
    scr.appendChild(box);
  }

  function tabTable(scr, club) {
    const g = UI.game;
    let divId = UI.sub.tableDiv != null ? UI.sub.tableDiv : club.division;
    scr.appendChild(h('div', { class: 'tabs' },
      ...DIVISIONS.map((d) => h('button', {
        class: 'tab' + (divId === d.id ? ' on' : ''),
        onclick: () => { UI.sub.tableDiv = d.id; UI.render(); },
      }, d.short))));
    const div = g.divisions[divId];
    const order = W.sortTable(div);
    const size = order.length;
    const meta = DIVISIONS[divId];
    const table = h('table', { class: 'tbl' },
      h('thead', null, h('tr', null,
        h('th', { text: '#' }), h('th', { text: 'Клуб' }), h('th', { text: 'И' }),
        h('th', { text: 'В' }), h('th', { text: 'П' }), h('th', { text: 'Сеты' }), h('th', { text: 'О' }))));
    const body = h('tbody');
    order.forEach((id, i) => {
      const r = div.table[id];
      const c = g.clubs[id];
      const cls = [];
      if (id === club.id) cls.push('me');
      const poCut = divId === 0 ? 12 : 8;
      if (i < (divId === 0 ? 0 : meta.promote)) cls.push('pro');
      else if (i < poCut) cls.push('po');
      if (i >= size - meta.relegate && meta.relegate) cls.push('rel');
      body.appendChild(h('tr', { class: cls.join(' ') },
        h('td', { text: i + 1 }),
        h('td', { class: 'name', text: c.name }),
        h('td', { text: r.p }), h('td', { text: r.w }), h('td', { text: r.l }),
        h('td', { text: r.setsW + ':' + r.setsL }),
        h('td', null, h('b', { text: r.pts }))));
    });
    table.appendChild(body);
    scr.appendChild(h('div', { class: 'card table-wrap' }, table));
    scr.appendChild(h('div', { class: 'card tight tiny muted' },
      divId === 0 ? 'В плей-офф выходят 12 клубов: места 1–4 сразу в 1/4 финала, места 5–12 играют квалификацию.'
        : 'В плей-офф выходят 8 клубов. Победитель и финалист поднимаются дивизионом выше.',
      meta.relegate ? ' Два последних места — вылет.' : ''));
  }

  function seriesCard(g, s, club) {
    const nameA = Sn.teamName(g, s.a), nameB = Sn.teamName(g, s.b);
    const mine = s.a === club.id || s.b === club.id;
    return h('div', { class: 'card tight' + (mine ? ' next-match' : '') },
      h('div', { class: 'row between' },
        h('span', { class: 'small ellipsis grow', text: nameA }),
        h('b', { class: s.winner === s.a ? 'good' : '', text: s.wins[0] })),
      h('div', { class: 'row between' },
        h('span', { class: 'small ellipsis grow', text: nameB }),
        h('b', { class: s.winner === s.b ? 'good' : '', text: s.wins[1] })),
      h('div', { class: 'tiny dim', text: 'до ' + s.toWin + ' побед' + (s.log.length ? ' · ' + s.log.map((x) => x.score.join(':')).join(', ') : '') }));
  }

  function tabPlayoff(scr, club) {
    const g = UI.game;
    if (!g.playoffs) {
      scr.appendChild(h('div', { class: 'empty', text: 'Плей-офф начнётся после регулярного чемпионата (неделя ' + W.PLAYOFF_START + ').' }));
      return;
    }
    const st = g.playoffs.byDiv[club.division];
    scr.appendChild(h('div', { class: 'section-title', text: DIVISIONS[club.division].name + ' · ' + stageName(st.stage) }));
    st.series.forEach((s) => scr.appendChild(seriesCard(g, s, club)));
    if (st.champion) {
      scr.appendChild(h('div', { class: 'card center' },
        h('div', { class: 'tiny dim', text: 'ЧЕМПИОН' }),
        h('div', { class: 'big accent', text: g.clubs[st.champion].name })));
    }
  }
  function stageName(k) {
    return { qual: 'Квалификация', qf: '1/4 финала', sf: '1/2 финала', final: 'Финал', done: 'Завершён' }[k] || '';
  }

  function tabCup(scr, club) {
    const g = UI.game;
    const cup = g.cup;
    if (!cup) { scr.appendChild(h('div', { class: 'empty', text: 'Кубок стартует по ходу сезона.' })); return; }
    scr.appendChild(h('div', { class: 'card tight' },
      h('b', { text: cup.name }),
      h('div', { class: 'small muted', text: cup.winner ? 'Обладатель: ' + g.clubs[cup.winner].name : 'В розыгрыше: ' + cup.alive.length + ' ' + U.plural(cup.alive.length, ['клуб', 'клуба', 'клубов']) })));
    Sn.CUP_ROUNDS.forEach((r) => {
      const fixtures = g.fixtures.filter((f) => f.type === 'cup' && f.stageKey === r.key);
      if (!fixtures.length) return;
      scr.appendChild(h('div', { class: 'section-title', text: r.name + ' · неделя ' + r.week }));
      fixtures.slice(0, 16).forEach((f) => {
        const mine = f.h === club.id || f.a === club.id;
        scr.appendChild(h('div', { class: 'card tight row between' + (mine ? ' next-match' : '') },
          h('span', { class: 'small ellipsis grow', text: Sn.teamName(g, f.h) + ' — ' + Sn.teamName(g, f.a) }),
          h('span', { class: 'pill', text: f.result ? f.result.score.join(':') : '—' })));
      });
    });
  }

  function tabEuro(scr, club) {
    const g = UI.game;
    const eu = g.euro;
    if (!eu) { scr.appendChild(h('div', { class: 'empty', text: 'В этом сезоне клуб не играет в еврокубках.' })); return; }
    const cup = EURO_CUPS.find((c) => c.id === eu.cupId);
    scr.appendChild(h('div', { class: 'card tight' },
      h('b', { text: cup.name }),
      h('div', { class: 'small muted', text: eu.result ? 'Итог: ' + eu.result : 'Стадия: ' + (eu.stage === 'group' ? 'групповой этап' : stageName(eu.stage)) })));
    const table = h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', { text: '#' }), h('th', { text: 'Клуб' }), h('th', { text: 'И' }), h('th', { text: 'В' }), h('th', { text: 'Сеты' }), h('th', { text: 'О' }))));
    const body = h('tbody');
    Sn.euroStandings(g).forEach((id, i) => {
      const r = eu.table[id];
      const t = Sn.team(g, id);
      body.appendChild(h('tr', { class: id === club.id ? 'me' : '' },
        h('td', { text: i + 1 }),
        h('td', { class: 'name', text: t.name + (t.code ? ' · ' + t.code : '') }),
        h('td', { text: r.p }), h('td', { text: r.w }),
        h('td', { text: r.setsW + ':' + r.setsL }), h('td', null, h('b', { text: r.pts }))));
    });
    table.appendChild(body);
    scr.appendChild(h('div', { class: 'card table-wrap' }, table));
    const fixtures = g.fixtures.filter((f) => f.type === 'euro' && (f.h === club.id || f.a === club.id));
    const box = h('div', { class: 'plist' });
    fixtures.forEach((f) => box.appendChild(fixtureRow(g, f, club)));
    scr.appendChild(box);
    scr.appendChild(h('div', { class: 'card tight tiny muted' },
      'Лицензия CEV: арена от ' + U.num(cup.minCapacity) + ' мест' + (cup.needMedia ? ' и медиа-инфраструктура 2-го уровня' : '') + '.'));
  }

  /* отчёт о матче */
  UI.matchReport = function (fx) {
    const g = UI.game;
    const res = fx.result;
    if (!res) return;
    UI.modal(Sn.teamName(g, fx.h) + ' — ' + Sn.teamName(g, fx.a), () => {
      const nodes = [
        h('div', { class: 'center mb' },
          h('div', { class: 'big', text: res.score.join(' : ') }),
          h('div', { class: 'small muted', text: (res.setScores || []).map((s) => s.join(':')).join('  ·  ') })),
      ];
      if (res.stats) {
        const st = res.stats;
        nodes.push(h('div', { class: 'card flat tight' },
          statLine('Атака', st.h.kills + '/' + st.h.attacks, st.a.kills + '/' + st.a.attacks),
          statLine('Блок', st.h.blocks, st.a.blocks),
          statLine('Эйсы', st.h.aces, st.a.aces),
          statLine('Ошибки подачи', st.h.serveErrors, st.a.serveErrors),
          statLine('Ошибки атаки', st.h.attackErrors, st.a.attackErrors),
          statLine('Защита', st.h.digs, st.a.digs)));
      }
      if (res.mvp) nodes.push(h('div', { class: 'card tight center small' }, 'Лучший игрок: ', h('b', { text: res.mvp.name }), ' · ' + res.mvp.points + ' очк.'));
      if (fx.attendance) nodes.push(h('div', { class: 'tiny dim center', text: 'Зрителей: ' + U.num(fx.attendance.count) + ' (' + Math.round(fx.attendance.fill * 100) + '% зала)' }));
      return nodes;
    });
  };
  function statLine(label, a, b) {
    return h('div', { class: 'row between small', style: 'padding:3px 0' },
      h('b', { style: 'flex:0 0 60px', text: a }),
      h('span', { class: 'muted center grow', text: label }),
      h('b', { style: 'flex:0 0 60px;text-align:right', text: b }));
  }

  /* ================= РЫНОК ================= */
  UI.screenMarket = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const sub = UI.sub.market || 'buy';
    scr.appendChild(h('div', { class: 'tabs' },
      ...[['buy', 'Купить'], ['sell', 'Продать']].map(([id, label]) =>
        h('button', { class: 'tab' + (sub === id ? ' on' : ''), onclick: () => UI.go('market', id) }, label))));

    const open = g.window && g.window.open;
    scr.appendChild(h('div', { class: 'card tight row between' },
      h('div', { class: 'small' },
        h('b', { text: open ? 'Трансферное окно открыто' : 'Окно закрыто' }),
        h('div', { class: 'tiny dim', text: open ? 'Летнее окно закрывается перед стартом сезона, зимнее — на 22-й неделе.' : 'Следующее окно — в межсезонье.' })),
      h('span', { class: 'pill' + (Tr.foreignCount(g, club) >= FOREIGN_LIMIT[club.division] ? ' bad' : '') , text: 'легионеры ' + Tr.foreignCount(g, club) + '/' + FOREIGN_LIMIT[club.division] })));

    if (sub === 'buy') marketBuy(scr, club, open);
    else marketSell(scr, club, open);
  };

  function marketBuy(scr, club, open) {
    const g = UI.game;
    const filter = UI.sub.marketRole || 'all';
    scr.appendChild(h('div', { class: 'tabs' },
      ...[['all', 'Все'], ['S', 'СВ'], ['OP', 'ДИ'], ['OH', 'ДГ'], ['MB', 'ЦБ'], ['L', 'ЛБ']].map(([id, label]) =>
        h('button', {
          class: 'tab' + (filter === id ? ' on' : ''),
          onclick: () => { UI.sub.marketRole = id; UI.render(); },
        }, label))));
    let list = (g.market || []).map((m) => ({ m, p: g.players[m.playerId] })).filter((x) => x.p);
    if (filter !== 'all') list = list.filter((x) => x.p.role === filter);
    // сначала те, кого клуб реально может уговорить и потянуть по деньгам
    const pull = club.reputation + (3 - club.division) * 8 + club.mediaIndex * 0.2;
    list.forEach((x) => {
      x.reach = P.overall(x.p) <= pull * 0.95 + 12;
      x.afford = x.m.ask <= club.finance.balance;
    });
    list.sort((a, b) => (b.reach - a.reach) || (b.afford - a.afford) || (P.overall(b.p) - P.overall(a.p)));
    if (!list.length) { scr.appendChild(h('div', { class: 'empty', text: 'Свободных предложений нет.' })); return; }
    const box = h('div', { class: 'plist' });
    list.slice(0, 40).forEach(({ m, p, reach, afford }) => {
      box.appendChild(h('button', {
        class: 'p-row' + (reach ? '' : ' injured'), style: 'width:100%;text-align:left',
        onclick: () => buyModal(club, p, m, open),
      },
        h('span', { class: 'role-badge role-' + p.role, text: ROLES[p.role].short }),
        h('span', { class: 'grow' },
          h('div', { class: 'p-name', text: P.fullName(p) }),
          h('div', { class: 'p-meta', text: UI.playerMeta(p) + (m.clubId ? ' · ' + g.clubs[m.clubId].name : ' · свободный агент') })),
        h('span', { style: 'text-align:right' },
          h('div', { class: 'small' + (afford ? '' : ' bad'), text: m.ask ? U.money(m.ask) : 'свободен' }),
          h('div', { class: 'tiny dim', text: U.money(Tr.wageDemand(g, p, club.division)) + '/мес' }),
          reach ? null : h('div', { class: 'tiny dim', text: 'не по уровню клуба' })),
        h('span', { class: 'ovr ' + UI.ovrClass(P.overall(p)), text: P.overall(p) })));
    });
    scr.appendChild(box);
  }

  function buyModal(club, p, entry, open) {
    const g = UI.game;
    UI.playerCard(p, {
      actions: (m) => {
        const wage = Tr.wageDemand(g, p, club.division);
        const box = h('div', { class: 'mt' },
          h('div', { class: 'card flat tight' },
            h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Цена'), h('b', entry.ask ? U.money(entry.ask) : 'свободный агент')),
            h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Требует зарплату'), h('b', U.money(wage) + '/мес')),
            h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Ваш баланс'), h('b', U.money(club.finance.balance)))));
        const actions = h('div', { class: 'btn-row mt' },
          entry.ask ? h('button', {
            class: 'btn', onclick: () => {
              const r = Tr.haggle(g, club.id, p.id);
              UI.toast(r.ok ? 'Сбили цену на ' + r.cut + '%: ' + U.money(r.ask) : r.reason);
              m.close(); UI.render();
            },
          }, 'Торговаться') : null,
          h('button', {
            class: 'btn primary', onclick: () => {
              const r = Tr.buy(g, club.id, p.id);
              UI.toast(r.ok ? P.fullName(p) + ' подписан' : r.reason);
              if (r.ok && S.Audio) S.Audio.stinger('sign');
              m.close(); UI.render();
            },
          }, 'Подписать'));
        if (!open) return h('div', { class: 'mt small bad center', text: 'Трансферное окно закрыто.' });
        box.appendChild(actions);
        return box;
      },
    });
  }

  function marketSell(scr, club, open) {
    const g = UI.game;
    const squad = club.squad.map((id) => g.players[id]).filter(Boolean).sort((a, b) => P.valueFor(b) - P.valueFor(a));
    const box = h('div', { class: 'plist' });
    squad.forEach((p) => {
      box.appendChild(h('button', {
        class: 'p-row', style: 'width:100%;text-align:left',
        onclick: () => open ? UI.sellModal(p) : UI.playerCard(p),
      },
        h('span', { class: 'role-badge role-' + p.role, text: ROLES[p.role].short }),
        h('span', { class: 'grow' },
          h('div', { class: 'p-name', text: P.fullName(p) }),
          h('div', { class: 'p-meta', text: UI.playerMeta(p) })),
        h('span', { class: 'small', text: U.money(P.valueFor(p)) }),
        h('span', { class: 'ovr ' + UI.ovrClass(P.overall(p)), text: P.overall(p) })));
    });
    scr.appendChild(box);
  }

  UI.sellModal = function (p) {
    const g = UI.game;
    const offers = Tr.offersFor(g, p.id);
    UI.modal('Продать: ' + P.fullName(p), (m) => {
      if (!g.window || !g.window.open) return [h('div', { class: 'small bad', text: 'Трансферное окно закрыто.' })];
      if (!offers.length) return [h('div', { class: 'small muted', text: 'Предложений по игроку нет.' })];
      return [
        h('div', { class: 'small muted mb', text: 'Оценка стоимости: ' + U.money(P.valueFor(p)) }),
        ...offers.map((o) => h('button', {
          class: 'p-row', style: 'width:100%;margin-bottom:6px;text-align:left',
          onclick: () => {
            const r = Tr.sell(g, p.id, o);
            UI.toast(r.ok ? 'Продан за ' + U.money(r.fee) : r.reason);
            m.close(); UI.render();
          },
        },
          h('span', { class: 'grow small', text: o.name }),
          h('b', { text: U.money(o.fee) }))),
      ];
    });
  };

  /* ================= ЛЕНТА ================= */
  UI.screenFeed = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    scr.appendChild(h('div', { class: 'card tight' },
      h('div', { class: 'row between mb' },
        h('div', null, h('b', { text: 'Подача' }), h('div', { class: 'tiny dim', text: 'лента клубов, болельщиков и инсайдеров' })),
        h('span', { class: 'pill accent', text: 'медийность ' + Math.round(club.mediaIndex) })),
      h('div', { class: 'seg' }, ...TONES.map((t) => h('button', {
        class: g.settings.tone === t.id ? 'on' : '',
        onclick: () => { g.settings.tone = t.id; club.tone = t.id; UI.render(); },
      }, t.name))),
      h('div', { class: 'tiny dim mt', text: (TONES.find((t) => t.id === g.settings.tone) || TONES[0]).desc })));

    scr.appendChild(h('div', { class: 'card tight tiny muted' },
      'Индекс медийности решает, какие спонсоры выйдут на связь: титульный контракт предлагают только заметным клубам.'));

    if (!g.feed.length) { scr.appendChild(h('div', { class: 'empty', text: 'Лента пока пуста — сыграйте матч.' })); return; }
    const box = h('div', { class: 'card', style: 'padding:0' });
    g.feed.slice(0, 60).forEach((post) => {
      box.appendChild(h('div', { class: 'post' },
        h('div', { class: 'ava ' + (post.author === 'club' ? 'official' : post.author), text: post.avatar }),
        h('div', { class: 'grow' },
          h('div', { class: 'hd' }, h('b', { text: post.label }), h('span', { class: 'dim', text: ' ' + post.handle })),
          h('div', { class: 'txt', text: post.text }),
          h('div', { class: 'react' },
            h('span', { text: '♡ ' + U.num(post.likes) }),
            h('span', { text: '↻ ' + U.num(post.reposts) }),
            h('span', { class: 'dim', text: 'неделя ' + post.week })))));
    });
    scr.appendChild(box);
  };

  /* ================= АРЕНА ================= */
  UI.screenArena = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    scr.appendChild(UI.pageHeader('Арена', 'club'));
    const cap = W.arenaCapacity(club);
    const sum = Ec.summary(g, club);
    scr.appendChild(h('div', { class: 'stat-grid mb' },
      UI.stat(U.num(cap), 'мест'),
      UI.stat(Math.round(sum.attendance.fill * 100) + '%', 'заполняем.'),
      UI.stat(U.money(sum.perMatch), 'за матч')));

    const license = W.arenaHasCevLicense(club);
    scr.appendChild(h('div', { class: 'card tight row between' },
      h('div', { class: 'grow' },
        h('div', { class: 'small' }, 'Лицензия CEV'),
        h('div', { class: 'tiny dim', text: 'от 2000 мест и медиа-инфраструктура 2-го уровня' })),
      h('span', { class: 'pill ' + (license ? 'good' : 'bad'), text: license ? 'есть' : 'нет' })));

    scr.appendChild(h('div', { class: 'section-title', text: 'Цена билета' }));
    const price = h('input', { type: 'range', min: 150, max: 3500, step: 50, value: club.ticketPrice, style: 'width:100%' });
    const label = h('div', { class: 'row between small mt' },
      h('span', { class: 'muted', text: 'Цена' }), h('b', { text: U.money(club.ticketPrice) }));
    price.addEventListener('input', () => {
      club.ticketPrice = Number(price.value);
      label.lastChild.textContent = U.money(club.ticketPrice);
    });
    price.addEventListener('change', () => UI.render());
    scr.appendChild(h('div', { class: 'card' }, price, label,
      h('div', { class: 'tiny dim mt', text: 'Дороже ожидаемого — трибуны пустеют, гул тише, спонсоры замечают.' })));

    if (club.arena.works.length) {
      scr.appendChild(h('div', { class: 'section-title', text: 'Стройка идёт' }));
      club.arena.works.forEach((w) => {
        scr.appendChild(h('div', { class: 'card tight' },
          h('div', { class: 'row between small mb' }, h('b', { text: w.name }), h('span', { class: 'muted', text: w.monthsLeft + ' мес.' })),
          h('div', { class: 'progress' }, h('i', { style: 'width:' + Math.round(100 - (w.monthsLeft / 4) * 100) + '%' }))));
      });
    }

    scr.appendChild(h('div', { class: 'section-title', text: 'Капитальные вложения' }));
    ARENA_UPGRADES.forEach((up) => {
      const lvl = club.arena[up.id];
      const cost = Ec.upgradeCost(club, up.id);
      const building = club.arena.works.some((w) => w.id === up.id);
      scr.appendChild(h('div', { class: 'card' },
        h('div', { class: 'row between' },
          h('b', { text: up.name }),
          h('span', { class: 'pill', text: 'ур. ' + lvl + '/' + up.levels })),
        h('div', { class: 'small muted', style: 'margin:4px 0 10px', text: up.desc }),
        cost == null
          ? h('div', { class: 'small good', text: 'Максимальный уровень.' })
          : building
            ? h('div', { class: 'small warn', text: 'Уже строится.' })
            : h('div', { class: 'btn-row' },
              h('button', {
                class: 'btn', onclick: () => {
                  const r = Ec.startUpgrade(g, club, up.id, false);
                  UI.toast(r.ok ? 'Стройка началась: ' + U.money(r.cost) : r.reason);
                  UI.render();
                },
              }, U.money(cost)),
              h('button', {
                class: 'btn ghost', onclick: () => {
                  const r = Ec.startUpgrade(g, club, up.id, true);
                  UI.toast(r.ok ? 'Взят кредит на стройку' : r.reason);
                  UI.render();
                },
              }, 'В кредит'))));
    });
  };

  /* ================= СПОНСОРЫ ================= */
  UI.screenSponsors = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    scr.appendChild(UI.pageHeader('Спонсоры', 'club'));
    scr.appendChild(h('div', { class: 'card tight row between' },
      h('div', { class: 'small' }, 'Ежемесячно: ', h('b', { text: U.money(Ec.sponsorIncome(club)) })),
      h('span', { class: 'pill accent', text: 'медийность ' + Math.round(club.mediaIndex) })));

    scr.appendChild(h('div', { class: 'section-title', text: 'Действующие контракты' }));
    if (!club.finance.sponsors.length) scr.appendChild(h('div', { class: 'empty', text: 'Партнёров нет.' }));
    club.finance.sponsors.forEach((s) => {
      scr.appendChild(h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('b', { text: s.brand }), h('span', { class: 'pill', text: s.name })),
        h('div', { class: 'small muted', style: 'margin:4px 0', text: U.money(s.monthly) + '/мес · осталось ' + s.monthsLeft + ' мес.' + (s.rename ? ' · клуб носит имя спонсора' : '') }),
        h('div', { class: 'tiny dim', text: 'Бонусы: топ-4 ' + U.money(s.bonusTop4) + ', еврокубки ' + U.money(s.bonusEuro) + ' · штраф за вылет ' + U.money(s.penaltyRelegation) }),
        h('button', {
          class: 'btn sm danger mt', onclick: () => UI.confirm('Разорвать контракт?', 'Штраф: ' + U.money(s.breakFee), () => {
            Ec.breakSponsor(g, club, s.id); UI.render(); UI.toast('Контракт разорван');
          }, 'Разорвать'),
        }, 'Разорвать')));
    });

    scr.appendChild(h('div', { class: 'section-title', text: 'Предложения' }));
    const offers = g.offers.sponsors || [];
    if (!offers.length) scr.appendChild(h('div', { class: 'empty', text: 'Предложений нет. Растите медийность — и партнёры выйдут на связь.' }));
    offers.forEach((o) => {
      scr.appendChild(h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('b', { text: o.brand }), h('span', { class: 'pill accent', text: o.name })),
        h('div', { class: 'small', style: 'margin:6px 0' }, U.money(o.monthly), '/мес · ', o.years + ' ' + U.plural(o.years, ['сезон', 'сезона', 'сезонов'])),
        h('div', { class: 'tiny dim mb', text: o.note }),
        o.rename ? h('div', { class: 'tiny warn mb', text: 'Клуб и арена будут переименованы: «' + o.brand + ' ' + club.city + '»' }) : null,
        h('button', {
          class: 'btn primary full', onclick: () => {
            Ec.signSponsor(g, club, o);
            g.offers.sponsors = g.offers.sponsors.filter((x) => x.id !== o.id);
            S.Feed.event(g, club, 'sponsor', { brand: o.brand, years: o.years + ' ' + U.plural(o.years, ['сезон', 'сезона', 'сезонов']), club: club.name, money: U.money(o.monthly) }, 1.3);
            UI.render(); UI.toast('Контракт подписан');
          },
        }, 'Подписать')));
    });
  };

  /* ================= ФИНАНСЫ ================= */
  UI.screenFinance = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const sum = Ec.summary(g, club);
    scr.appendChild(UI.pageHeader('Финансы', 'club'));
    scr.appendChild(h('div', { class: 'card center' },
      h('div', { class: 'tiny dim', text: 'БАЛАНС' }),
      h('div', { class: 'big ' + (club.finance.balance < 0 ? 'bad' : ''), text: U.money(club.finance.balance) }),
      h('div', { class: 'small ' + (sum.monthly >= 0 ? 'good' : 'bad'), text: (sum.monthly >= 0 ? '+' : '') + U.money(sum.monthly) + ' в месяц' })));

    scr.appendChild(h('div', { class: 'card' },
      line('Спонсоры', sum.sponsors), line('Взнос учредителя', sum.support),
      line('Билеты за домашний матч', sum.perMatch),
      line('Зарплаты', -sum.wages), line('Инфраструктура', -sum.upkeep),
      club.finance.loanMonths > 0 ? line('Кредит (' + club.finance.loanMonths + ' мес.)', -club.finance.loanMonthly) : null));

    if (club.finance.debt > 0) {
      scr.appendChild(h('div', { class: 'card tight row between' },
        h('span', { class: 'small muted', text: 'Долг банку' }), h('b', { class: 'bad', text: U.money(club.finance.debt) })));
    }
    scr.appendChild(h('button', {
      class: 'btn full', onclick: () => loanModal(club),
    }, 'Взять кредит (лимит ' + U.money(Ec.loanLimit(g, club)) + ')'));

    scr.appendChild(h('div', { class: 'section-title', text: 'Операции' }));
    (club.finance.ledger || []).slice(0, 25).forEach((l) => {
      scr.appendChild(h('div', { class: 'card tight row between' },
        h('span', { class: 'small grow ellipsis', text: l.label }),
        h('b', { class: l.amount >= 0 ? 'good' : 'bad', text: (l.amount >= 0 ? '+' : '') + U.money(l.amount) })));
    });
    function line(label, v) {
      return h('div', { class: 'row between small', style: 'padding:5px 0;border-bottom:1px solid var(--line)' },
        h('span', { class: 'muted', text: label }),
        h('b', { class: v >= 0 ? 'good' : 'bad', text: (v >= 0 ? '+' : '') + U.money(v) }));
    }
  };

  function loanModal(club) {
    const g = UI.game;
    const limit = Ec.loanLimit(g, club);
    UI.modal('Кредит на развитие', (m) => {
      const inp = h('input', { type: 'range', min: 1e6, max: Math.max(2e6, limit), step: 5e5, value: Math.min(limit, Math.round(limit / 2)), style: 'width:100%' });
      const info = h('div', { class: 'card flat tight mt' });
      function upd() {
        const amount = Number(inp.value);
        const months = 27, total = amount * 1.16;
        info.innerHTML = '';
        info.appendChild(h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Сумма'), h('b', U.money(amount))));
        info.appendChild(h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Платёж'), h('b', U.money(total / months) + '/мес')));
        info.appendChild(h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Срок'), h('b', months + ' мес. · ставка 16%')));
      }
      inp.addEventListener('input', upd);
      upd();
      return [
        h('div', { class: 'small muted mb', text: 'Банк смотрит на спонсорские доходы и вместимость арены.' }),
        inp, info,
        h('button', {
          class: 'btn primary full mt', onclick: () => {
            const r = Ec.takeLoan(g, club, Number(inp.value));
            UI.toast(r.ok ? 'Кредит получен: ' + U.money(r.amount) : r.reason);
            m.close(); UI.render();
          },
        }, 'Взять кредит'),
      ];
    });
  }

  /* ================= ИСТОРИЯ ================= */
  UI.screenHistory = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    scr.appendChild(UI.pageHeader('История клуба', 'settings'));
    if (club.trophies.length) {
      scr.appendChild(h('div', { class: 'section-title', text: 'Трофеи' }));
      club.trophies.forEach((t) => scr.appendChild(h('div', { class: 'card tight row between' },
        h('b', { text: t.name }), h('span', { class: 'muted small', text: t.season }))));
    }
    scr.appendChild(h('div', { class: 'section-title', text: 'Сезоны' }));
    if (!club.history.length) scr.appendChild(h('div', { class: 'empty', text: 'Первый сезон ещё идёт.' }));
    club.history.slice().reverse().forEach((r) => {
      scr.appendChild(h('div', { class: 'card tight row between' },
        h('span', { class: 'small', text: r.season + ' · ' + r.division }),
        h('b', { text: r.position + '-е место' })));
    });
  };

  S.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
