/* Volleyball Manager — интерфейс: каркас, экраны «Клуб» и «Состав», карточка игрока, настройки. */
(function (global) {
  const S = global.SETKA;
  const { U, DIVISIONS, ROLES, FOREIGN_LIMIT } = S;
  const P = S.Players, W = S.World, Ec = S.Economy, Sn = S.Season, Tr = S.Transfers;

  const UI = {
    tab: 'club',
    sub: {},
    game: null,
  };

  /* ---------- DOM-хелперы ---------- */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    // второй аргумент может быть и ребёнком: h('b', 'текст') — частая и незаметная ловушка
    const isProps = props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props);
    if (props != null && !isProps) { kids.unshift(props); props = null; }
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    kids.flat(3).forEach((k) => {
      if (k == null || k === false) return;
      e.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
    });
    return e;
  }
  const svg = (paths, attrs) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', (attrs && attrs.vb) || '0 0 24 24');
    if (attrs && attrs.size) { s.setAttribute('width', attrs.size); s.setAttribute('height', attrs.size); }
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', (attrs && attrs.w) || '1.9');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = paths;
    return s;
  };
  UI.h = h; UI.svg = svg;

  const ICONS = {
    club: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/>',
    squad: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.4 6-5.4s6 2.2 6 5.4"/><path d="M17 11.5a2.6 2.6 0 100-5.2"/><path d="M18.5 20c0-2.3-.9-4-2.4-5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    market: '<path d="M3 6h18l-1.6 9.4a2 2 0 01-2 1.6H7.6a2 2 0 01-2-1.6L4 6z"/><path d="M9 6V4.6A2.6 2.6 0 0111.6 2h.8A2.6 2.6 0 0115 4.6V6"/>',
    feed: '<path d="M4 11a9 9 0 019 9"/><path d="M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
    back: '<path d="M15 19l-7-7 7-7"/>',
  };

  /* ---------- утилиты интерфейса ---------- */
  function ovrClass(v) { return v >= 78 ? 'hi' : v >= 62 ? 'mid' : 'lo'; }
  function crestLetter(name) { return (name || '?').replace(/[«»"]/g, '').trim()[0]; }
  /** эмблема клуба нужного размера — используется во всех списках */
  function crest(club, size) { return S.Crest.crestNode(club, size || 30); }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2300);
  }
  UI.toast = toast;

  function modal(title, contentFn, opts = {}) {
    // одно окно за раз: иначе старое остаётся под новым и перехватывает нажатия
    document.querySelectorAll('.modal-back').forEach((el) => el.remove());
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } });
    const box = h('div', { class: 'modal' }, h('div', { class: 'grabber' }));
    if (title) box.appendChild(h('h3', { text: title }));
    if (opts.subtitle) box.appendChild(h('div', { class: 'small muted mb', text: opts.subtitle }));
    const body = h('div');
    box.appendChild(body);
    back.appendChild(box);
    document.body.appendChild(back);
    function close() { back.remove(); }
    const api = {
      close, body, box,
      refresh: () => {
        body.innerHTML = '';
        // содержимое может содержать null-ветки условий — пропускаем их
        [].concat(contentFn(api) || []).flat(3).forEach((n) => {
          if (n == null || n === false) return;
          body.appendChild(typeof n === 'object' ? n : document.createTextNode(String(n)));
        });
      },
    };
    api.refresh();
    return api;
  }
  UI.modal = modal;

  function confirmDialog(title, text, onYes, yesLabel) {
    modal(title, (m) => [
      h('div', { class: 'small muted mb', text }),
      h('div', { class: 'btn-row mt' },
        h('button', { class: 'btn ghost', onclick: m.close }, 'Отмена'),
        h('button', {
          class: 'btn primary', onclick: () => { m.close(); onYes(); },
        }, yesLabel || 'Подтвердить')),
    ]);
  }
  UI.confirm = confirmDialog;

  /* ---------- каркас ---------- */
  function topbar() {
    const g = UI.game;
    const bar = document.getElementById('topbar');
    bar.hidden = false;
    bar.innerHTML = '';
    const club = g.clubs[g.playerClubId];
    const fin = club.finance;
    bar.appendChild(S.Crest.crestNode(club, 38, 'crest'));
    bar.appendChild(h('div', { class: 'tb-main' },
      h('div', { class: 'tb-club', text: club.name }),
      h('div', { class: 'tb-sub', text: DIVISIONS[club.division].name + ' · сезон ' + g.seasonLabel })));
    const changed = UI._lastBalance != null && UI._lastBalance !== fin.balance;
    UI._lastBalance = fin.balance;
    bar.appendChild(h('div', { class: 'tb-right' },
      h('div', { class: 'tb-money' + (fin.balance < 0 ? ' bad' : '') + (changed ? ' flash' : ''), text: U.money(fin.balance) }),
      h('div', { class: 'tb-week', text: g.week ? 'неделя ' + g.week + ' · ' + U.dateLabel(g.week * 7) : (g.phase === 'offseason' ? 'межсезонье' : 'предсезон') })));
  }

  /* ---------- бегущая строка ---------- */
  /** Результаты сборной идут лентой под шапкой — как табло на арене. */
  function ticker() {
    const g = UI.game;
    const box = document.getElementById('ticker');
    const nat = g.national && g.national.last;
    const items = [];
    if (nat) items.push(...nat.ticker);
    // между турнирами в строке живёт лига
    const club = g.clubs[g.playerClubId];
    const div = g.divisions[club.division];
    const order = W.sortTable(div);
    if (order.length) {
      items.push({ kind: 'league', text: DIVISIONS[club.division].short + ': лидер — ' + g.clubs[order[0]].name.toUpperCase() });
      const pos = order.indexOf(club.id) + 1;
      items.push({ kind: 'league', text: club.name.toUpperCase() + ' — ' + pos + '-е место' });
    }
    if (g.national && g.national.history.length) {
      const next = S.National.tournamentFor(g.season);
      items.push({ kind: 'next', text: 'Следующим летом — ' + next.name });
    }
    if (!items.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '';
    const track = h('div', { class: 'ticker-track' });
    const fill = () => items.forEach((it) => {
      const node = h('span', {
        class: 'ticker-item' + (it.kind === 'medal' ? ' medal' : it.good === true ? ' good' : it.good === false ? ' bad' : ''),
      });
      if (it.flag) node.appendChild(S.Flags.svg(it.flag, 16));
      node.appendChild(h('span', { text: it.text }));
      track.appendChild(node);
      track.appendChild(h('i', { class: 'ticker-sep', text: '◆' }));
    });
    fill(); fill();                      // вторая копия — чтобы лента шла без разрыва
    const btn = h('button', {
      class: 'ticker-wrap', onclick: () => UI.go('national'), 'aria-label': 'Сборная',
    }, track);
    box.appendChild(btn);
    // длительность зависит от длины текста, иначе короткая лента летит слишком быстро
    const chars = items.reduce((n, it) => n + it.text.length + 3, 0);
    track.style.setProperty('--ticker-dur', Math.max(18, Math.round(chars / 6)) + 's');
  }
  UI.ticker = ticker;

  function tabbar() {
    const bar = document.getElementById('tabbar');
    bar.hidden = false;
    bar.innerHTML = '';
    const items = [
      ['club', 'Клуб', ICONS.club],
      ['squad', 'Состав', ICONS.squad],
      ['matches', 'Матчи', ICONS.cal],
      ['market', 'Рынок', ICONS.market],
      ['feed', 'Подача', ICONS.feed],
    ];
    const unread = (UI.game.inbox || []).filter((i) => !i.read).length;
    items.forEach(([id, label, icon]) => {
      const btn = h('button', {
        class: UI.tab === id ? 'on' : '', onclick: () => UI.go(id),
      }, svg(icon), h('span', { text: label }));
      if (id === 'club' && unread) btn.appendChild(h('span', { class: 'dot' }));
      bar.appendChild(btn);
    });
  }

  /** тема применяется к корню документа: system — как в системе */
  UI.applyTheme = function () {
    const t = (UI.game && UI.game.settings && UI.game.settings.theme) || 'system';
    const root = document.documentElement;
    if (t === 'system') delete root.dataset.theme;
    else root.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#eff2f8' : '#080d17');
  };

  UI.go = function (tab, sub) {
    UI.tab = tab;
    if (sub != null) UI.sub[tab] = sub;
    window.scrollTo(0, 0);
    UI.render();
    if (S.Audio) S.Audio.click();
  };

  UI.render = function () {
    const g = UI.game;
    const scr = document.getElementById('screen');
    scr.innerHTML = '';
    if (!g || !g.playerClubId) return;
    topbar();
    ticker();
    tabbar();
    const map = {
      club: screenClub, squad: screenSquad, matches: UI.screenMatches,
      market: UI.screenMarket, feed: UI.screenFeed, arena: UI.screenArena,
      sponsors: UI.screenSponsors, finance: UI.screenFinance, settings: screenSettings, fans: UI.screenFans,
      inbox: screenInbox, history: UI.screenHistory, national: UI.screenNational,
    };
    (map[UI.tab] || screenClub)(scr);
  };

  function pageHeader(title, backTab) {
    return h('div', { class: 'row mb', style: 'gap:6px' },
      backTab ? h('button', {
        class: 'btn sm ghost', style: 'width:38px;padding:0', 'aria-label': 'Назад',
        onclick: () => UI.go(backTab),
      }, svg(ICONS.back, { w: 2.4, size: 18 })) : null,
      h('h2', { text: title, style: 'font-size:19px' }));
  }
  UI.pageHeader = pageHeader;
  UI.ovrClass = ovrClass;
  UI.crestLetter = crestLetter;
  UI.crest = crest;

  /* ---------- экран «Клуб» ---------- */
  function screenClub(scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const div = g.divisions[club.division];
    const table = W.sortTable(div);
    const pos = table.indexOf(club.id) + 1;
    const row = div.table[club.id];

    // следующий матч
    const upcoming = g.fixtures
      .filter((f) => !f.played && !f.cancelled && (f.h === club.id || f.a === club.id))
      .sort((a, b) => a.week - b.week || (a.gameNo || 0) - (b.gameNo || 0))[0];

    if (g.phase === 'offseason') {
      scr.appendChild(h('div', { class: 'card next-match center' },
        h('div', { class: 'section-title', style: 'margin:0 0 6px', text: 'Сезон завершён' }),
        h('div', { class: 'big', text: g.seasonLabel }),
        h('div', { class: 'small muted mt', text: 'Подведите итоги и начните новый сезон.' }),
        h('button', { class: 'btn primary full mt', onclick: () => UI.seasonReport() }, 'Итоги сезона')));
    } else if (upcoming) {
      const isHome = upcoming.h === club.id;
      const oppId = isHome ? upcoming.a : upcoming.h;
      const opp = Sn.team(g, oppId);
      const thisWeek = upcoming.week === g.week;
      const card = h('div', { class: 'card next-match' },
        h('div', { class: 'row between' },
          h('span', { class: 'pill accent', text: compLabel(upcoming) }),
          h('span', { class: 'tiny dim', text: 'неделя ' + upcoming.week + ' · ' + U.dateLabel(upcoming.week * 7) })),
        h('div', { class: 'vs' },
          h('div', { class: 'team' },
            h('div', { class: 'nm', text: club.name }),
            h('div', { class: 'tiny dim', text: isHome ? 'дома' : 'в гостях' })),
          h('div', { class: 'mid', text: 'VS' }),
          h('div', { class: 'team' },
            h('div', { class: 'nm', text: opp ? opp.name : '—' }),
            h('div', { class: 'tiny dim', text: oppDesc(g, oppId) }))),
        // прогноз на день матча: тот же, что встретит на арене
        S.Weather ? h('div', { class: 'row between mt-xs mb' },
          UI.wxChip(S.Weather.forFixture(g, upcoming)),
          h('span', { class: 'tiny dim', text: isHome ? 'у нашей арены' : 'в городе соперника' })) : null,
        thisWeek
          ? h('div', { class: 'btn-row' },
            h('button', { class: 'btn', onclick: () => UI.playMatch(upcoming, 'instant') }, 'Мгновенно'),
            h('button', { class: 'btn primary', onclick: () => UI.playMatch(upcoming, 'live') }, 'Смотреть матч'))
          : h('button', { class: 'btn primary full', onclick: () => UI.advanceWeek() },
            upcoming.week === g.week + 1 ? 'Следующая неделя' : 'К неделе ' + (g.week + 1)));
      scr.appendChild(card);
    } else {
      scr.appendChild(h('div', { class: 'card next-match center' },
        h('div', { class: 'muted small', text: g.week >= Sn.SEASON_END_WEEK ? 'Матчи закончились.' : 'На этой неделе матчей нет.' }),
        h('button', { class: 'btn primary full mt', onclick: () => UI.advanceWeek() },
          g.week >= Sn.SEASON_END_WEEK ? 'Завершить сезон' : 'Следующая неделя')));
    }

    // задача совета
    if (g.board) {
      const ok = pos <= g.board.fail;
      scr.appendChild(h('div', { class: 'card tight row between' },
        h('div', { class: 'grow' },
          h('div', { class: 'tiny dim', text: 'ЗАДАЧА СОВЕТА' }),
          h('div', { class: 'small', text: g.board.text[0].toUpperCase() + g.board.text.slice(1) })),
        h('span', { class: 'pill ' + (ok ? 'good' : 'bad'), text: pos + '-е место' })));
    }

    // цифры клуба
    const sum = Ec.summary(g, club);
    scr.appendChild(h('div', { class: 'stat-grid' },
      stat(row ? row.pts + '' : '0', 'очков'),
      stat(row ? row.w + '–' + row.l : '0–0', 'победы'),
      stat(Math.round(club.mediaIndex) + '', 'медийность'),
      stat(U.money(sum.monthly), 'баланс/мес'),
      stat(U.num(W.arenaCapacity(club)), 'вместимость'),
      stat(Math.round(sum.attendance.fill * 100) + '%', 'заполняемость')));

    scr.appendChild(h('button', {
      class: 'card tight row between', style: 'width:100%;text-align:left',
      onclick: () => UI.go('fans'),
    },
      h('div', { class: 'grow' },
        h('div', { class: 'tiny dim', text: 'ТРИБУНЫ' }),
        h('div', { class: 'small', text: S.Fans.moodLabel(club.fans.mood) + ' · ' + U.num(club.fans.members) + ' ' + U.plural(club.fans.members, ['абонемент', 'абонемента', 'абонементов']) }),
        h('div', { class: 'mood-gauge', style: 'margin-top:6px' },
          h('i', { style: 'width:100%' }),
          h('b', { style: 'left:calc(' + Math.round(club.fans.mood) + '% - 1.5px)' }))),
      h('span', { class: 'pill accent', text: Math.round(club.fans.mood) })));

    // траектория места по турам
    const log = club.positionLog || [];
    if (log.length >= 3) {
      const size = div.clubIds.length;
      scr.appendChild(h('div', { class: 'card' },
        h('div', { class: 'row between mb' },
          h('b', { text: 'Место по ходу сезона' }),
          h('span', { class: 'pill' + (pos <= 4 ? ' good' : ''), text: pos + '-е' })),
        S.Charts.line(log.map((r) => ({ x: r.p, y: r.pos })), {
          invert: true, minY: 1, maxY: size,
          ticks: [1, Math.round(size / 2), size],
          xFirst: 'тур 1', xLast: 'тур ' + log[log.length - 1].p,
          caption: 'выше — лучше; последняя точка — сегодня',
        })));
    }

    // форма
    scr.appendChild(h('div', { class: 'card tight row between mt' },
      h('div', null, h('div', { class: 'tiny dim', text: 'ФОРМА' }),
        h('div', { class: 'form-dots mt', style: 'margin-top:5px' },
          ...(club.form.slice(-6).map((f) => h('i', { class: f }))),
          ...(club.form.length ? [] : [h('span', { class: 'tiny dim', text: 'матчей пока нет' })]))),
      h('button', { class: 'btn sm ghost', onclick: () => UI.go('matches', 'table') }, 'Таблица')));

    // почта
    const inbox = (g.inbox || []).slice(0, 4);
    if (inbox.length) {
      scr.appendChild(h('div', { class: 'section-title', text: 'Сообщения' }));
      inbox.forEach((m) => {
        scr.appendChild(h('div', { class: 'card tight' },
          h('div', { class: 'row between', style: 'align-items:flex-start;gap:8px' },
            h('div', { class: 'grow small', text: m.text }),
            h('span', { class: 'tiny dim nowrap', text: 'н. ' + m.week }))));
      });
      if (g.inbox.length > 4) {
        scr.appendChild(h('button', { class: 'btn ghost full sm', onclick: () => UI.go('inbox') }, 'Все сообщения (' + g.inbox.length + ')'));
      }
      g.inbox.forEach((m) => { m.read = true; });
    }

    scr.appendChild(h('div', { class: 'section-title', text: 'Управление клубом' }));
    const grid = h('div', { class: 'btn-row', style: 'flex-wrap:wrap;gap:8px' });
    [['Трибуны', 'fans'], ['Арена', 'arena'], ['Спонсоры', 'sponsors'], ['Финансы', 'finance'], ['Сборная', 'national'], ['Настройки', 'settings']].forEach(([label, tab]) => {
      grid.appendChild(h('button', { class: 'btn', style: 'flex:1 1 44%', onclick: () => UI.go(tab) }, label));
    });
    scr.appendChild(grid);
    scr.appendChild(h('div', { class: 'tiny dim center mt', style: 'padding:10px 0 4px' },
      'Все клубы, лиги и спонсоры в игре вымышлены.'));
  }

  function stat(v, k) {
    return h('div', { class: 'st' }, h('div', { class: 'v', text: v }), h('div', { class: 'k', text: k }));
  }
  UI.stat = stat;

  function compLabel(fx) {
    if (fx.type === 'league') return 'Тур ' + fx.round;
    if (fx.type === 'cup') return fx.stage;
    if (fx.type === 'euro') return fx.stage;
    if (fx.type === 'playoff') return fx.stage;
    return 'Матч';
  }
  UI.compLabel = compLabel;

  function oppDesc(g, oppId) {
    const c = g.clubs[oppId];
    if (!c) {
      const e = Sn.team(g, oppId);
      return e ? e.country : '';
    }
    const div = g.divisions[c.division];
    const pos = W.sortTable(div).indexOf(c.id) + 1;
    return DIVISIONS[c.division].short + ' · ' + pos + '-е место';
  }

  /* ---------- экран «Состав» ---------- */
  function screenSquad(scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const sub = UI.sub.squad || 'six';
    scr.appendChild(h('div', { class: 'tabs' },
      ...[['six', 'Шестёрка'], ['roster', 'Заявка'], ['tactics', 'Тактика']].map(([id, label]) =>
        h('button', { class: 'tab' + (sub === id ? ' on' : ''), onclick: () => UI.go('squad', id) }, label))));
    if (sub === 'six') squadSix(scr, club);
    else if (sub === 'roster') squadRoster(scr, club);
    else squadTactics(scr, club);
  }

  /** схема расстановки: шесть зон + либеро */
  function squadSix(scr, club) {
    const g = UI.game;
    const problems = W.validateLineup(g, club);
    const lineup = club.lineup.map((id) => g.players[id]);
    const libero = club.liberoId ? g.players[club.liberoId] : null;

    scr.appendChild(h('div', { class: 'card' },
      h('div', { class: 'row between mb' },
        h('div', { class: 'small muted', text: 'Порядок ротации: №1 подаёт первым' }),
        h('button', { class: 'btn sm', onclick: () => { W.autoLineupAvailable(g, club); UI.render(); toast('Состав подобран автоматически'); } }, 'Авто')),
      h('div', { class: 'six-grid' },
        ...[3, 4, 5, 2, 1, 0].map((idx) => lineupSlot(club, idx, lineup[idx]))),
      h('div', { class: 'divider' }),
      h('div', { class: 'row between' },
        h('div', null,
          h('div', { class: 'tiny dim', text: 'ЛИБЕРО' }),
          h('div', { class: 'small', text: libero ? P.fullName(libero) + ' · ' + P.overall(libero) : 'не назначен' }),
          h('div', { class: 'tiny dim', text: 'меняет центрального на задней линии, не подаёт' })),
        h('button', { class: 'btn sm', onclick: () => pickLiberoModal(club) }, 'Выбрать'))));

    if (problems.length) {
      scr.appendChild(h('div', { class: 'card', style: 'border-color:rgba(248,113,113,.35)' },
        h('div', { class: 'tiny bad', text: 'ЗАЯВКА НЕ ПРОХОДИТ' }),
        ...problems.map((p) => h('div', { class: 'small', text: '• ' + p }))));
    }

    const foreigners = club.lineup.concat(club.liberoId ? [club.liberoId] : [])
      .map((id) => g.players[id]).filter((p) => p && p.foreign).length;
    scr.appendChild(h('div', { class: 'card tight row between' },
      h('div', { class: 'small' }, 'Легионеров на площадке: ',
        h('b', { class: foreigners > FOREIGN_LIMIT[club.division] ? 'bad' : 'good', text: foreigners + ' / ' + FOREIGN_LIMIT[club.division] })),
      h('span', { class: 'pill', text: DIVISIONS[club.division].short })));

    scr.appendChild(h('div', { class: 'card tight opt' },
      h('div', { class: 'grow' },
        h('div', { class: 'small', text: 'Авто-ротация состава' }),
        h('div', { class: 'tiny dim', text: 'тренер сам ставит свежих: реже усталость, но ваша шестёрка игнорируется' })),
      h('button', {
        class: 'switch' + (club.autoRotate !== false ? ' on' : ''),
        onclick: () => { club.autoRotate = club.autoRotate === false; UI.render(); },
      }, h('i'))));
  }

  function lineupSlot(club, idx, player) {
    const zone = S.Engine.ZONE_BY_OFFSET[idx];
    const front = S.Engine.FRONT_ZONES.includes(zone);
    return h('button', {
      class: 'p-row', onclick: () => pickPlayerModal(club, idx),
    },
      h('div', { class: 'row between' },
        h('span', { class: 'tiny dim', text: 'зона ' + zone }),
        h('span', { class: 'tiny dim', text: front ? 'сетка' : 'тыл' })),
      player
        ? h('div', { class: 'row', style: 'gap:5px' },
          h('span', { class: 'role-badge role-' + player.role, style: 'width:24px;height:24px;flex:0 0 24px;font-size:9px', text: ROLES[player.role].short }),
          h('span', { class: 'grow ellipsis', style: 'font-size:11.5px;font-weight:600', text: player.last }),
          h('span', { class: 'tiny ' + ovrClass(P.overall(player)), style: 'font-weight:800', text: P.overall(player) }))
        : h('div', { class: 'small dim', text: 'пусто' }),
      player ? freshBar(player) : null);
  }

  /** полоска свежести: чем длиннее и зеленее, тем меньше усталость */
  function freshBar(p) {
    const fresh = Math.round(100 - p.fatigue);
    const cls = fresh > 65 ? 'f-ok' : fresh > 35 ? 'f-mid' : 'f-low';
    return h('div', { class: 'bar' }, h('i', { class: cls, style: 'width:' + fresh + '%' }));
  }
  UI.freshBar = freshBar;

  function pickPlayerModal(club, idx) {
    const g = UI.game;
    modal('Кто в зоне ' + S.Engine.ZONE_BY_OFFSET[idx], (m) => {
      const squad = club.squad.map((id) => g.players[id])
        .filter((p) => p && p.role !== 'L')
        .sort((a, b) => P.overall(b) - P.overall(a));
      return squad.map((p) => {
        const used = club.lineup.indexOf(p.id);
        return h('button', {
          class: 'p-row' + (used === idx ? ' on' : '') + (p.injury > 0 ? ' injured' : ''),
          style: 'width:100%;margin-bottom:6px',
          onclick: () => {
            if (p.injury > 0) { toast('Игрок травмирован'); return; }
            const prev = club.lineup[idx];
            if (used >= 0) club.lineup[used] = prev;      // меняем местами
            club.lineup[idx] = p.id;
            m.close(); UI.render();
          },
        },
          h('span', { class: 'role-badge role-' + p.role, text: ROLES[p.role].short }),
          h('span', { class: 'grow' },
            h('div', { class: 'p-name', text: P.fullName(p) }),
            h('div', { class: 'p-meta', text: playerMeta(p) })),
          h('span', { class: 'ovr ' + ovrClass(P.overall(p)), text: P.overall(p) }));
      });
    });
  }

  function pickLiberoModal(club) {
    const g = UI.game;
    modal('Либеро', (m) => club.squad.map((id) => g.players[id])
      .filter((p) => p && p.role === 'L')
      .sort((a, b) => P.overall(b) - P.overall(a))
      .map((p) => h('button', {
        class: 'p-row' + (club.liberoId === p.id ? ' on' : '') + (p.injury > 0 ? ' injured' : ''),
        style: 'width:100%;margin-bottom:6px',
        onclick: () => { if (p.injury > 0) { toast('Игрок травмирован'); return; } club.liberoId = p.id; m.close(); UI.render(); },
      },
        h('span', { class: 'role-badge role-L', text: 'ЛБ' }),
        h('span', { class: 'grow' },
          h('div', { class: 'p-name', text: P.fullName(p) }),
          h('div', { class: 'p-meta', text: 'приём ' + p.skills.receive + ' · защита ' + p.skills.defense })),
        h('span', { class: 'ovr ' + ovrClass(P.overall(p)), text: P.overall(p) }))));
  }

  function abroadName(game, id) {
    const c = (game.euroClubs || []).find((x) => x.id === id);
    return c ? c.name + ' (' + c.country + ')' : 'зарубежный клуб';
  }
  UI.abroadName = abroadName;

  function playerMeta(p) {
    const parts = [p.age + ' лет'];
    if (p.foreign) parts.push(S.LANG_FLAG[p.lang] || 'легионер');
    if (p.youth) parts.push('академия');
    if (p.injury > 0) parts.push('травма ' + p.injury + ' нед.');
    parts.push('форма ' + Math.round(p.form));
    return parts.join(' · ');
  }
  UI.playerMeta = playerMeta;

  function squadRoster(scr, club) {
    const g = UI.game;
    const squad = club.squad.map((id) => g.players[id]).filter(Boolean);
    const order = ['S', 'OP', 'OH', 'MB', 'L'];
    const wage = Ec.wageBill(g, club);
    scr.appendChild(h('div', { class: 'card tight row between' },
      h('div', { class: 'small' }, 'Игроков: ', h('b', { text: squad.length }), ' · легионеров: ',
        h('b', { text: Tr.foreignCount(g, club) + '/' + FOREIGN_LIMIT[club.division] })),
      h('div', { class: 'small muted', text: U.money(wage) + '/мес' })));
    order.forEach((role) => {
      const list = squad.filter((p) => p.role === role).sort((a, b) => P.overall(b) - P.overall(a));
      if (!list.length) return;
      scr.appendChild(h('div', { class: 'section-title', text: ROLES[role].name }));
      const box = h('div', { class: 'plist' });
      list.forEach((p) => box.appendChild(playerRow(p, club)));
      scr.appendChild(box);
    });
  }

  function playerRow(p, club) {
    const inSix = club && (club.lineup.includes(p.id) || club.liberoId === p.id);
    return h('button', {
      class: 'p-row' + (p.injury > 0 ? ' injured' : ''), style: 'width:100%;text-align:left',
      onclick: () => UI.playerCard(p),
    },
      h('span', { class: 'role-badge role-' + p.role, text: ROLES[p.role].short }),
      h('span', { class: 'grow' },
        h('div', { class: 'p-name' }, P.fullName(p), inSix ? h('span', { class: 'accent', text: ' •' }) : null),
        h('div', { class: 'p-meta', text: playerMeta(p) })),
      h('span', { style: 'width:54px' },
        h('div', { class: 'tiny dim center', text: 'свежесть' }),
        freshBar(p)),
      h('span', { class: 'ovr ' + ovrClass(P.overall(p)), text: P.overall(p) }));
  }
  UI.playerRow = playerRow;

  /** карточка игрока: навыки, контракт, действия */
  UI.playerCard = function (p, opts = {}) {
    const g = UI.game;
    const club = g.clubs[p.clubId];
    const mine = p.clubId === g.playerClubId;
    modal(P.fullName(p), (m) => {
      const skills = P.SKILLS.map((k) => h('div', { class: 'mb' },
        h('div', { class: 'row between tiny' },
          h('span', { class: 'muted', text: P.SKILL_NAMES[k] }),
          h('b', { text: p.skills[k] })),
        h('div', { class: 'bar' }, h('i', { style: 'width:' + p.skills[k] + '%' }))));
      const st = p.season;
      const nodes = [
        h('div', { class: 'row between mb' },
          h('div', null,
            h('span', { class: 'pill accent', text: ROLES[p.role].name }),
            h('span', { class: 'pill', style: 'margin-left:6px', text: p.age + ' лет' }),
            h('span', { class: 'pill', style: 'margin-left:6px' },
              S.Flags.byLang(p.lang, 15),
              h('span', { style: 'margin-left:5px', text: S.LANG_FLAG[p.lang] || 'RUS' }))),
          h('span', { class: 'ovr ' + ovrClass(P.overall(p)), style: 'width:44px;height:38px;font-size:17px', text: P.overall(p) })),
        club ? h('div', { class: 'small muted mb', text: 'Клуб: ' + club.name })
          : p.abroadClub ? h('div', { class: 'small muted mb' }, 'Клуб: ',
            h('b', abroadName(g, p.abroadClub)), h('span', { class: 'teal', text: ' · зарубежный клуб' }))
            : h('div', { class: 'small muted mb', text: 'Свободный агент' }),
        p.injury > 0 ? h('div', { class: 'card tight bad small', text: 'Травма: ' + (p.injuryNote || 'повреждение') + ', ещё ' + p.injury + ' нед.' }) : null,
        h('div', { class: 'stat-grid mb' },
          stat(P.overall(p) + '', 'рейтинг'),
          stat(p.potential + '', 'потенциал'),
          stat(Math.round(p.stamina) + '', 'выносл.')),
        h('div', { class: 'section-title', style: 'margin-left:0', text: 'Навыки' }),
        skillRadar(p),
        ...skills,
        h('div', { class: 'section-title', style: 'margin-left:0', text: 'Сезон' }),
        h('div', { class: 'stat-grid mb' },
          stat(st.points + '', 'очки'),
          stat(st.kills + '/' + st.attacks, 'атака'),
          stat(st.blocks + '', 'блоки')),
        h('div', { class: 'stat-grid mb' },
          stat(st.aces + '', 'эйсы'),
          stat(st.digs + '', 'защита'),
          stat(st.matches + '', 'матчи')),
        h('div', { class: 'card flat tight' },
          h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Зарплата'), h('b', U.money(p.contract.wage) + '/мес')),
          h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Контракт'), h('b', p.contract.years + ' ' + U.plural(p.contract.years, ['сезон', 'сезона', 'сезонов']))),
          h('div', { class: 'row between small' }, h('span', { class: 'muted' }, 'Оценка стоимости'), h('b', U.money(P.valueFor(p))))),
      ];
      if (opts.actions) nodes.push(opts.actions(m));
      else if (mine) {
        nodes.push(h('div', { class: 'btn-row mt' },
          h('button', {
            class: 'btn', onclick: () => { m.close(); UI.sellModal(p); },
          }, 'Продать'),
          h('button', {
            class: 'btn danger', onclick: () => {
              m.close();
              confirmDialog('Отпустить игрока?', 'Придётся выплатить компенсацию по контракту.', () => {
                const r = Tr.release(g, p.id);
                toast(r.ok ? 'Контракт расторгнут: −' + U.money(r.payoff) : r.reason);
                UI.render();
              }, 'Отпустить');
            },
          }, 'Отпустить')));
      }
      return nodes;
    });
  };

  /** радар навыков игрока против среднего по своему амплуа в составе */
  function skillRadar(p) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const axes = P.SKILLS.map((k) => P.SKILL_NAMES[k]);
    const mine = P.SKILLS.map((k) => p.skills[k]);
    const peers = (club ? club.squad.map((id) => g.players[id]) : [])
      .filter((x) => x && x.role === p.role && x.id !== p.id);
    const series = [{ values: mine, color: S.Charts.C1, label: P.shortName(p) }];
    if (peers.length) {
      series.unshift({
        values: P.SKILLS.map((k) => Math.round(U.avg(peers, (x) => x.skills[k]))),
        color: S.Charts.C2, fill: false, dots: false, label: 'средний ' + ROLES[p.role].name.toLowerCase() + ' состава',
      });
    }
    const box = h('div');
    box.appendChild(S.Charts.radar(axes, series));
    box.appendChild(S.Charts.legend(series.map((x) => ({ color: x.color, label: x.label }))));
    return box;
  }

  /* ---------- тактика ---------- */
  function squadTactics(scr, club) {
    const g = UI.game;
    const T = S.Engine.TACTICS;
    const groups = [
      ['serve', 'Подача', 'Силовая даёт эйсы и ошибки, надёжная — стабильность.'],
      ['receive', 'Приём', 'Вдвоём — чище зона приёма, но выше нагрузка на доигровщиков.'],
      ['block', 'Блок', 'Ловля центра закрывает первый темп, но открывает края.'],
      ['tempo', 'Атака', 'Куда идёт основной объём мяча.'],
    ];
    groups.forEach(([key, title, desc]) => {
      const seg = h('div', { class: 'seg' });
      T[key].forEach((opt) => {
        seg.appendChild(h('button', {
          class: club.tactics[key] === opt.id ? 'on' : '',
          onclick: () => { club.tactics[key] = opt.id; UI.render(); },
        }, opt.name));
      });
      scr.appendChild(h('div', { class: 'card' },
        h('div', { class: 'row between mb' }, h('b', { text: title })),
        seg,
        h('div', { class: 'tiny dim mt', text: desc })));
    });
    scr.appendChild(h('div', { class: 'card' },
      h('div', { class: 'tiny dim', text: 'КАК ЭТО РАБОТАЕТ' }),
      h('div', { class: 'small muted', text: 'Каждое очко считается по фазам: подача пробивает приём, качество приёма задаёт пас связующего, атака пробивает блок и защиту. Ротация настоящая — рейтинг участвует тот, чей игрок сейчас в нужной зоне.' })));
  }

  /* ---------- почта ---------- */
  function screenInbox(scr) {
    const g = UI.game;
    scr.appendChild(pageHeader('Сообщения', 'club'));
    if (!g.inbox.length) { scr.appendChild(h('div', { class: 'empty', text: 'Пока пусто.' })); return; }
    g.inbox.slice(0, 60).forEach((m) => {
      scr.appendChild(h('div', { class: 'card tight' },
        h('div', { class: 'tiny dim', text: 'неделя ' + m.week }),
        h('div', { class: 'small', text: m.text })));
    });
  }

  /* ---------- настройки ---------- */
  function screenSettings(scr) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    scr.appendChild(pageHeader('Настройки', 'club'));

    scr.appendChild(h('div', { class: 'card' },
      optSwitch('Звук', 'гул трибун, удары, свисток', g.settings.sound, (v) => {
        g.settings.sound = v; S.Audio.setEnabled(v); S.Save.saveSettings(g.settings);
      }),
      optSwitch('Текстовый комментарий', 'подробный разбор розыгрышей в матче', g.settings.commentary !== false, (v) => {
        g.settings.commentary = v; S.Save.saveSettings(g.settings);
      }),
      optSwitch('Кадр перед матчем', 'дворец спорта снаружи: город, парковка и погода', g.settings.intro !== false, (v) => {
        g.settings.intro = v; S.Save.saveSettings(g.settings);
      })));

    scr.appendChild(h('div', { class: 'section-title', text: 'Тема' }));
    const themeSeg = h('div', { class: 'seg' });
    [['system', 'Системная'], ['dark', 'Тёмная'], ['light', 'Светлая']].forEach(([id, label]) => {
      themeSeg.appendChild(h('button', {
        class: (g.settings.theme || 'system') === id ? 'on' : '',
        onclick: () => { g.settings.theme = id; UI.applyTheme(); S.Save.saveSettings(g.settings); UI.render(); },
      }, label));
    });
    scr.appendChild(h('div', { class: 'card' }, themeSeg,
      h('div', { class: 'tiny dim mt', text: 'Тёмная — «как в зале», светлая удобнее днём на улице.' })));

    scr.appendChild(h('div', { class: 'section-title', text: 'Скорость просмотра матча' }));
    const seg = h('div', { class: 'seg' });
    [['slow', 'Медленно'], ['fast', 'Обычно'], ['turbo', 'Быстро']].forEach(([id, label]) => {
      seg.appendChild(h('button', {
        class: g.settings.speed === id ? 'on' : '',
        onclick: () => { g.settings.speed = id; S.Save.saveSettings(g.settings); UI.render(); },
      }, label));
    });
    scr.appendChild(h('div', { class: 'card' }, seg));

    scr.appendChild(h('div', { class: 'section-title', text: 'Редактор клуба' }));
    scr.appendChild(h('div', { class: 'card' },
      h('div', { class: 'small muted mb', text: 'Лига и клубы вымышленные. Названия можно переписать под себя — например, под реальные команды, которые вы знаете.' }),
      h('button', { class: 'btn full', onclick: () => renameModal(club) }, 'Переименовать клуб'),
      h('button', { class: 'btn full mt', onclick: () => kitModal(club) }, 'Форма и эмблема'),
      h('button', { class: 'btn full mt', onclick: () => renameAllModal() }, 'Все клубы лиги')));

    scr.appendChild(h('div', { class: 'section-title', text: 'Партия' }));
    scr.appendChild(h('div', { class: 'card' },
      h('button', { class: 'btn full', onclick: () => { S.Save.save(g); toast('Партия сохранена'); } }, 'Сохранить'),
      h('button', { class: 'btn full mt', onclick: () => UI.go('history') }, 'История клуба'),
      h('button', { class: 'btn full mt', onclick: () => UI.changeClubScreen() }, 'Сменить клуб'),
      h('button', {
        class: 'btn full danger mt', onclick: () => confirmDialog('Начать заново?', 'Текущая карьера будет удалена.', () => {
          S.Save.clear(); location.reload();
        }, 'Удалить карьеру'),
      }, 'Новая карьера')));

    scr.appendChild(h('div', { class: 'tiny dim center', style: 'padding:14px 6px' },
      'Volleyball Manager · менеджер волейбольного клуба. Игра сохраняется в памяти браузера. ' +
      'Тренера здесь не увольняют: совет может быть недоволен, но карьеру вы заканчиваете сами.'));
  }

  function optSwitch(title, desc, value, onChange) {
    const sw = h('button', { class: 'switch' + (value ? ' on' : '') }, h('i'));
    sw.addEventListener('click', () => {
      value = !value;
      sw.className = 'switch' + (value ? ' on' : '');
      onChange(value);
    });
    return h('div', { class: 'opt' },
      h('div', { class: 'grow' }, h('div', { class: 'small', text: title }), h('div', { class: 'tiny dim', text: desc })),
      sw);
  }

  function renameModal(club) {
    const g = UI.game;
    modal('Переименовать клуб', (m) => {
      const nm = h('input', { class: 'btn full', style: 'text-align:left', value: club.baseName });
      const city = h('input', { class: 'btn full mt', style: 'text-align:left', value: club.city });
      return [
        h('div', { class: 'small muted mb', text: 'Название и город клуба.' }),
        nm, city,
        h('button', {
          class: 'btn primary full mt', onclick: () => {
            const hadTitle = club.finance.sponsors.find((s) => s.rename);
            club.baseName = nm.value.trim() || club.baseName;
            club.city = city.value.trim() || club.city;
            club.name = hadTitle ? hadTitle.brand + ' ' + club.city : club.baseName;
            m.close(); UI.render(); toast('Клуб переименован');
          },
        }, 'Сохранить'),
      ];
    });
  }

  /** редактор формы: цвет, рисунок майки и форма эмблемы с живым превью */
  function kitModal(club) {
    const I = S.Identity;
    const id = I.of(club);
    const draft = Object.assign({}, id);
    modal('Форма и эмблема', (m) => {
      const preview = h('div', { class: 'row center', style: 'gap:16px;justify-content:center;padding:6px 0 14px' });
      const redraw = () => {
        preview.innerHTML = '';
        const saved = club.identity;
        club.identity = draft;
        preview.appendChild(S.Crest.crestNode(club, 74));
        const shirt = S.Crest.shirtSvg({ shirt: draft.primary, trim: draft.secondary, pattern: draft.pattern }, 74);
        preview.appendChild(shirt);
        club.identity = saved;
      };
      redraw();
      const colorRow = h('div', { class: 'row wrap', style: 'gap:8px' });
      I.PALETTE.forEach((pal) => {
        colorRow.appendChild(h('button', {
          class: 'swatch' + (draft.primary === pal.primary ? ' on' : ''),
          style: 'background:' + pal.primary,
          title: pal.name,
          onclick: () => {
            draft.primary = pal.primary; draft.secondary = pal.trim; draft.palette = pal.name;
            draft.ink = I.inkOn(pal.primary);
            m.refresh();
          },
        }));
      });
      const patternRow = h('div', { class: 'seg' });
      const patternNames = { solid: 'Сплошная', stripes: 'Полосы', sash: 'Диагональ', hoop: 'Обруч', split: 'Пополам' };
      I.PATTERNS.forEach((p) => {
        patternRow.appendChild(h('button', {
          class: draft.pattern === p ? 'on' : '',
          onclick: () => { draft.pattern = p; m.refresh(); },
        }, patternNames[p]));
      });
      const crestRow = h('div', { class: 'seg' });
      const crestNames = { shield: 'Щит', circle: 'Круг', diamond: 'Ромб', hex: 'Шестигр.' };
      I.CRESTS.forEach((cr) => {
        crestRow.appendChild(h('button', {
          class: draft.crest === cr ? 'on' : '',
          onclick: () => { draft.crest = cr; m.refresh(); },
        }, crestNames[cr]));
      });
      const mono = h('input', {
        class: 'btn full', style: 'text-align:center;letter-spacing:.1em', maxlength: 3, value: draft.monogram,
        oninput: (e) => { draft.monogram = e.target.value.toUpperCase().slice(0, 3) || draft.monogram; },
        onchange: () => m.refresh(),
      });
      return [
        preview,
        h('div', { class: 'section-title', style: 'margin-left:0', text: 'Цвет' }), colorRow,
        h('div', { class: 'section-title', style: 'margin-left:0', text: 'Рисунок майки' }), patternRow,
        h('div', { class: 'section-title', style: 'margin-left:0', text: 'Форма эмблемы' }), crestRow,
        h('div', { class: 'section-title', style: 'margin-left:0', text: 'Монограмма' }), mono,
        h('button', {
          class: 'btn primary full mt', onclick: () => {
            const changed = draft.primary !== id.primary || draft.pattern !== id.pattern;
            club.identity = draft;
            // новая форма — новая волна продаж в магазине
            if (changed) S.Economy.merchSpike(g, club, 0.25);
            m.close(); UI.render();
            toast(changed ? 'Новая форма в продаже' : 'Форма обновлена');
          },
        }, 'Сохранить'),
      ];
    });
  }

  function renameAllModal() {
    const g = UI.game;
    modal('Клубы лиги', (m) => {
      const list = Object.values(g.clubs).sort((a, b) => a.division - b.division || a.name.localeCompare(b.name));
      return list.map((c) => {
        const inp = h('input', {
          class: 'btn grow', style: 'text-align:left;min-height:38px',
          value: c.baseName,
          onchange: (e) => {
            const v = e.target.value.trim();
            if (!v) return;
            const titled = c.finance.sponsors.find((s) => s.rename);
            c.baseName = v;
            c.name = titled ? titled.brand + ' ' + c.city : v;
          },
        });
        return h('div', { class: 'row mb', style: 'gap:8px' },
          h('span', { class: 'pill', style: 'flex:0 0 46px', text: DIVISIONS[c.division].short }), inp);
      }).concat([h('button', { class: 'btn primary full mt', onclick: () => { m.close(); UI.render(); toast('Названия обновлены'); } }, 'Готово')]);
    });
  }

  S.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
