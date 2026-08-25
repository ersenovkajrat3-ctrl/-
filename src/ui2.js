/* Volleyball Manager — экраны: матчи и таблицы, рынок, лента «Подача», арена, спонсоры, финансы,
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
      opp && opp.identity ? UI.crest(opp, 26) : null,
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
        h('td', { class: 'name' }, h('span', { class: 'row', style: 'gap:6px' }, UI.crest(c, 18), h('span', { class: 'ellipsis', text: c.name }))),
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
    let divId = UI.sub.poDiv != null ? UI.sub.poDiv : club.division;
    scr.appendChild(h('div', { class: 'tabs' },
      ...DIVISIONS.map((d) => h('button', {
        class: 'tab' + (divId === d.id ? ' on' : ''),
        onclick: () => { UI.sub.poDiv = d.id; UI.render(); },
      }, d.short))));
    const st = g.playoffs.byDiv[divId];
    (st.history || []).forEach((round) => {
      scr.appendChild(h('div', { class: 'section-title', text: round.stageName || stageName(round.stage) }));
      round.series.forEach((s) => scr.appendChild(seriesCard(g, s, club)));
    });
    if (st.stage !== 'done') {
      scr.appendChild(h('div', { class: 'section-title', text: stageName(st.stage) }));
      st.series.forEach((s) => scr.appendChild(seriesCard(g, s, club)));
    }
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
        h('td', { class: 'name' }, h('span', { class: 'row', style: 'gap:6px' },
          t.country ? S.Flags.byNation(t.country, 16) : (t.identity ? UI.crest(t, 18) : null),
          h('span', { class: 'ellipsis', text: t.name }))),
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
      ...[['all', 'Все'], ['abroad', 'Заграница'], ['S', 'СВ'], ['OP', 'ДИ'], ['OH', 'ДГ'], ['MB', 'ЦБ'], ['L', 'ЛБ']].map(([id, label]) =>
        h('button', {
          class: 'tab' + (filter === id ? ' on' : ''),
          onclick: () => { UI.sub.marketRole = id; UI.render(); },
        }, label))));
    let list = (g.market || []).map((m) => ({ m, p: g.players[m.playerId] })).filter((x) => x.p);
    if (filter === 'abroad') list = list.filter((x) => x.m.abroad);
    else if (filter !== 'all') list = list.filter((x) => x.p.role === filter);
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
          h('div', { class: 'p-meta', text: UI.playerMeta(p) + ' · ' + (m.abroad ? m.from + ', ' + m.country : m.clubId ? g.clubs[m.clubId].name : 'свободный агент') })),
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
            h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Ваш баланс'), h('b', U.money(club.finance.balance))),
            entry.abroad ? h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Агентские (7%)'), h('b', U.money(Math.round(entry.ask * 0.07)))) : null),
          entry.abroad ? h('div', { class: 'tiny dim mt', text: 'Переход из ' + entry.from + ' (' + entry.country + '). Игрок займёт место легионера в заявке.' }) : null);
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
            UI.toast(r.ok ? (r.abroad ? 'Уехал за рубеж за ' : 'Продан за ') + U.money(r.fee) : r.reason);
            m.close(); UI.render();
          },
        },
          h('span', { class: 'grow' },
            h('div', { class: 'small', text: o.name }),
            o.abroad ? h('div', { class: 'tiny teal', text: o.country + ' · игрок уедет из лиги' }) : null),
          h('b', { text: U.money(o.fee) }))),
      ];
    });
  };

  /* ================= ЛЕНТА И СМИ ================= */
  UI.feedTab = UI.feedTab || 'social';

  /** соцсети: «Подача» */
  function feedColumn(scr, g, club) {
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
      const postClub = g.clubs[post.clubId];
      box.appendChild(h('div', { class: 'post' },
        post.author === 'club' && postClub
          ? h('div', { class: 'ava-crest' }, UI.crest(postClub, 36))
          : h('div', { class: 'ava ' + post.author, text: post.avatar }),
        h('div', { class: 'grow' },
          h('div', { class: 'hd' }, h('b', { text: post.label }), h('span', { class: 'dim', text: ' ' + post.handle })),
          h('div', { class: 'txt', text: post.text }),
          h('div', { class: 'react' },
            h('span', { text: '♡ ' + U.num(post.likes) }),
            h('span', { text: '↻ ' + U.num(post.reposts) }),
            h('span', { class: 'dim', text: 'неделя ' + post.week })))));
    });
    scr.appendChild(box);
  }

  /** пресса: газеты и интернет-порталы */
  function pressColumn(scr, g, club) {
    const Pr = S.Press;
    const list = (g.press || []).filter((a) => a.clubId === club.id);
    const outlets = Pr.outletsFor(club);
    const mood = Pr.mood(g, club.id);
    const avg = Pr.avgMark(g, club.id);
    const moodLabel = mood > 0.35 ? 'пресса на вашей стороне'
      : mood > 0.1 ? 'тон скорее доброжелательный'
      : mood > -0.1 ? 'взвешенный тон'
      : mood > -0.35 ? 'пресса настроена критично'
      : 'вас разбирают по косточкам';

    scr.appendChild(h('div', { class: 'card tight' },
      h('div', { class: 'row between mb' },
        h('div', null, h('b', { text: 'СМИ' }), h('div', { class: 'tiny dim', text: 'газеты и интернет-порталы о клубе' })),
        avg != null ? h('span', { class: 'pill ' + (avg >= 6.5 ? 'good' : avg >= 5 ? '' : 'bad'), text: 'оценка ' + avg.toFixed(1) }) : null),
      h('div', { class: 'press-bar' },
        mood >= 0 ? h('i', { class: 'pos', style: 'width:' + (mood * 50).toFixed(1) + '%' })
          : h('i', { class: 'neg', style: 'width:' + (-mood * 50).toFixed(1) + '%' })),
      h('div', { class: 'tiny dim mt', text: moodLabel + ' · публикаций за сезон: ' + list.length })));

    const obox = h('div', { class: 'card tight' },
      h('div', { class: 'small mb' }, 'Кто пишет о клубе'));
    outlets.forEach((o) => obox.appendChild(h('div', { class: 'outlet-row' },
      h('div', { class: 'dot ' + o.kind, text: o.short }),
      h('div', { class: 'grow' },
        h('div', { class: 'small', text: o.name }),
        h('div', { class: 'tiny dim', text: Pr.KIND_LABEL[o.kind] + ' · ' + SLANT[o.slant] })),
      h('span', { class: 'tiny dim', text: U.num(o.reach) + ' тыс.' }))));
    const hidden = S.Press.OUTLETS.length - outlets.length;
    if (hidden > 0) obox.appendChild(h('div', { class: 'tiny muted mt', text: 'Ещё ' + hidden + ' ' + U.plural(hidden, ['издание', 'издания', 'изданий']) + ' обратят на клуб внимание в лигах повыше.' }));
    scr.appendChild(obox);

    if (!list.length) { scr.appendChild(h('div', { class: 'empty', text: 'Пресса пока молчит — сыграйте матч.' })); return; }
    const box = h('div', { class: 'card', style: 'padding:0' });
    list.slice(0, 40).forEach((a) => {
      const o = Pr.outlet(a.outlet) || { name: 'СМИ', kind: 'portal', short: '??' };
      box.appendChild(h('div', { class: 'article ' + o.kind },
        h('div', { class: 'meta' },
          h('span', { class: 'brand', text: o.name }),
          h('span', { class: 'kind', text: Pr.KIND_LABEL[o.kind] }),
          h('span', { class: 'grow' }),
          a.mark != null ? h('span', { class: 'mark ' + (a.mark >= 6.5 ? 'good' : a.mark < 5 ? 'bad' : ''), text: a.mark.toFixed(1) }) : null),
        h('div', { class: 'head', text: a.headline }),
        h('div', { class: 'lede', text: a.text }),
        a.author ? h('div', { class: 'by', text: 'колонка · ' + a.author }) : null,
        h('div', { class: 'foot' },
          h('span', { text: 'неделя ' + a.week }),
          h('span', { text: '👁 ' + U.num(Math.round(a.reads / 1000)) + ' тыс.' }))));
    });
    scr.appendChild(box);
  }

  const SLANT = {
    loyal: 'лояльная линия', neutral: 'взвешенная подача', analytic: 'разборы и цифры',
    critic: 'критический тон', tabloid: 'громкие заголовки',
  };

  UI.screenFeed = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    scr.appendChild(h('div', { class: 'seg mb' },
      h('button', { class: UI.feedTab === 'social' ? 'on' : '', onclick: () => { UI.feedTab = 'social'; UI.render(); } }, 'Соцсети'),
      h('button', { class: UI.feedTab === 'press' ? 'on' : '', onclick: () => { UI.feedTab = 'press'; UI.render(); } }, 'СМИ')));
    if (UI.feedTab === 'press') pressColumn(scr, g, club);
    else feedColumn(scr, g, club);
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

    const att2 = club.attendanceLog || [];
    if (att2.length >= 2) {
      scr.appendChild(h('div', { class: 'card' },
        h('div', { class: 'row between mb' }, h('b', { text: 'Посещаемость домашних матчей' }),
          h('span', { class: 'tiny dim', text: 'из ' + U.num(cap) + ' мест' })),
        S.Charts.line(att2.map((a, i) => ({ x: i + 1, y: a.count })), {
          minY: 0, maxY: cap, area: true, color: S.Charts.C2,
          ticks: [0, Math.round(cap / 2), cap],
          fmtY: (v) => U.num(v),
          xFirst: 'матч 1', xLast: 'матч ' + att2.length,
        })));
    }

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

    if (club.arena.service) {
      scr.appendChild(h('div', { class: 'section-title', text: 'Еда и напитки' }));
      const seg = h('div', { class: 'seg' });
      Ec.FOOD_TIERS.forEach((t) => {
        seg.appendChild(h('button', {
          class: (club.foodPrice != null ? club.foodPrice : 1) === t.id ? 'on' : '',
          onclick: () => { club.foodPrice = t.id; UI.render(); },
        }, t.name));
      });
      const tier = Ec.foodTier(club);
      scr.appendChild(h('div', { class: 'card' }, seg,
        h('div', { class: 'tiny dim mt', text: tier.desc }),
        h('div', { class: 'row between small mt' },
          h('span', { class: 'muted', text: 'Буфеты за домашний матч' }),
          h('b', { class: 'good', text: '+' + U.money(Ec.matchdayService(g, club, sum.attendance.count)) })),
        tier.mood ? h('div', { class: 'row between tiny' },
          h('span', { class: 'dim', text: 'Влияние на настроение трибун' }),
          h('b', { class: tier.mood > 0 ? 'good' : 'bad', text: (tier.mood > 0 ? '+' : '') + tier.mood + ' за матч' })) : null));
    }

    if (club.arena.shop || club.arena.service) {
      scr.appendChild(h('div', { class: 'card tight' },
        h('div', { class: 'row between small' },
          h('span', { class: 'muted', text: 'Магазин и онлайн-витрина' }),
          h('b', { class: 'good', text: '+' + U.money(Ec.merchMonthly(g, club)) + '/мес' })),
        h('div', { class: 'row between small' },
          h('span', { class: 'muted', text: 'Атрибутика и буфеты в день матча' }),
          h('b', { class: 'good', text: '+' + U.money(Ec.matchdayMerch(g, club, sum.attendance.count) + Ec.matchdayService(g, club, sum.attendance.count)) })),
        club.merchBoost > 0.05
          ? h('div', { class: 'tiny accent mt', text: 'Ажиотаж после успеха: продажи выше обычного на ' + Math.round(club.merchBoost * 100) + '%' })
          : h('div', { class: 'tiny dim mt', text: 'Продажи растут от медийности, настроения трибун и звёзд в составе.' })));
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

    const months = club.finance.monthly || [];
    if (months.length >= 2) {
      scr.appendChild(h('div', { class: 'card' },
        h('div', { class: 'row between mb' }, h('b', { text: 'Месяц к месяцу' }),
          h('span', { class: 'tiny dim', text: 'доход минус расход' })),
        S.Charts.signedBars(months.map((m) => ({ value: m.income - m.spend, label: 'н.' + m.week })), {
          caption: 'столбик вверх — месяц закрыт в плюс',
          fmtValue: (v) => (v >= 0 ? '+' : '−') + U.money(Math.abs(v)).replace(' ₽', ''),
        })));
    }

    scr.appendChild(h('div', { class: 'card' },
      line('Спонсоры', sum.sponsors), line('Взнос учредителя', sum.support),
      line('Мерч: магазин и онлайн', sum.merch),
      line('Матчдэй за домашний матч', sum.perMatch),
      line('Зарплаты', -sum.wages), line('Инфраструктура', -sum.upkeep),
      club.finance.loanMonths > 0 ? line('Кредит (' + club.finance.loanMonths + ' мес.)', -club.finance.loanMonthly) : null));

    // из чего складывается день матча
    const md = sum.matchday;
    scr.appendChild(h('div', { class: 'card' },
      h('div', { class: 'row between mb' }, h('b', { text: 'День матча' }),
        h('span', { class: 'tiny dim', text: U.num(sum.attendance.count) + ' зрителей' })),
      mdRow('Билеты', md.tickets, sum.perMatch),
      mdRow('VIP-ложи', md.boxes, sum.perMatch),
      mdRow('Буфеты и сервис', md.food, sum.perMatch),
      mdRow('Атрибутика на арене', md.merch, sum.perMatch),
      !club.arena.service || !club.arena.shop
        ? h('div', { class: 'tiny dim mt', text: 'Кафе и клубный магазин строятся на экране «Арена» — это отдельные статьи дохода, а не просто украшение.' })
        : null));

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
    /** строка дня матча: сумма плюс доля от всей выручки матча */
    function mdRow(label, v, total) {
      const share = total > 0 ? Math.round((v / total) * 100) : 0;
      return h('div', { class: 'row between small', style: 'padding:5px 0;border-bottom:1px solid var(--line)' },
        h('span', { class: v > 0 ? 'muted' : 'dim', text: label }),
        h('span', { class: 'row', style: 'gap:8px' },
          h('span', { class: 'tiny dim', text: v > 0 ? share + '%' : '—' }),
          h('b', { class: v > 0 ? '' : 'dim', text: U.money(v) })));
    }

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

  /* ================= ТРИБУНЫ ================= */
  UI.screenFans = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const f = club.fans;
    const F = S.Fans;
    scr.appendChild(UI.pageHeader('Трибуны', 'club'));

    const cap = W.arenaCapacity(club);
    const att = Ec.attendance(g, club, null);
    scr.appendChild(h('div', { class: 'card' },
      h('div', { class: 'row between mb' },
        h('div', null,
          h('div', { class: 'tiny dim', text: 'НАСТРОЕНИЕ ТРИБУН' }),
          h('div', { style: 'font-size:17px;font-weight:700', text: F.moodLabel(f.mood) })),
        h('span', { class: 'pill ' + (f.mood >= 60 ? 'good' : f.mood >= 35 ? '' : 'bad'), text: Math.round(f.mood) + ' / 100' })),
      h('div', { class: 'mood-gauge' },
        h('i', { style: 'width:100%' }),
        h('b', { style: 'left:calc(' + Math.round(f.mood) + '% - 1.5px)' })),
      h('div', { class: 'row between tiny dim', style: 'margin-top:6px' },
        h('span', { text: 'бойкот' }), h('span', { text: 'ядро поддержки ' + Math.round(f.loyalty) }), h('span', { text: 'праздник' }))));

    scr.appendChild(h('div', { class: 'stat-grid mb' },
      UI.stat(U.num(f.members), 'абонементов'),
      UI.stat(U.num(att.count), 'придёт на матч'),
      UI.stat(Math.round(F.support(g, club, att.fill) * 100) + '%', 'поддержка')));

    scr.appendChild(h('div', { class: 'card tight tiny muted' },
      'Поддержка трибун — это не только атмосфера: от неё зависит бонус своей площадки в движке матча. ' +
      'Полный заряженный зал даёт заметное преимущество, полупустой почти ничего.'));

    // любимец публики
    const fav = f.favoriteId && g.players[f.favoriteId];
    if (fav) {
      scr.appendChild(h('div', { class: 'section-title', text: 'Любимец трибун' }));
      scr.appendChild(h('div', { class: 'card tight' },
        UI.playerRow(fav, club),
        h('div', { class: 'tiny dim mt', text: 'Продажа такого игрока обвалит настроение трибун.' })));
    }

    // ожидания
    scr.appendChild(h('div', { class: 'section-title', text: 'Чего ждут от сезона' }));
    if (!f.demands.length) scr.appendChild(h('div', { class: 'empty', text: 'Ожидания появятся в начале сезона.' }));
    f.demands.forEach((d) => {
      const done = typeof d.check === 'function' ? d.check(g, club) : d.done;
      scr.appendChild(h('div', { class: 'card tight row between' },
        h('span', { class: 'small grow', text: d.text[0].toUpperCase() + d.text.slice(1) }),
        h('span', { class: 'pill ' + (done ? 'good' : ''), text: done ? 'выполняется' : 'пока нет' })));
    });
    if (f.homeLosses) {
      scr.appendChild(h('div', { class: 'tiny dim', style: 'padding:0 4px', text: 'Домашних поражений в сезоне: ' + f.homeLosses }));
    }

    // кричалки
    scr.appendChild(h('div', { class: 'section-title', text: 'Кричалки сектора' }));
    Object.values(F.CHANTS).forEach((c) => {
      const has = f.chants.includes(c.id);
      scr.appendChild(h('div', { class: 'card tight' + (has ? ' chant-card' : '') },
        h('div', { class: 'row between' },
          h('b', { class: has ? '' : 'dim', text: c.name }),
          has ? h('button', {
            class: 'btn sm ghost', onclick: () => {
              S.Audio.resume();
              S.Audio.startCrowd(0.85);
              S.Audio.chant(4, 1);
              setTimeout(() => S.Audio.stopCrowd(), 2200);
              UI.toast('«' + c.text.replace('{club}', club.baseName) + '»');
            },
          }, 'Послушать') : h('span', { class: 'pill', text: 'не разучена' })),
        h('div', { class: 'small' + (has ? '' : ' dim'), style: 'margin-top:4px', text: has ? '«' + c.text.replace('{club}', club.baseName) + '»' : 'откроется: ' + c.how })));
    });

    // журнал настроения
    if (f.log && f.log.length) {
      scr.appendChild(h('div', { class: 'section-title', text: 'Что двигало трибуны' }));
      f.log.slice(0, 8).forEach((l) => {
        scr.appendChild(h('div', { class: 'card tight row between' },
          h('span', { class: 'small grow ellipsis', text: l.reason }),
          h('b', { class: l.delta >= 0 ? 'good' : 'bad', text: (l.delta >= 0 ? '+' : '') + l.delta })));
      });
    }
  };

  /* ================= СБОРНАЯ ================= */
  UI.screenNational = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const N = S.National;
    scr.appendChild(UI.pageHeader('Сборная', 'club'));

    const nat = g.national && g.national.last;
    const next = N.tournamentFor(g.season);
    if (!nat) {
      scr.appendChild(h('div', { class: 'card center' },
        h('div', { class: 'tiny dim', text: 'БЛИЖАЙШИЙ ТУРНИР' }),
        h('div', { class: 'big', text: next.name }),
        h('div', { class: 'small muted mt', text: 'Сборные играют летом, между сезонами. Ваши игроки попадут туда сами — по классу.' })));
      const call = N.callUp(g).slice(0, 8);
      scr.appendChild(h('div', { class: 'section-title', text: 'Кто в обойме сейчас' }));
      const box = h('div', { class: 'plist' });
      call.forEach((p) => box.appendChild(UI.playerRow(p, g.clubs[p.clubId])));
      scr.appendChild(box);
      return;
    }

    const medalColor = { 'золото': 'accent', 'серебро': '', 'бронза': 'warn' }[nat.medal] || '';
    scr.appendChild(h('div', { class: 'card center' + (nat.medal ? ' next-match' : '') },
      h('div', { class: 'tiny dim', text: nat.tournament.toUpperCase() + ' · ' + nat.season }),
      h('div', { class: 'row', style: 'justify-content:center;gap:10px;margin:4px 0' },
        S.Flags.byNation(N.HOME, 34),
        h('div', { class: 'big ' + medalColor, text: nat.medal ? nat.medal.toUpperCase() : (nat.stage || 'групповой этап') })),
      h('div', { class: 'row small muted', style: 'justify-content:center;gap:6px' },
        h('span', { text: 'Чемпион:' }), S.Flags.byNation(nat.champion, 18), h('span', { text: nat.champion }),
        nat.place ? h('span', { class: 'dim', text: '· наше место: ' + nat.place }) : null)));

    scr.appendChild(h('div', { class: 'stat-grid mb' },
      UI.stat(nat.power + '', 'класс состава'),
      UI.stat(nat.matches.length + '', 'матчей'),
      UI.stat(nat.matches.filter((m) => m.score[0] > m.score[1]).length + '', 'побед')));

    scr.appendChild(h('div', { class: 'section-title', text: 'Матчи сборной' }));
    nat.matches.forEach((m) => {
      const win = m.score[0] > m.score[1];
      scr.appendChild(h('div', { class: 'card tight' },
        h('div', { class: 'row between' },
          S.Flags.byNation(m.rival, 24),
          h('span', { class: 'grow' },
            h('div', { class: 'small', text: 'Сборная — ' + m.rival }),
            h('div', { class: 'tiny dim', text: m.stage + (m.hero ? ' · лучший: ' + m.hero.name + ', ' + m.hero.points + ' очк.' : '') })),
          h('span', { class: 'pill ' + (win ? 'good' : 'bad'), text: m.score.join(':') }))));
    });

    scr.appendChild(h('div', { class: 'section-title', text: 'Состав на турнир' }));
    const ours = nat.squad.filter((x) => {
      const p = g.players[x.id];
      return p && p.clubId === club.id;
    }).length;
    if (ours) {
      scr.appendChild(h('div', { class: 'card tight small', text: 'От вашего клуба вызывали ' + ours + ' ' + U.plural(ours, ['игрока', 'игроков', 'игроков']) + ' — это плюс к медийности.' }));
    }
    nat.squad.forEach((x) => {
      const p = g.players[x.id];
      const mine = p && p.clubId === club.id;
      scr.appendChild(h('button', {
        class: 'p-row' + (mine ? ' on' : ''), style: 'width:100%;text-align:left',
        onclick: () => { if (p) UI.playerCard(p); },
      },
        h('span', { class: 'role-badge role-' + x.role, text: ROLES[x.role].short }),
        h('span', { class: 'grow' },
          h('div', { class: 'p-name', text: x.name }),
          h('div', { class: 'p-meta', text: x.club + (p && p.natCaps ? ' · ' + p.natCaps + ' ' + U.plural(p.natCaps, ['матч', 'матча', 'матчей']) + ' за сборную' : '') })),
        h('span', { class: 'ovr ' + UI.ovrClass(x.ovr), text: x.ovr })));
    });

    if (g.national.history.length > 1) {
      scr.appendChild(h('div', { class: 'section-title', text: 'История выступлений' }));
      g.national.history.forEach((r) => {
        scr.appendChild(h('div', { class: 'card tight row between' },
          h('span', { class: 'small grow', text: r.season + ' · ' + r.tournament }),
          h('span', { class: 'pill' + (r.medal === 'золото' ? ' accent' : r.medal ? ' good' : ''), text: r.medal || r.stage || '—' })));
      });
    }

    scr.appendChild(h('div', { class: 'card tight tiny muted mt' },
      'Следующим летом — ' + next.name + '. В сборную попадают игроки лиги и те, кого вы продали за рубеж: класс важнее прописки.'));
  };

  /* ================= КАРЬЕРА И ВИТРИНА ТРОФЕЕВ ================= */
  const TROPHY_KINDS = [
    { match: (n) => n.indexOf('Лига чемпионов') === 0, label: 'Лига чемпионов CEV', tint: '#2dd4bf' },
    { match: (n) => n.indexOf('Кубок CEV') === 0 || n.indexOf('Кубок Вызова') === 0, label: 'Еврокубок', tint: '#60a5fa' },
    { match: (n) => n === 'Кубок страны', label: 'Кубок страны', tint: '#e0e7ff' },
    { match: (n) => n === 'Суперлига', label: 'Чемпион Суперлиги', tint: '#ff9f1c' },
    { match: () => true, label: 'Титул дивизиона', tint: '#a3e635' },
  ];
  function trophyKind(name) { return TROPHY_KINDS.find((k) => k.match(name)); }

  /** кубок на витрине: тот же вектор, что и на церемонии, только мельче */
  function shelfTrophy(name, season, tint) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 140');
    svg.setAttribute('width', '56');
    svg.setAttribute('height', '66');
    svg.innerHTML = '<defs><linearGradient id="tg' + Math.random().toString(36).slice(2, 7) + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#ffe6a8"/><stop offset="0.5" stop-color="' + tint + '"/><stop offset="1" stop-color="#a35c00"/></linearGradient></defs>';
    const grad = svg.querySelector('linearGradient').id;
    svg.innerHTML += '<g fill="url(#' + grad + ')">' +
      '<path d="M34 14h52v28a26 26 0 01-52 0z"/>' +
      '<rect x="53" y="66" width="14" height="20"/>' +
      '<path d="M38 92h44l4 14H34z"/></g>' +
      '<path d="M34 20H22a14 14 0 0014 22" fill="none" stroke="url(#' + grad + ')" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M86 20h12a14 14 0 01-14 22" fill="none" stroke="url(#' + grad + ')" stroke-width="7" stroke-linecap="round"/>' +
      '<rect x="28" y="108" width="64" height="12" rx="3" fill="#2a3550"/>';
    return h('div', { class: 'trophy-item' },
      svg,
      h('div', { class: 'tiny', style: 'font-weight:700', text: name }),
      h('div', { class: 'tiny dim', text: season }));
  }

  UI.screenHistory = function (scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    scr.appendChild(UI.pageHeader('Карьера', 'settings'));

    const pastClubs = (g.career && g.career.clubs) || [];
    const seasons = club.history.length + U.sum(pastClubs, (c) => c.seasons);
    const trophies = club.trophies.length + U.sum(pastClubs, (c) => c.trophies);
    scr.appendChild(h('div', { class: 'stat-grid mb' },
      UI.stat(seasons + '', U.plural(seasons, ['сезон', 'сезона', 'сезонов'])),
      UI.stat(trophies + '', U.plural(trophies, ['трофей', 'трофея', 'трофеев'])),
      UI.stat(DIVISIONS[club.division].short, 'сейчас')));

    // клуб, основанный игроком, ведёт отсчёт от своего первого сезона
    if (club.founded) {
      scr.appendChild(h('div', { class: 'card tight small' },
        h('b', { text: club.baseName }),
        h('span', { class: 'dim', text: ' основан в ' + club.city + ', сезон ' + club.foundedSeason + '. Начинали в ' + DIVISIONS[3].name.toLowerCase() + '.' })));
    }

    // витрина
    scr.appendChild(h('div', { class: 'section-title', text: 'Витрина трофеев' }));
    if (club.trophies.length) {
      const shelf = h('div', { class: 'trophy-shelf' });
      club.trophies.slice().reverse().forEach((t) => {
        shelf.appendChild(shelfTrophy(t.name, t.season, trophyKind(t.name).tint));
      });
      scr.appendChild(h('div', { class: 'card' }, shelf));
    } else {
      const empty = h('div', { class: 'trophy-shelf empty' });
      TROPHY_KINDS.slice(0, 4).forEach((k) => {
        empty.appendChild(h('div', { class: 'trophy-item ghost' },
          h('div', { class: 'ghost-cup' }),
          h('div', { class: 'tiny dim', text: k.label })));
      });
      scr.appendChild(h('div', { class: 'card' }, empty,
        h('div', { class: 'tiny dim center mt', text: 'Полка пока пуста — есть что занять.' })));
    }

    // лестница дивизионов
    const hist = club.history;
    if (hist.length >= 2) {
      const tierOf = (name) => DIVISIONS.findIndex((d) => d.name === name);
      scr.appendChild(h('div', { class: 'card' },
        h('div', { class: 'row between mb' }, h('b', { text: 'Лестница дивизионов' }),
          h('span', { class: 'tiny dim', text: 'выше — сильнее лига' })),
        S.Charts.line(hist.map((r, i) => ({ x: i + 1, y: tierOf(r.division) })), {
          invert: true, minY: 0, maxY: 3, ticks: [0, 1, 2, 3],
          fmtY: (v) => DIVISIONS[Math.round(v)] ? DIVISIONS[Math.round(v)].short : '',
          xFirst: hist[0].season, xLast: hist[hist.length - 1].season,
          height: 120,
        })));
    }

    // сезоны
    scr.appendChild(h('div', { class: 'section-title', text: 'Сезон за сезоном' }));
    if (hist.length) {
      scr.appendChild(h('div', { class: 'tiny dim', style: 'padding:0 4px 6px', text: 'Место — по регулярному чемпионату, трофей — по плей-офф.' }));
    } else {
      scr.appendChild(h('div', { class: 'empty', text: 'Первый сезон ещё идёт.' }));
    }
    hist.slice().reverse().forEach((r) => {
      const won = club.trophies.filter((t) => t.season === r.season);
      scr.appendChild(h('div', { class: 'card tight row between' },
        h('span', { class: 'grow' },
          h('div', { class: 'small', text: r.season + ' · ' + r.division }),
          won.length ? h('div', { class: 'tiny accent', text: '🏆 ' + won.map((t) => t.name).join(', ') }) : null),
        h('span', { class: 'pill' + (r.position === 1 ? ' accent' : r.position <= 4 ? ' good' : ''), text: r.position + '-е' })));
    });

    if (pastClubs.length) {
      scr.appendChild(h('div', { class: 'section-title', text: 'Прошлые клубы' }));
      pastClubs.forEach((c) => {
        scr.appendChild(h('div', { class: 'card tight row between' },
          h('span', { class: 'small grow', text: c.club }),
          h('span', { class: 'tiny dim', text: c.seasons + ' ' + U.plural(c.seasons, ['сезон', 'сезона', 'сезонов']) + ' · ' + c.trophies + ' ' + U.plural(c.trophies, ['трофей', 'трофея', 'трофеев']) })));
      });
    }
  };

  S.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
