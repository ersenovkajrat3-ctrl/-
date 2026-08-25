/* Volleyball Manager — просмотр матча: схематичный корт сверху, текстовый комментарий и звук.
   3D не нужен: движок и так считает каждый розыгрыш по фазам, а показать это дешевле всего
   шестью точками по зонам ротации, дугой мяча и репликой комментатора. */
(function (global) {
  const S = global.SETKA;
  const { U, ROLES } = S;
  const P = S.Players, Sn = S.Season, W = S.World, Ec = S.Economy;
  const UI = S.UI, h = UI.h;

  const SPEED = { slow: 1500, fast: 750, turbo: 260 };

  const ZONE_POS = { // координаты зон на своей половине (x, y от сетки)
    4: [0.20, 0.33], 3: [0.50, 0.26], 2: [0.80, 0.33],
    5: [0.19, 0.72], 6: [0.50, 0.82], 1: [0.81, 0.72],
  };

  let live = null;

  /* ---------- запуск матча ---------- */
  UI.playMatch = function (fx, mode) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const problems = W.validateLineup(g, club);
    if (problems.length && club.autoRotate === false) {
      UI.toast(problems[0]);
      UI.go('squad', 'six');
      return;
    }
    const match = Sn.createMatch(g, fx);
    if (!match) { Sn.playFixture(g, fx); afterFixture(fx); return; }
    if (mode === 'instant') {
      match.runToEnd();
      Sn.finalizeMatch(g, fx, match);
      Sn.applyFixtureResult(g, fx);
      showResult(fx, match, true);
      return;
    }
    openLive(fx, match);
  };

  function playerSideOf(match) {
    const g = UI.game;
    return match.home.clubId === g.playerClubId ? match.home : match.away;
  }

  /* ---------- живой просмотр ---------- */
  function openLive(fx, match) {
    const g = UI.game;
    const ov = document.getElementById('overlay');
    ov.hidden = false;
    ov.innerHTML = '';
    const me = playerSideOf(match);
    const isHome = me === match.home;
    const att = fx.attendanceHint || (g.clubs[fx.h] ? Ec.attendance(g, g.clubs[fx.h], Sn.team(g, fx.a)) : { fill: 0.6 });

    if (g.settings.sound) { S.Audio.resume(); S.Audio.startCrowd(att.fill); }

    const head = h('div', { class: 'm-head' });
    const courtWrap = h('div', { class: 'court-wrap' });
    const statsBox = h('div', { class: 'live-stats' });
    const logBox = h('div', { class: 'm-log' });
    const ctrl = h('div', { class: 'm-ctrl' });
    ov.append(head, courtWrap, statsBox, logBox, ctrl);

    const myClub = g.clubs[g.playerClubId];
    const tvFor = myClub && fx.type !== 'friendly' && (fx.h === g.playerClubId || fx.type === 'euro' || fx.neutral)
      ? Ec.televised(g, myClub, fx, Sn.team(g, fx.h === g.playerClubId ? fx.a : fx.h)) : null;
    live = {
      fx, match, me, isHome, opp: isHome ? match.away : match.home, tv: tvFor,
      support: fx.support != null ? fx.support : (g.clubs[fx.h] ? S.Fans.support(g, g.clubs[fx.h], att.fill) : 0.5),
      statsBox, statsOpen: false,
      playing: true, timer: null, ov, head, courtWrap, logBox, ctrl,
      fill: att.fill, speed: g.settings.speed || 'fast',
    };

    // цвета табло берём из формы клубов
    const kitsHead = S.Identity.matchKits(g.clubs[fx.h], g.clubs[fx.a]);
    live.meColor = isHome ? kitsHead.home.shirt : kitsHead.away.shirt;
    live.oppColor = isHome ? kitsHead.away.shirt : kitsHead.home.shirt;
    drawHead();
    drawCourt();
    drawStats();
    drawControls();
    // перед свистком — кадр снаружи: город, арена и погода этого месяца
    showIntro(fx, att.fill);
    // с чего начинается матч: за окном месяц и погода, в зале — трибуны
    const wxIntro = S.Weather.forFixture(g, fx);
    pushLine('evt', wxWelcome(wxIntro) + ' Зал заполнен на ' + Math.round(live.fill * 100) + '%.', '');
    if (live.tv) {
      pushLine('evt', 'Матч показывает ' + live.tv.channel + '. Права на трансляцию — ' + U.money(live.tv.fee) + ' в кассу клуба.', '');
    }
    pushLine('evt', 'Стартовый свисток. ' + Sn.teamName(g, fx.h) + ' принимает ' + Sn.teamName(g, fx.a) + '.', '');
    if (g.settings.sound) S.Audio.whistle(false);
    schedule();
  }

  /** вступительный кадр: дворец спорта снаружи, соперники и погода. Тап — пропустить. */
  function showIntro(fx, fill) {
    const g = UI.game;
    if (!S.Exterior || g.settings.intro === false) return;
    const homeClub = g.clubs[fx.h];
    if (!homeClub) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wx = S.Weather.forFixture(g, fx);
    // «Финал четырёх» играют в чужом городе: и зал, и цвета на фасаде не наши
    const neutral = fx.neutral && fx.host
      ? {
        city: fx.host.city, accent: '#2f6fd0', capacity: 12000, flagCode: fx.host.code,
        title: fx.stage + ' · ' + fx.host.city + ', ' + fx.host.country,
        arena: { stands: 5, vip: 3, media: 3, base: 2, service: 2, shop: 2 },
      }
      : null;
    const venue = neutral
      ? fx.host.city + ', ' + fx.host.country
      : Ec.arenaName(homeClub);
    const intro = h('div', { class: 'ex-intro' },
      h('div', { class: 'inner' },
        h('div', { class: 'row between mb' },
          h('span', { class: 'pill accent', text: UI.compLabel(fx) }),
          live.tv ? h('span', { class: 'on-air' }, h('i'), live.tv.short + ' · в эфире') : null),
        S.Exterior.scene(g, homeClub, Object.assign({ weather: wx, fill, tv: !!live.tv }, neutral || {})),
        h('div', { class: 'vs-line' },
          h('span', { class: 'ellipsis', text: Sn.teamName(g, fx.h) }),
          h('span', { class: 'dim', text: '—' }),
          h('span', { class: 'ellipsis', text: Sn.teamName(g, fx.a) })),
        h('div', { class: 'tap' },
          h('div', { text: venue + ' · начало в ' + wx.timeLabel }),
          h('div', { class: 'mt-xs', text: 'коснитесь, чтобы пропустить' }))));
    live.ov.appendChild(intro);
    const close = () => {
      if (!intro.parentNode) return;
      intro.remove();
      clearTimeout(live.introTimer);
      live.introTimer = null;
      schedule();
    };
    intro.addEventListener('click', close);
    live.introTimer = setTimeout(close, reduce ? 700 : 2600);
    live.intro = intro;
  }

  function schedule() {
    if (!live) return;
    if (live.intro && live.intro.parentNode) return;   // ждём, пока уйдёт вступительный кадр
    clearTimeout(live.timer);
    if (!live.playing || live.match.finished) return;
    live.timer = setTimeout(tick, SPEED[live.speed] || 750);
  }

  function tick() {
    if (!live || live.match.finished) return;
    const g = UI.game;
    const r = live.match.step();
    if (!r) return;
    renderRally(r);
    drawHead();
    drawCourt(r);
    maybeChant(r);
    drawStats();
    if (r.setEnded && !r.matchEnded) {
      pushLine('evt', 'Сет ' + (r.record.set) + ' завершён: ' + live.match.log.setScores[live.match.log.setScores.length - 1].join(':') + '.', '');
      if (g.settings.sound) S.Audio.whistle(true);
    }
    if (r.matchEnded) {
      finishLive();
      return;
    }
    drawControls();
    schedule();
  }

  function finishLive() {
    const g = UI.game;
    const { fx, match } = live;
    Sn.finalizeMatch(g, fx, match);
    Sn.applyFixtureResult(g, fx);
    const won = (fx.h === g.playerClubId) === (fx.result.score[0] > fx.result.score[1]);
    if (g.settings.sound) { S.Audio.whistle(true); S.Audio.crowdReact(won, 1.5); if (won) S.Audio.stinger('win'); }
    drawHead();
    live.playing = false;
    clearTimeout(live.timer);
    if (live.boardTimer) { clearInterval(live.boardTimer); live.boardTimer = null; }
    drawControls(true);
    pushLine('evt', won ? 'Победа! ' + fx.result.score.join(':') : 'Поражение ' + fx.result.score.join(':'), '');
  }

  /* ---------- арена-табло ---------- */
  /* Сегментные цифры как на настоящем табло: восемь сегментов, погашенные видно тускло. */
  const SEG = {
    a: { x: 3, y: 0.7, w: 6, h: 2.2 },
    g: { x: 3, y: 8.9, w: 6, h: 2.2 },
    d: { x: 3, y: 17.1, w: 6, h: 2.2 },
    f: { x: 0.7, y: 2.2, w: 2.2, h: 7 },
    b: { x: 9.1, y: 2.2, w: 2.2, h: 7 },
    e: { x: 0.7, y: 10.8, w: 2.2, h: 7 },
    c: { x: 9.1, y: 10.8, w: 2.2, h: 7 },
  };
  const DIGITS = {
    0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd',
    6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  };

  function segNumber(value, size, color) {
    const str = String(Math.max(0, value | 0));
    const w = 12, gap = 2.4, boxH = 20;
    const g = svgEl('g', {});
    str.split('').forEach((ch, i) => {
      const on = DIGITS[ch] || '';
      const dg = svgEl('g', { transform: 'translate(' + (i * (w + gap)) + ' 0)' });
      Object.keys(SEG).forEach((k) => {
        const r = SEG[k];
        dg.appendChild(svgEl('rect', {
          x: r.x, y: r.y, width: r.w, height: r.h, rx: 1.05,
          fill: color, opacity: on.indexOf(k) >= 0 ? 1 : 0.11,
        }));
      });
      g.appendChild(dg);
    });
    const totalW = str.length * w + (str.length - 1) * gap;
    const svg = svgEl('svg', {
      viewBox: '0 0 ' + totalW + ' ' + boxH,
      width: (size * totalW / boxH).toFixed(1), height: size, class: 'seg',
    });
    svg.appendChild(g);
    return svg;
  }

  /* Клуб игрока всегда слева на табло и внизу на корте — так не путаешься, за кого играешь. */
  function drawHead() {
    const g = UI.game, m = live.match;
    const me = live.me, opp = live.opp;
    const meColor = live.meColor || '#ff9f1c';
    const oppColor = live.oppColor || '#2dd4bf';
    live.head.innerHTML = '';

    const side = (s, color, right) => h('div', { class: 'sb-team' + (right ? ' right' : '') },
      h('div', { class: 'sb-name ellipsis', text: s.name }),
      h('div', { class: 'sb-sets' },
        ...[0, 1, 2].map((i) => h('i', { class: 'pip' + (s.sets > i ? ' on' : ''), style: s.sets > i ? 'background:' + color : '' })),
        h('span', { class: 'tiny dim', style: 'margin-left:6px', text: 'сеты' })),
      h('div', { class: 'sb-to' },
        ...[0, 1].map((i) => h('i', { class: 'dot' + (s.timeouts > i ? ' on' : '') })),
        h('span', { class: 'tiny dim', style: 'margin-left:5px', text: 'тайм-ауты' })));

    const board = h('div', { class: 'scoreboard' },
      side(me, meColor, false),
      h('div', { class: 'sb-score' },
        h('div', { class: 'sb-digits' },
          h('span', { class: 'sb-num' + (m.serving === me ? ' serving' : '') }, segNumber(me.points, 30, meColor)),
          h('span', { class: 'sb-colon' }, ':'),
          h('span', { class: 'sb-num' + (m.serving === opp ? ' serving' : '') }, segNumber(opp.points, 30, oppColor))),
        h('div', { class: 'tiny dim center', text: 'сет ' + m.setNo + (m.setNo === 5 ? ' · до 15' : '') })),
      side(opp, oppColor, true));
    live.head.appendChild(board);

    // сыгранные сеты
    if (m.log.setScores.length) {
      const sets = h('div', { class: 'm-sets' });
      m.log.setScores.forEach((sc, i) => {
        const mine = live.isHome ? sc[0] : sc[1];
        const theirs = live.isHome ? sc[1] : sc[0];
        sets.appendChild(h('span', { class: 'st' + (mine > theirs ? ' won' : ''), text: (i + 1) + ': ' + mine + '–' + theirs }));
      });
      live.head.appendChild(sets);
    }

    // лента розыгрышей текущего сета: видно, где шли серии
    const strip = h('div', { class: 'rally-strip' });
    (m.setLog.rallies || []).slice(-60).forEach((r) => {
      const mine = (r.winner === 'h') === live.isHome;
      strip.appendChild(h('i', { class: mine ? 'us' : 'them' }));
    });
    live.head.appendChild(strip);

    const wx = S.Weather.forFixture(UI.game, live.fx);
    live.head.appendChild(h('div', { class: 'row between mt-xs' },
      UI.wxChip(wx),
      live.tv
        ? h('span', { class: 'on-air' }, h('i'), live.tv.short + ' · в эфире')
        : h('span', { class: 'tiny dim', text: 'за стенами зала' })));

    if (live.isHome) {
      const sup = Math.round((live.support != null ? live.support : 0.5) * 100);
      live.head.appendChild(h('div', { class: 'support-meter' },
        h('span', { class: 'tiny dim', text: 'трибуны' }),
        h('div', { class: 'bar' }, h('i', { style: 'width:' + sup + '%' })),
        h('span', { class: 'tiny dim', text: sup + '%' })));
    }
  }

  /** живая статистика шестёрки: обновляется прямо по ходу матча */
  function drawStats() {
    if (!live.statsBox) return;
    const box = live.statsBox;
    box.innerHTML = '';
    if (!live.statsOpen) return;
    const rows = live.me.onCourt().map((slot) => slot.player);
    const head = h('div', { class: 'stat-row head' },
      h('span', { class: 'grow', text: 'на площадке' }),
      h('span', { text: 'очк' }), h('span', { text: 'атк' }), h('span', { text: 'блк' }), h('span', { text: 'эйс' }));
    box.appendChild(head);
    rows.sort((a, b) => (b.st.points || 0) - (a.st.points || 0)).forEach((p) => {
      box.appendChild(h('div', { class: 'stat-row' },
        h('span', { class: 'grow ellipsis' },
          h('b', { class: 'role-' + p.role, text: ROLES[p.role].short + ' ' }), P.shortName(p)),
        h('span', null, h('b', { text: p.st.points || 0 })),
        h('span', { text: (p.st.kills || 0) + '/' + (p.st.attacks || 0) }),
        h('span', { text: p.st.blocks || 0 }),
        h('span', { text: p.st.aces || 0 })));
    });
  }

  /* ---------- погода ---------- */
  /* Маленькая иконка к строке «октябрь · +5°, дождь»: та же погода, что и за стенами зала. */
  const WX_ICON = {
    clear: '<circle cx="8" cy="8" r="3.4" fill="#ffc861"/><g stroke="#ffc861" stroke-width="1.3" stroke-linecap="round"><path d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3.1 3.1l1.3 1.3M11.6 11.6l1.3 1.3M12.9 3.1l-1.3 1.3M4.4 11.6l-1.3 1.3"/></g>',
    cloud: '<path d="M4.4 12h7.2a2.9 2.9 0 00.3-5.8A4.2 4.2 0 004 6.6 2.7 2.7 0 004.4 12z" fill="#9fb0c8"/>',
    rain: '<path d="M4.4 9.6h7.2a2.7 2.7 0 00.3-5.4A4 4 0 004 4.5a2.6 2.6 0 00.4 5.1z" fill="#8fa3bd"/><g stroke="#6fb3ee" stroke-width="1.3" stroke-linecap="round"><path d="M5.4 11.6l-.9 2.4M8.2 11.6l-.9 2.4M11 11.6l-.9 2.4"/></g>',
    shower: '<path d="M4.4 9.2h7.2a2.7 2.7 0 00.3-5.4A4 4 0 004 4.1a2.6 2.6 0 00.4 5.1z" fill="#7f95b2"/><g stroke="#4ea2ea" stroke-width="1.5" stroke-linecap="round"><path d="M5.1 10.9l-1.2 3.2M8.1 10.9l-1.2 3.2M11.1 10.9l-1.2 3.2"/></g>',
    sleet: '<path d="M4.4 9.4h7.2a2.7 2.7 0 00.3-5.4A4 4 0 004 4.3a2.6 2.6 0 00.4 5.1z" fill="#8fa3bd"/><g stroke="#6fb3ee" stroke-width="1.3" stroke-linecap="round"><path d="M5.4 11.4l-.9 2.4M10.6 11.4l-.9 2.4"/></g><circle cx="8" cy="13" r="1.15" fill="#eaf3ff"/>',
    snow: '<path d="M4.4 9.2h7.2a2.7 2.7 0 00.3-5.4A4 4 0 004 4.1a2.6 2.6 0 00.4 5.1z" fill="#a8bcd6"/><g fill="#eaf3ff"><circle cx="5.2" cy="12.4" r="1.15"/><circle cx="8" cy="13.6" r="1.15"/><circle cx="10.8" cy="12.4" r="1.15"/></g>',
    blizzard: '<g stroke="#cfe0f4" stroke-width="1.3" stroke-linecap="round"><path d="M2 5h9.5M2 8.4h7M2 11.8h10"/></g><g fill="#eaf3ff"><circle cx="13.4" cy="5" r="1.2"/><circle cx="10.2" cy="8.4" r="1.2"/><circle cx="13.8" cy="11.8" r="1.2"/></g>',
    frost: '<g stroke="#bcdcf5" stroke-width="1.25" stroke-linecap="round"><path d="M8 1.6v12.8M2.5 4.8l11 6.4M13.5 4.8l-11 6.4"/></g><circle cx="8" cy="8" r="1.5" fill="#eaf6ff"/>',
    thaw: '<path d="M4.4 9.4h7.2a2.7 2.7 0 00.3-5.4A4 4 0 004 4.3a2.6 2.6 0 00.4 5.1z" fill="#9fb0c8"/><g stroke="#7fc6f0" stroke-width="1.3" stroke-linecap="round"><path d="M5.6 11.5l-.7 2.3M8.4 11.5l-.7 2.3"/></g><path d="M10.6 11.6h3" stroke="#cfe0f4" stroke-width="1.3" stroke-linecap="round"/>',
    bloom: '<circle cx="8" cy="8" r="3" fill="#ffd479"/><g fill="#f7d7e4"><ellipse cx="2.6" cy="4.2" rx="1.5" ry="1"/><ellipse cx="13" cy="6" rx="1.5" ry="1"/><ellipse cx="4" cy="12.6" rx="1.5" ry="1"/></g>',
  };

  function wxIcon(wx, size) {
    const el = svgEl('svg', { viewBox: '0 0 16 16', width: size || 15, height: size || 15 });
    el.innerHTML = WX_ICON[wx.kind] || WX_ICON.cloud;
    return el;
  }

  /** «октябрь · +5°, дождь» с иконкой — в шапке матча и в карточке ближайшего тура */
  UI.wxChip = function (wx, opts) {
    if (!wx) return null;
    const o = opts || {};
    return h('span', { class: 'wx-chip' + (o.cls ? ' ' + o.cls : '') },
      wxIcon(wx, o.size),
      h('b', { text: wx.timeLabel || '' }),
      h('span', { text: wx.monthName + ' · ' + wx.label }));
  };
  UI.wxIcon = wxIcon;

  /* ---------- корт ---------- */
  /* Площадка живёт: игроки переезжают по зонам с анимацией, мяч летит по дуге,
     трибуны вспыхивают на очко, а по бортам крутится реклама спонсоров —
     тех самых, с которыми клуб подписал контракты. */
  const NS = 'http://www.w3.org/2000/svg';
  const VB = { w: 340, h: 266 };
  const COURT = { x: 22, y: 54, w: 296, h: 158 };

  function svgEl(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  function zonePoint(zone, top) {
    const [fx, fy] = ZONE_POS[zone];
    const half = COURT.h / 2;
    const x = COURT.x + (top ? 1 - fx : fx) * COURT.w;
    const y = top ? COURT.y + (1 - fy) * half : COURT.y + half + fy * half;
    return [x, y];
  }

  /** реклама на бортах: свои спонсоры, спонсоры соперника и партнёры лиги */
  function boardTexts(game, homeClub, awayTeam) {
    const list = [];
    const add = (t) => { if (t && list.indexOf(t) < 0) list.push(t); };
    (homeClub.finance.sponsors || []).forEach((sp) => add(sp.brand.toUpperCase()));
    if (awayTeam && awayTeam.finance) (awayTeam.finance.sponsors || []).slice(0, 1).forEach((sp) => add(sp.brand.toUpperCase()));
    add(homeClub.city.toUpperCase());
    S.SPONSOR_BRANDS.local.slice(0, 3).forEach((b) => add(b.toUpperCase()));
    S.SPONSOR_BRANDS.kit.slice(0, 2).forEach((b) => add(b.toUpperCase()));
    add('VOLLEYBALL MANAGER');
    return list;
  }

  /* ---------- фигурки ---------- */
  const SKIN = S.Crest.SKIN;
  const playerFigure = (player, kit, ink, number, skin, shorts) =>
    S.Crest.figure({ kit, ink, number, skin, shorts, cls: 'figure' });

  /** зритель на трибуне: голова, плечи и шарф в цветах клуба */
  function fanSymbol(svg) {
    const defs = svg.querySelector('defs');
    const sym = svgEl('symbol', { id: 'fan', viewBox: '-4 -9 8 9', overflow: 'visible' });
    sym.appendChild(svgEl('path', { d: 'M-2.6 0v-3.4a2.6 2.6 0 015.2 0V0z', fill: 'currentColor' }));
    sym.appendChild(svgEl('rect', { x: -3.1, y: -3.9, width: 6.2, height: 1.3, rx: 0.6, fill: 'rgba(255,255,255,.42)' }));
    sym.appendChild(svgEl('circle', { cx: 0, cy: -5.9, r: 1.75, fill: '#e2b183' }));
    defs.appendChild(sym);
  }

  /* ---------- улица вокруг дворца спорта ---------- */
  /* Зал стоит не в вакууме: вокруг здания видна погода того месяца, на который выпал матч.
     Кадр расширяется на поле MARGIN во все стороны — координаты самого корта не меняются. */
  const MARGIN = 26;

  function outsidePoints(rng, n, band) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([band[0] + rng.next() * (band[2] - band[0]), band[1] + rng.next() * (band[3] - band[1])]);
    return pts;
  }

  /** земля, деревья, фонари, машины и сугробы вокруг зала */
  function buildOutside(svg, defs, wx, rng) {
    const pal = wx.palette;
    const X0 = -MARGIN, Y0 = -MARGIN, W = VB.w + MARGIN * 2, H = VB.h + MARGIN * 2;
    const g = svgEl('g', { class: 'wx-outside' });

    // вид сверху: вокруг здания не небо, а земля — снег, мокрый асфальт или трава
    g.appendChild(svgEl('rect', { x: X0, y: Y0, width: W, height: H, rx: 16, fill: pal.ground }));
    // подъездная дорожка вокруг здания
    g.appendChild(svgEl('rect', {
      x: -9, y: -9, width: VB.w + 18, height: VB.h + 18, rx: 15,
      fill: wx.cover > 0.4 ? '#c3d2e6' : wx.wet ? '#3c434d' : '#41474f',
    }));
    // блеск мокрого асфальта
    if (wx.wet) g.appendChild(svgEl('rect', {
      x: -9, y: -9, width: VB.w + 18, height: VB.h + 18, rx: 15,
      fill: 'none', stroke: 'rgba(150,195,240,.2)', 'stroke-width': 7,
    }));

    // лужи после дождя
    if (wx.wet) {
      outsidePoints(rng, 12, [X0 + 3, Y0 + 3, VB.w + MARGIN - 3, VB.h + MARGIN - 3])
        .filter((p) => p[0] < -3 || p[0] > VB.w + 3 || p[1] < -3 || p[1] > VB.h + 3)
        .forEach((p) => {
          g.appendChild(svgEl('ellipse', {
            cx: p[0], cy: p[1], rx: 4 + rng.next() * 6, ry: 2 + rng.next() * 1.8,
            fill: 'rgba(140,190,240,.34)',
          }));
        });
    }

    // сугробы вдоль стен
    if (wx.cover > 0.25) {
      const op = (0.55 + wx.cover * 0.45).toFixed(2);
      const drifts = [
        [-24, 40, 11, 80], [-24, 150, 10, 66], [VB.w + 13, 30, 11, 90], [VB.w + 13, 165, 10, 60],
        [50, -24, 96, 10], [200, -24, 76, 10], [70, VB.h + 14, 120, 11], [232, VB.h + 14, 66, 10],
      ];
      drifts.forEach((d) => g.appendChild(svgEl('rect', {
        x: d[0], y: d[1], width: d[2], height: d[3], rx: 5, fill: '#fbfdff', opacity: op,
        stroke: 'rgba(120,155,200,.45)', 'stroke-width': 0.9,
      })));
    }

    // опавшая листва по газону
    if (wx.leaves > 0.1) {
      const leafInk = ['#d0801c', '#b0561a', '#e5a52c', '#8f5c1d'];
      const n = Math.round(18 + wx.leaves * 30);
      outsidePoints(rng, n, [X0 + 2, Y0 + 2, VB.w + MARGIN - 2, VB.h + MARGIN - 2])
        .filter((p) => p[0] < -2 || p[0] > VB.w + 2 || p[1] < -2 || p[1] > VB.h + 2)
        .forEach((p) => g.appendChild(svgEl('ellipse', {
          cx: p[0], cy: p[1], rx: 2.6, ry: 1.5,
          fill: leafInk[Math.floor(rng.next() * leafInk.length)],
          opacity: (0.7 + rng.next() * 0.3).toFixed(2),
          transform: 'rotate(' + Math.round(rng.next() * 180) + ' ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')',
        })));
    }

    // деревья по периметру: крона зависит от месяца
    const treeSpots = [
      [-19, 30], [-19, 104], [-19, 180], [-19, 244],
      [VB.w + 19, 26], [VB.w + 19, 104], [VB.w + 19, 186], [VB.w + 19, 246],
      [34, -19], [126, -19], [270, -19], [84, VB.h + 19], [198, VB.h + 19], [300, VB.h + 19],
    ];
    treeSpots.forEach((t, i) => {
      const r = 6 + (i % 3) * 1.1;
      g.appendChild(svgEl('circle', { cx: t[0], cy: t[1] + 1, r: r * 0.85, fill: 'rgba(0,0,0,.25)' }));
      if (wx.foliage === 'bare') {
        g.appendChild(svgEl('circle', { cx: t[0], cy: t[1], r: 1.5, fill: pal.trunk }));
        for (let b = 0; b < 6; b++) {
          const ang = (b / 6) * Math.PI * 2 + i;
          g.appendChild(svgEl('path', {
            d: 'M' + t[0] + ' ' + t[1] + 'L' + (t[0] + Math.cos(ang) * r) + ' ' + (t[1] + Math.sin(ang) * r),
            stroke: pal.tree, 'stroke-width': 1.3, 'stroke-linecap': 'round', fill: 'none',
          }));
        }
      } else {
        g.appendChild(svgEl('circle', { cx: t[0], cy: t[1], r, fill: pal.tree }));
        if (wx.foliage === 'snowy') {
          g.appendChild(svgEl('circle', { cx: t[0] - r * 0.25, cy: t[1] - r * 0.25, r: r * 0.55, fill: '#ffffff', opacity: 0.85 }));
        } else if (wx.foliage === 'gold') {
          g.appendChild(svgEl('circle', { cx: t[0] + r * 0.3, cy: t[1] - r * 0.3, r: r * 0.45, fill: '#eab543', opacity: 0.9 }));
        } else {
          g.appendChild(svgEl('circle', { cx: t[0] - r * 0.28, cy: t[1] - r * 0.28, r: r * 0.42, fill: '#ffffff', opacity: 0.12 }));
        }
      }
    });

    // припаркованные машины у входа
    const cars = [[10, VB.h + 12], [36, VB.h + 12], [62, VB.h + 12], [248, -21], [274, -21], [300, -21]];
    const carInk = ['#5d6b88', '#8a5252', '#456a71', '#77775a'];
    cars.forEach((c, i) => {
      g.appendChild(svgEl('rect', { x: c[0], y: c[1], width: 20, height: 9.5, rx: 3, fill: carInk[i % carInk.length] }));
      g.appendChild(svgEl('rect', { x: c[0] + 4, y: c[1] + 1.7, width: 12, height: 4, rx: 1.6, fill: 'rgba(190,225,255,.4)' }));
      if (wx.cover > 0.4) g.appendChild(svgEl('rect', { x: c[0] + 1, y: c[1] - 1.6, width: 18, height: 3, rx: 1.5, fill: '#f2f7fd', opacity: 0.9 }));
    });

    // фонари: вечером горят, весной и летом просто стоят
    const lampGrad = svgEl('radialGradient', { id: 'wxLamp' });
    lampGrad.appendChild(svgEl('stop', { offset: 0, 'stop-color': 'rgba(255,212,132,.6)' }));
    lampGrad.appendChild(svgEl('stop', { offset: 1, 'stop-color': 'rgba(255,212,132,0)' }));
    defs.appendChild(lampGrad);
    const lamps = [[-19, 68], [-19, 212], [VB.w + 19, 62], [VB.w + 19, 216], [172, -19], [172, VB.h + 19]];
    lamps.forEach((l) => {
      if (wx.night) g.appendChild(svgEl('circle', { cx: l[0], cy: l[1], r: 21, fill: 'url(#wxLamp)' }));
      g.appendChild(svgEl('circle', { cx: l[0], cy: l[1], r: 2.6, fill: wx.night ? '#ffdc96' : '#93a0b3' }));
      if (wx.night) g.appendChild(svgEl('circle', { cx: l[0], cy: l[1], r: 5, fill: 'none', stroke: 'rgba(255,220,150,.35)', 'stroke-width': 1.2 }));
    });

    // край крыши: зимой по нему лежит снег
    g.appendChild(svgEl('rect', {
      x: -3, y: -3, width: VB.w + 6, height: VB.h + 6, rx: 14,
      fill: 'none', stroke: wx.cover > 0.4 ? '#e6eefa' : '#0a1120', 'stroke-width': 5,
    }));
    return g;
  }

  /** осадки: падают только за стенами зала, внутрь не попадают */
  function buildPrecipitation(svg, defs, wx, rng, reduce) {
    if (!wx.drop) return null;
    const X0 = -MARGIN, Y0 = -MARGIN, W = VB.w + MARGIN * 2, H = VB.h + MARGIN * 2;
    const mask = svgEl('mask', { id: 'wxMask' });
    mask.appendChild(svgEl('rect', { x: X0, y: Y0, width: W, height: H, fill: '#fff' }));
    mask.appendChild(svgEl('rect', { x: 0, y: 0, width: VB.w, height: VB.h, rx: 12, fill: '#000' }));
    defs.appendChild(mask);

    const layer = svgEl('g', { class: 'wx-drops', mask: 'url(#wxMask)' });
    const kind = wx.drop;
    const count = Math.round((kind === 'rain' ? 104 : kind === 'sleet' ? 88 : kind === 'snow' ? 96 : 54) * (0.6 + wx.density * 0.5));
    const travel = H + 30;
    for (let i = 0; i < count; i++) {
      const x = X0 + rng.next() * W;
      const fast = 0.55 + rng.next() * 0.6;                     // ближе к зрителю — быстрее и крупнее
      const dur = (kind === 'rain' ? 0.85 : kind === 'sleet' ? 1.5 : kind === 'snow' ? 6.5 : 7.5) / fast;
      const dx = -wx.wind * (kind === 'rain' ? 26 : 60) * (0.6 + rng.next() * 0.8);
      let el;
      if (kind === 'rain' || (kind === 'sleet' && i % 2 === 0)) {
        el = svgEl('line', {
          x1: 0, y1: 0, x2: -wx.wind * 4.5, y2: 8 + fast * 7,
          stroke: 'rgba(206,230,255,.8)', 'stroke-width': (0.6 + fast * 0.7).toFixed(2), 'stroke-linecap': 'round',
        });
      } else if (kind === 'petal') {
        el = svgEl('ellipse', {
          rx: 1.5 + fast, ry: 0.9 + fast * 0.5,
          fill: rng.next() > 0.5 ? '#f7d7e4' : '#fdf3e0', opacity: (0.6 + rng.next() * 0.35).toFixed(2),
        });
      } else if (wx.wind > 1 && i % 3 === 0) {
        // метель: часть хлопьев вытянута ветром в штрихи
        el = svgEl('ellipse', {
          rx: (2.4 + fast * 2.6).toFixed(2), ry: (0.5 + fast * 0.45).toFixed(2),
          fill: '#ffffff', stroke: 'rgba(96,138,192,.5)', 'stroke-width': 0.3,
          opacity: (0.6 + rng.next() * 0.35).toFixed(2),
          transform: 'rotate(' + (16 + rng.next() * 12).toFixed(0) + ')',
        });
      } else {
        // на белом снегу белые хлопья без контура не читаются
        el = svgEl('circle', {
          r: (0.8 + fast * 1.2).toFixed(2), fill: '#ffffff',
          stroke: 'rgba(96,138,192,.55)', 'stroke-width': 0.35,
          opacity: (0.7 + rng.next() * 0.3).toFixed(2),
        });
      }
      el.setAttribute('class', 'wx-drop' + (kind === 'petal' ? ' spin' : ''));
      el.style.setProperty('--x', x.toFixed(1) + 'px');
      el.style.setProperty('--dx', dx.toFixed(1) + 'px');
      el.style.setProperty('--dy', travel + 'px');
      if (reduce) {
        // без анимации капли просто расставлены по всей высоте
        el.style.translate = x.toFixed(1) + 'px ' + (Y0 + rng.next() * H).toFixed(1) + 'px';
      } else {
        el.style.animationDuration = dur.toFixed(2) + 's';
        el.style.animationDelay = (-rng.next() * dur).toFixed(2) + 's';
      }
      layer.appendChild(el);
    }
    return layer;
  }

  function buildCourt(game, fx) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rng = game._rng;
    const wx = S.Weather.forFixture(game, fx);
    const svg = svgEl('svg', {
      viewBox: (-MARGIN) + ' ' + (-MARGIN) + ' ' + (VB.w + MARGIN * 2) + ' ' + (VB.h + MARGIN * 2),
      class: 'court wx-' + wx.kind,
    });
    const defs = svgEl('defs', {});
    svg.appendChild(defs);
    const homeClub = game.clubs[fx.h];
    const away = Sn.team(game, fx.a);
    const awayClub = game.clubs[fx.a];
    // комплекты: если формы соперников похожи, гости переодеваются в запасную
    const kits = S.Identity.matchKits(homeClub, awayClub);
    const homeId = S.Identity.of(homeClub);

    // светодиодная сетка и свечение для рекламных панелей
    const pat = svgEl('pattern', { id: 'ledDots', width: 2, height: 2, patternUnits: 'userSpaceOnUse' });
    pat.appendChild(svgEl('rect', { width: 2, height: 2, fill: '#070b14' }));
    pat.appendChild(svgEl('circle', { cx: 1, cy: 1, r: 0.42, fill: 'rgba(255,255,255,.09)' }));
    defs.appendChild(pat);
    const glow = svgEl('filter', { id: 'ledGlow', x: '-25%', y: '-90%', width: '150%', height: '280%' });
    glow.appendChild(svgEl('feGaussianBlur', { stdDeviation: 0.85, result: 'b' }));
    const merge = svgEl('feMerge', {});
    merge.appendChild(svgEl('feMergeNode', { in: 'b' }));
    merge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
    glow.appendChild(merge);
    defs.appendChild(glow);
    fanSymbol(svg);

    // сначала улица, потом само здание поверх неё
    svg.appendChild(buildOutside(svg, defs, wx, rng));
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: VB.w, height: VB.h, rx: 12, fill: '#101828' }));

    // ---- трибуны: ряды зрителей, плотность зависит от заполняемости зала ----
    const crowd = [];
    const fill = live ? live.fill : 0.6;
    // зал принадлежит хозяевам: трибуны в их цветах, в углу — гостевой сектор
    const homeColors = [homeId.primary, homeId.secondary, '#e2e8f0', homeId.primary, '#94a3b8'];
    const guestColors = awayClub ? [awayClub.identity.primary, awayClub.identity.secondary] : ['#94a3b8'];
    const bands = [
      { rowsY: [33, 22, 12], home: false, rect: [6, 2, 34] },
      { rowsY: [250, 261, 239], home: true, rect: [6, 232, 32] },
    ];
    bands.forEach((band) => {
      // ярусы трибун
      svg.appendChild(svgEl('rect', {
        x: band.rect[0], y: band.rect[1], width: VB.w - band.rect[0] * 2, height: band.rect[2], rx: 5,
        fill: band.home ? 'rgba(255,159,28,.07)' : 'rgba(45,212,191,.05)',
      }));
      band.rowsY.forEach((rowY, r) => {
        for (let i = 0; i < 27; i++) {
          if (rng.next() > 0.30 + fill * 0.70) continue;
          // гостевой сектор — угол нижнего яруса
          const guestSector = band.home && i < 4;
          const palette = guestSector ? guestColors : homeColors;
          const use = svgEl('use', {
            href: '#fan', x: 15 + i * 11.6 + (r % 2) * 5.2, y: rowY,
            class: 'fan', width: 8, height: 9,
          });
          use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#fan');
          use.style.color = palette[Math.floor(rng.next() * palette.length)];
          use.style.opacity = (0.66 + rng.next() * 0.34).toFixed(2);
          crowd.push(use);
          svg.appendChild(use);
        }
      });
    });

    // ---- LED-панели по бортам: бегущая строка со спонсорами ----
    const boards = [];
    const mkLed = (x, y, w, hgt, idx) => {
      const g = svgEl('g', { class: 'led' });
      g.appendChild(svgEl('rect', { x, y, width: w, height: hgt, rx: 1.6, fill: '#070b14' }));
      g.appendChild(svgEl('rect', { x, y, width: w, height: hgt, rx: 1.6, fill: 'url(#ledDots)' }));
      const clipId = 'ledClip' + idx;
      const clip = svgEl('clipPath', { id: clipId });
      clip.appendChild(svgEl('rect', { x: x + 1, y, width: w - 2, height: hgt }));
      defs.appendChild(clip);
      const inner = svgEl('g', { 'clip-path': 'url(#' + clipId + ')' });
      const track = svgEl('g', { class: 'led-track' });
      const mkText = () => svgEl('text', {
        x: 0, y: y + hgt / 2 + 2.4, 'font-size': 6.8, 'font-weight': 800, 'letter-spacing': 1.1,
        fill: '#ffbf5c', filter: 'url(#ledGlow)', 'dominant-baseline': 'middle',
      }, '');
      const t1 = mkText(), t2 = mkText();
      track.appendChild(t1); track.appendChild(t2);
      inner.appendChild(track);
      g.appendChild(inner);
      // блик стекла поверх панели
      g.appendChild(svgEl('rect', { x, y, width: w, height: hgt / 2.4, rx: 1.6, fill: 'rgba(255,255,255,.05)' }));
      svg.appendChild(g);
      boards.push({ g, track, t1, t2, x: x + 1, w: w - 2 });
      return g;
    };
    const bw = COURT.w * 0.475;
    mkLed(COURT.x, COURT.y - 17, bw, 12, 0);
    mkLed(COURT.x + COURT.w - bw, COURT.y - 17, bw, 12, 1);
    mkLed(COURT.x, COURT.y + COURT.h + 5, bw, 12, 2);
    mkLed(COURT.x + COURT.w - bw, COURT.y + COURT.h + 5, bw, 12, 3);

    // ---- площадка ----
    svg.appendChild(svgEl('rect', { x: COURT.x - 8, y: COURT.y - 2, width: COURT.w + 16, height: COURT.h + 4, rx: 6, fill: '#9c4a10' }));
    svg.appendChild(svgEl('rect', { x: COURT.x, y: COURT.y, width: COURT.w, height: COURT.h, fill: '#1d5fb5', stroke: 'rgba(255,255,255,.62)', 'stroke-width': 1.4 }));
    const half = COURT.h / 2;
    svg.appendChild(svgEl('line', { x1: COURT.x, y1: COURT.y + half * 0.42, x2: COURT.x + COURT.w, y2: COURT.y + half * 0.42, stroke: 'rgba(255,255,255,.4)', 'stroke-width': 1 }));
    svg.appendChild(svgEl('line', { x1: COURT.x, y1: COURT.y + half + half * 0.58, x2: COURT.x + COURT.w, y2: COURT.y + half + half * 0.58, stroke: 'rgba(255,255,255,.4)', 'stroke-width': 1 }));

    // слой игроков лежит между площадкой и сеткой, чтобы сетка была «перед» дальней командой
    const playersLayer = svgEl('g', { class: 'players' });
    svg.appendChild(playersLayer);

    // ---- сетка ----
    const net = svgEl('g', {});
    net.appendChild(svgEl('rect', { x: COURT.x - 6, y: COURT.y + half - 5, width: COURT.w + 12, height: 10, fill: 'rgba(255,255,255,.07)' }));
    for (let i = 0; i <= 44; i++) {
      const x = COURT.x - 6 + i * ((COURT.w + 12) / 44);
      net.appendChild(svgEl('line', { x1: x, y1: COURT.y + half - 5, x2: x, y2: COURT.y + half + 5, stroke: 'rgba(255,255,255,.26)', 'stroke-width': 0.5 }));
    }
    net.appendChild(svgEl('line', { x1: COURT.x - 6, y1: COURT.y + half - 5, x2: COURT.x + COURT.w + 6, y2: COURT.y + half - 5, stroke: '#fff', 'stroke-width': 2 }));
    [COURT.x - 6, COURT.x + COURT.w + 6].forEach((x) => {
      net.appendChild(svgEl('rect', { x: x - 1, y: COURT.y + half - 9, width: 2, height: 18, rx: 1, fill: '#cbd5e1' }));
    });
    svg.appendChild(net);

    // ---- мяч ----
    const shadow = svgEl('ellipse', { cx: -20, cy: -20, rx: 5, ry: 2.2, fill: 'rgba(0,0,0,.35)' });
    const ball = svgEl('g', { class: 'ball' });
    ball.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 4.4, fill: '#fff8ec', stroke: '#c2620f', 'stroke-width': 1.1 }));
    ball.appendChild(svgEl('path', { d: 'M-4.4 0a5 5 0 004.4 4.4', fill: 'none', stroke: '#c2620f', 'stroke-width': 0.8 }));
    ball.setAttribute('transform', 'translate(-20 -20)');
    svg.appendChild(shadow);
    svg.appendChild(ball);

    // ---- фигурки игроков ----
    const dots = {};
    const numbers = {};
    let nHome = 1, nAway = 1;
    // заливка маек: рисунок формы (полосы, диагональ, обруч) готовится один раз
    const topKit = live && live.isHome ? kits.away : kits.home;
    const botKit = live && live.isHome ? kits.home : kits.away;
    const topFill = S.Crest.kitFill(defs, topKit, 'kitTop', 0.42);
    const botFill = S.Crest.kitFill(defs, botKit, 'kitBot', 0.42);
    const liberoTop = S.Crest.kitFill(defs, { shirt: '#fde047', trim: topKit.trim, pattern: 'solid' }, 'kitLibT');
    const liberoBot = S.Crest.kitFill(defs, { shirt: '#fde047', trim: botKit.trim, pattern: 'solid' }, 'kitLibB');
    const mkFigure = (player, top) => {
      const kitObj = top ? topKit : botKit;
      const fill = player.role === 'L' ? (top ? liberoTop : liberoBot) : (top ? topFill : botFill);
      const ink = player.role === 'L' ? '#3b2f05' : S.Identity.inkOn(kitObj.shirt);
      const num = player.role === 'L' ? (top ? 17 : 18) : (top ? nAway++ : nHome++);
      numbers[player.id] = num;
      const skin = SKIN[Math.floor(rng.next() * SKIN.length)];
      const g = playerFigure(player, fill, ink, num, skin, kitObj.trim);
      g.appendChild(svgEl('text', {
        x: 0, y: 8.4, 'text-anchor': 'middle', 'font-size': 6.4, fill: '#eaf0ff',
        stroke: 'rgba(6,10,20,.85)', 'stroke-width': 2, 'paint-order': 'stroke fill',
      }, player.last.slice(0, 10)));
      playersLayer.appendChild(g);
      dots[player.id] = g;
      return g;
    };
    [[live ? live.opp : null, true], [live ? live.me : null, false]].forEach(([side, top]) => {
      if (!side) return;
      side.order.concat(side.libero ? [side.libero] : []).forEach((p) => mkFigure(p, top));
      side.bench.forEach((p) => { if (!dots[p.id]) mkFigure(p, top); });
    });

    // телевидение: камеры по углам, кран над сеткой и комментаторская позиция
    if (live && live.tv) {
      const tvg = svgEl('g', { class: 'tv-rig' });
      const cam = (x, y, flip) => {
        const c = svgEl('g', { transform: 'translate(' + x + ' ' + y + ')' + (flip ? ' scale(-1 1)' : '') });
        c.appendChild(svgEl('rect', { x: -1.1, y: 0, width: 2.2, height: 5.2, rx: 0.6, fill: '#2b3448' }));  // штатив
        c.appendChild(svgEl('rect', { x: -4.2, y: -4.6, width: 8.4, height: 4.8, rx: 1.2, fill: '#1d2536', stroke: '#3d4a63', 'stroke-width': 0.5 }));
        c.appendChild(svgEl('circle', { cx: 3.1, cy: -2.2, r: 1.5, fill: '#0a0f1a', stroke: '#5b6b88', 'stroke-width': 0.5 }));
        c.appendChild(svgEl('circle', { cx: -2.6, cy: -3.6, r: 0.85, fill: '#ff3b30', class: 'tally' }));   // огонёк «в эфире»
        return c;
      };
      tvg.appendChild(cam(14, 46));
      tvg.appendChild(cam(VB.w - 14, 46, true));
      tvg.appendChild(cam(14, VB.h - 40));
      if (live.tv.level === 'hd' || live.tv.level === 'euro') {
        tvg.appendChild(cam(VB.w - 14, VB.h - 40, true));
        // камера на кране над сеткой
        const boom = svgEl('g', {});
        boom.appendChild(svgEl('line', { x1: VB.w - 6, y1: 96, x2: VB.w - 42, y2: 128, stroke: '#39445c', 'stroke-width': 1.6 }));
        boom.appendChild(svgEl('rect', { x: VB.w - 48, y: 124, width: 7, height: 4, rx: 1, fill: '#1d2536', stroke: '#3d4a63', 'stroke-width': 0.5 }));
        boom.appendChild(svgEl('circle', { cx: VB.w - 45, cy: 122.5, r: 0.8, fill: '#ff3b30', class: 'tally' }));
        tvg.appendChild(boom);
      }
      // комментаторская позиция на верхней трибуне
      const booth = svgEl('g', {});
      booth.appendChild(svgEl('rect', { x: VB.w * 0.5 - 17, y: 4, width: 34, height: 9, rx: 2, fill: '#131c2e', stroke: '#3d4a63', 'stroke-width': 0.6 }));
      booth.appendChild(svgEl('text', {
        x: VB.w * 0.5, y: 10.6, 'text-anchor': 'middle', 'font-size': 5.2, 'font-weight': 700, fill: '#9fb0c8',
      }, live.tv.short));
      tvg.appendChild(booth);
      svg.appendChild(tvg);
    }

    // осадки поверх всего, но только за стенами зала
    const drops = buildPrecipitation(svg, defs, wx, rng, reduce);
    if (drops) svg.appendChild(drops);

    return {
      svg, dots, numbers, ball, shadow, boards, crowd, reduce, playersLayer, wx,
      texts: boardTexts(game, homeClub, away), boardIndex: 0,
    };
  }

  /** расставить фигурки по текущей ротации; ближние рисуются поверх дальних */
  function placePlayers() {
    const c = live.court, m = live.match;
    const seen = {};
    const order = [];
    [[live.opp, true], [live.me, false]].forEach(([side, top]) => {
      side.onCourt().forEach((slot) => {
        const g = c.dots[slot.player.id];
        if (!g) return;
        const [x, y] = zonePoint(slot.zone, top);
        const wasHidden = g.style.display === 'none';
        g.style.display = '';
        if (wasHidden) {
          // вышедший на замену появляется сразу в своей зоне, без проезда через полплощадки
          g.style.transition = 'none';
          g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
          void g.getBoundingClientRect();
          g.style.transition = '';
        }
        g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
        const serving = m.serving === side && slot.zone === 1;
        g.classList.toggle('serving', serving);
        seen[slot.player.id] = true;
        order.push({ g, y });
      });
    });
    // порядок отрисовки по глубине: кто ближе к зрителю, тот сверху
    order.sort((a, b) => a.y - b.y).forEach((o) => c.playersLayer.appendChild(o.g));
    Object.keys(c.dots).forEach((id) => {
      if (seen[id]) return;
      c.dots[id].style.display = 'none';
    });
  }

  /** поза на розыгрыш: атака и блок — в прыжке, подающий — с поднятыми руками */
  function poseFigures(ev) {
    const c = live.court;
    if (!c || c.reduce) return;
    clearTimeout(live.poseTimer);
    Object.keys(c.dots).forEach((id) => c.dots[id].classList.remove('jump', 'reach'));
    const mark = (player, cls) => {
      if (!player) return;
      const g = c.dots[player.id];
      if (g) g.classList.add(cls);
    };
    mark(ev.attacker, 'jump');
    mark(ev.blocker, 'jump');
    mark(ev.server, 'reach');
    mark(ev.digger, 'reach');
    live.poseTimer = setTimeout(() => {
      Object.keys(c.dots).forEach((id) => c.dots[id].classList.remove('jump', 'reach'));
    }, 620);
  }

  /** полёт мяча по дуге между двумя точками */
  function flyBall(from, to, ms) {
    const c = live.court;
    if (!from || !to) return;
    const put = (x, y, scale) => {
      c.ball.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') scale(' + scale.toFixed(2) + ')');
      c.shadow.setAttribute('cx', x.toFixed(1));
      c.shadow.setAttribute('cy', (y + 3).toFixed(1));
    };
    if (c.reduce) { put(to[0], to[1] - 8, 1); return; }
    const lift = 26 + Math.min(34, Math.abs(from[1] - to[1]) * 0.32);
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - lift - 14];
    const t0 = performance.now();
    if (live.ballRaf) cancelAnimationFrame(live.ballRaf);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const inv = 1 - t;
      const x = inv * inv * from[0] + 2 * inv * t * mid[0] + t * t * to[0];
      const y = inv * inv * (from[1] - 14) + 2 * inv * t * mid[1] + t * t * (to[1] - 8);
      put(x, y, 1 + Math.sin(t * Math.PI) * 0.35);
      c.shadow.setAttribute('cy', (inv * from[1] + t * to[1] + 1).toFixed(1));
      c.shadow.setAttribute('rx', (5 - Math.sin(t * Math.PI) * 1.8).toFixed(1));
      c.ball.style.setProperty('--spin', (t * 540).toFixed(0) + 'deg');
      if (t < 1) live.ballRaf = requestAnimationFrame(step);
    };
    live.ballRaf = requestAnimationFrame(step);
  }

  /** трибуны вскакивают на очко */
  function crowdFlash(mine, strength) {
    const c = live.court;
    if (c.reduce) return;
    const pick = Math.round(c.crowd.length * (0.3 + strength * 0.45));
    for (let i = 0; i < pick; i++) {
      const fan = c.crowd[Math.floor(Math.random() * c.crowd.length)];
      if (!fan) continue;
      fan.classList.remove('cheer');
      void fan.getBoundingClientRect();
      fan.style.setProperty('--delay', (Math.random() * 0.18).toFixed(2) + 's');
      fan.classList.add('cheer');
      setTimeout(() => fan.classList.remove('cheer'), 900);
    }
  }

  /** вспышка LED-панелей на важное очко */
  function ledFlash() {
    const c = live.court;
    if (!c || c.reduce) return;
    c.boards.forEach((b) => {
      b.g.classList.remove('flash');
      void b.g.getBoundingClientRect();
      b.g.classList.add('flash');
      setTimeout(() => b.g.classList.remove('flash'), 620);
    });
  }

  /** бегущая строка: текст едет по панели и уходит за край, следом идёт копия */
  function rotateBoards() {
    const c = live.court;
    if (!c || !c.texts.length) return;
    c.boards.forEach((b, i) => {
      const text = c.texts[(c.boardIndex + i) % c.texts.length];
      b.t1.textContent = text;
      b.t2.textContent = text;
      let w = 0;
      try { w = b.t1.getComputedTextLength(); } catch (e) { w = text.length * 4.4; }
      const gap = Math.max(26, b.w * 0.35);
      const span = w + gap;
      b.t1.setAttribute('x', b.x);
      b.t2.setAttribute('x', b.x + span);
      if (c.reduce) {
        b.track.style.animation = 'none';
        b.t1.setAttribute('x', b.x + Math.max(0, (b.w - w) / 2));
        b.t2.textContent = '';
        return;
      }
      b.track.style.setProperty('--led-to', (-span) + 'px');
      b.track.style.setProperty('--led-dur', (span / 14).toFixed(1) + 's');
      // перезапуск анимации, чтобы новая надпись поехала с начала
      b.track.style.animation = 'none';
      void b.track.getBoundingClientRect();
      b.track.style.animation = '';
    });
    c.boardIndex = (c.boardIndex + c.boards.length) % c.texts.length;
  }

  function drawCourt(step) {
    if (!live.court) {
      live.court = buildCourt(UI.game, live.fx);
      live.courtWrap.innerHTML = '';
      live.courtWrap.appendChild(live.court.svg);
      rotateBoards();
      live.boardTimer = setInterval(rotateBoards, 5200);
    }
    placePlayers();
    if (!step || !step.ev) return;
    const ev = step.ev;
    const findSide = (pl) => (live.me.order.includes(pl) || live.me.libero === pl ? live.me : live.opp);
    const other = (side) => (side === live.me ? live.opp : live.me);
    const slotOf = (side, pl) => side.onCourt().find((x) => x.player === pl);
    let from = null, to = null;
    if (ev.attacker) {
      const side = findSide(ev.attacker);
      const slot = slotOf(side, ev.attacker);
      if (slot) from = zonePoint(slot.zone, side === live.opp);
      const def = other(side);
      const digSlot = ev.digger && slotOf(def, ev.digger);
      to = zonePoint(digSlot ? digSlot.zone : 6, def === live.opp);
    } else if (ev.server) {
      const side = findSide(ev.server);
      from = zonePoint(1, side === live.opp);
      const rcv = other(side);
      const recSlot = ev.receiver && slotOf(rcv, ev.receiver);
      to = zonePoint(recSlot ? recSlot.zone : 6, rcv === live.opp);
    }
    const speed = SPEED[live.speed] || 750;
    flyBall(from, to, Math.max(220, Math.min(620, speed * 0.62)));
    poseFigures(ev);
    const rec = step.record;
    const mine = (rec.winner === 'h') === live.isHome;
    const big = Math.max(rec.h, rec.a) >= live.match.target - 2;
    crowdFlash(mine, big ? 1 : 0.55);
    if (big || rec.reason === 'ace' || rec.reason === 'block') ledFlash();
  }

  /* ---------- комментарий ---------- */
  function name(id) {
    const p = UI.game.players[id];
    return p ? P.shortName(p) : 'игрок';
  }

  function commentary(rec, ev) {
    const g = UI.game;
    const R = g._rng;
    const srv = name(rec.server);
    switch (rec.reason) {
      case 'ace': return 'ЭЙС! ' + srv + ' пробил приём — ' + name(rec.receiver) + ' не справился.';
      case 'serve_error': return srv + ' ошибается на подаче.';
      case 'kill': {
        const a = name(rec.attacker);
        const phase = ev && ev.phases.filter((p) => p.type === 'attack').pop();
        if (phase && phase.quick) return a + ' забивает первым темпом — блок не успел.';
        if (phase && phase.back) return a + ' бьёт с задней линии — есть очко!';
        if (rec.length > 2) return 'Затяжной розыгрыш: ' + a + ' всё-таки дожимает.';
        if (phase && phase.setQuality > 0.75) return 'Идеальный пас — ' + a + ' бьёт по линии.';
        return a + ' пробивает блок.';
      }
      case 'block': return name(rec.blocker) + ' ставит блок на ' + name(rec.attacker) + '!';
      case 'attack_error': return name(rec.attacker) + ' — мяч в аут.';
      case 'long_rally': return 'Долгий розыгрыш заканчивается ошибкой.';
      default: return 'Очко.';
    }
  }

  /** трибуны заводятся: серия очков, сетбол, камбэк */
  function maybeChant(step) {
    const g = UI.game;
    if (!live.isHome) return;                      // на выезде поёт чужой сектор
    const club = g.clubs[g.playerClubId];
    const me = live.me, opp = live.opp;
    const rec = step.record;
    const target = live.match.target;
    let situation = null;
    if (me.streak >= 3 && me.streak % 3 === 0) situation = 'streak';
    else if (me.points >= target - 1 && me.points > opp.points) situation = 'setpoint';
    else if (live.match.setNo >= 3 && me.sets < opp.sets && me.streak >= 2) situation = 'comeback';
    if (!situation) return;
    if (live.lastChant && step.record.h + step.record.a - live.lastChant < 6) return;
    live.lastChant = step.record.h + step.record.a;
    const text = S.Fans.chantFor(g, club, situation);
    pushLine('evt', '🎵 Трибуны: «' + text + '»', '');
    if (g.settings.sound) S.Audio.chant(4, 0.6 + (live.support || 0.5) * 0.6);
  }

  function renderRally(step) {
    const g = UI.game;
    const rec = step.record;
    const meIsHome = live.isHome;
    const mine = (rec.winner === 'h') === meIsHome;
    const text = g.settings.commentary === false ? shortText(rec) : commentary(rec, step.ev);
    const score = live.isHome ? rec.h + ':' + rec.a : rec.a + ':' + rec.h;
    pushLine(mine ? 'h' : 'a', text, score);
    if (g.settings.sound) {
      if (rec.reason !== 'serve_error') S.Audio.hit(rec.reason === 'kill' ? 1.1 : 0.8);
      const target = live.match.target;
      const big = Math.max(rec.h, rec.a) >= target - 2;
      S.Audio.crowdReact(mine, big ? 1.15 : 0.6);
    }
  }
  function shortText(rec) {
    const map = { ace: 'Эйс', serve_error: 'Ошибка подачи', kill: 'Атака', block: 'Блок', attack_error: 'Ошибка атаки', long_rally: 'Ошибка' };
    return map[rec.reason] || 'Очко';
  }

  /** фраза комментатора про погоду за стенами зала */
  function wxWelcome(wx) {
    const cap = wx.monthName[0].toUpperCase() + wx.monthName.slice(1);
    const when = wx.timeLabel + ', ' + (S.Weather.partOfDay ? S.Weather.partOfDay(wx) : '');
    const by = {
      blizzard: 'на улице метёт, у входа сугробы по колено',
      snow: 'за окнами тихо падает снег',
      frost: 'на улице трещит мороз, зато небо чистое',
      shower: 'у дворца спорта стеной идёт ливень',
      rain: 'на парковке дождь и лужи',
      sleet: 'на улице мокрый снег с дождём',
      thaw: 'на улице оттепель, снег на газонах осел',
      cloud: 'на улице пасмурно',
      clear: 'небо над городом чистое',
      bloom: 'на улице тепло, деревья у арены в цвету',
    }[wx.kind] || 'на улице спокойно';
    return cap + ', ' + when + ', ' + (wx.temp > 0 ? '+' : '') + wx.temp + '° — ' + by + '.';
  }

  function pushLine(cls, text, score) {
    const line = h('div', { class: 'm-line ' + cls },
      score ? h('span', { class: 'sc', text: score }) : null,
      h('span', { class: 'grow', text }));
    live.logBox.insertBefore(line, live.logBox.firstChild);
    while (live.logBox.children.length > 60) live.logBox.lastChild.remove();
  }

  /* ---------- управление ---------- */
  function drawControls(finished) {
    const g = UI.game;
    const m = live.match, me = live.me;
    live.ctrl.innerHTML = '';
    if (finished) {
      live.ctrl.appendChild(h('button', {
        class: 'btn primary full', onclick: () => { closeLive(); showResult(live ? live.fx : null, m, false); },
      }, 'Итоги матча'));
      return;
    }
    const canChallenge = m.lastWinner && m.lastWinner !== me && me.challenges > 0;
    live.ctrl.appendChild(h('button', {
      class: 'btn', disabled: me.timeouts <= 0,
      onclick: () => {
        if (m.timeout(me)) {
          pushLine('evt', 'Тайм-аут. Соперник сбит с хода.', '');
          if (g.settings.sound) S.Audio.whistle(false);
          drawControls();
        }
      },
    }, 'Тайм-аут ' + me.timeouts));
    live.ctrl.appendChild(h('button', {
      class: 'btn', disabled: !canChallenge,
      onclick: () => {
        const r = m.challenge(me);
        if (!r.ok) { UI.toast(r.reason); return; }
        pushLine('evt', r.overturned ? 'Видеопросмотр: очко переиграно в вашу пользу!' : 'Видеопросмотр: решение судьи в силе.', '');
        if (g.settings.sound) S.Audio.whistle(false);
        drawHead(); drawControls();
      },
    }, 'Просмотр ' + me.challenges));
    live.ctrl.appendChild(h('button', { class: 'btn', onclick: () => subModal() }, 'Замена ' + me.subsLeft));
    live.ctrl.appendChild(h('button', {
      class: 'btn' + (live.statsOpen ? ' primary' : ''), style: 'flex:0 0 46px',
      title: 'Статистика', onclick: () => { live.statsOpen = !live.statsOpen; drawStats(); drawControls(); },
    }, '№'));
    const speeds = h('div', { class: 'speeds', style: 'flex:1 1 100%;display:flex;gap:6px' });
    speeds.appendChild(h('button', {
      class: 'btn' + (live.playing ? '' : ' primary'),
      onclick: () => { live.playing = !live.playing; drawControls(); schedule(); },
    }, live.playing ? 'Пауза' : 'Играть'));
    ['slow', 'fast', 'turbo'].forEach((sp) => {
      speeds.appendChild(h('button', {
        class: 'btn sm' + (live.speed === sp ? ' primary' : ''),
        style: 'flex:0 0 46px',
        onclick: () => { live.speed = sp; drawControls(); schedule(); },
      }, sp === 'slow' ? '×1' : sp === 'fast' ? '×2' : '×4'));
    });
    speeds.appendChild(h('button', {
      class: 'btn', onclick: () => {
        live.playing = false; clearTimeout(live.timer);
        m.runToEnd();
        finishLive();
      },
    }, 'До конца'));
    live.ctrl.appendChild(speeds);
  }

  function subModal() {
    const g = UI.game, m = live.match, me = live.me;
    UI.modal('Замена', (mod) => {
      if (me.subsLeft <= 0) return [h('div', { class: 'small bad', text: 'Лимит замен в сете исчерпан.' })];
      const bench = me.bench.filter((p) => p.role !== 'L' && !(p.injury > 0));
      if (!bench.length) return [h('div', { class: 'small muted', text: 'Скамейка пуста.' })];
      return [
        h('div', { class: 'small muted mb', text: 'Либеро меняется вне лимита и не может подавать — им управляет тренер автоматически.' }),
        ...me.order.map((out) => h('div', { class: 'card tight' },
          h('div', { class: 'row between mb' },
            h('span', { class: 'small' }, h('b', { text: P.shortName(out) }), ' · ' + ROLES[out.role].short + ' · ' + P.overall(out)),
            h('span', { class: 'tiny dim', text: 'усталость ' + Math.round(out.fatigue) + '%' })),
          h('div', { class: 'row wrap', style: 'gap:6px' },
            ...bench.filter((b) => b.role === out.role).map((b) => h('button', {
              class: 'btn sm', onclick: () => {
                const r = m.substitute(me, out.id, b.id);
                UI.toast(r.ok ? P.shortName(b) + ' выходит на площадку' : r.reason);
                if (r.ok) { pushLine('evt', 'Замена: ' + P.shortName(b) + ' вместо ' + P.shortName(out) + '.', ''); drawCourt(); }
                mod.close(); drawControls();
              },
            }, P.shortName(b) + ' · ' + P.overall(b))),
            ...(bench.filter((b) => b.role === out.role).length ? [] : [h('span', { class: 'tiny dim', text: 'нет игрока того же амплуа' })]))))
      ];
    });
  }

  function closeLive() {
    const ov = document.getElementById('overlay');
    if (live) {
      clearTimeout(live.timer);
      if (live.boardTimer) clearInterval(live.boardTimer);
      if (live.ballRaf) cancelAnimationFrame(live.ballRaf);
    }
    S.Audio.stopCrowd();
    ov.hidden = true;
    ov.innerHTML = '';
  }

  /* ---------- итоги матча ---------- */
  function showResult(fx, match, instant) {
    const g = UI.game;
    if (instant && g.settings.sound) {
      S.Audio.resume();
      const won = (fx.h === g.playerClubId) === (fx.result.score[0] > fx.result.score[1]);
      S.Audio.crowdReact(won, 1.2);
      if (won) S.Audio.stinger('win');
    }
    live = null;
    const res = fx.result;
    const won = (fx.h === g.playerClubId) === (res.score[0] > res.score[1]);
    UI.modal(won ? 'Победа' : 'Поражение', (m) => {
      const nodes = [
        h('div', { class: 'center mb' },
          h('div', { class: 'small muted', text: Sn.teamName(g, fx.h) + ' — ' + Sn.teamName(g, fx.a) }),
          h('div', { class: 'big ' + (won ? 'good' : 'bad'), text: res.score.join(' : ') }),
          h('div', { class: 'small muted', text: (res.setScores || []).map((s) => s.join(':')).join('  ·  ') })),
      ];
      if (res.stats) {
        nodes.push(h('div', { class: 'card flat tight' },
          statLine('Атака', res.stats.h.kills + '/' + res.stats.h.attacks, res.stats.a.kills + '/' + res.stats.a.attacks),
          statLine('Блок', res.stats.h.blocks, res.stats.a.blocks),
          statLine('Эйсы', res.stats.h.aces, res.stats.a.aces),
          statLine('Ошибки', res.stats.h.serveErrors + res.stats.h.attackErrors, res.stats.a.serveErrors + res.stats.a.attackErrors)));
      }
      if (res.mvp) nodes.push(h('div', { class: 'card tight center small' }, 'Лучший: ', h('b', { text: res.mvp.name }), ' · ' + res.mvp.points + ' очк.'));
      if (fx.attendance) nodes.push(h('div', { class: 'tiny dim center mb', text: 'Зрителей: ' + U.num(fx.attendance.count) + ' (' + Math.round(fx.attendance.fill * 100) + '%)' }));
      nodes.push(h('button', {
        class: 'btn primary full mt', onclick: () => { m.close(); afterFixture(fx); },
      }, 'Дальше'));
      return nodes;
    });
  }
  function statLine(label, a, b) {
    return h('div', { class: 'row between small', style: 'padding:3px 0' },
      h('b', { style: 'flex:0 0 60px', text: a }),
      h('span', { class: 'muted center grow', text: label }),
      h('b', { style: 'flex:0 0 60px;text-align:right', text: b }));
  }

  /* ---------- переход к следующему матчу / концу недели ---------- */
  function afterFixture() {
    const g = UI.game;
    S.Save.save(g);
    const next = Sn.nextPlayerFixture(g);
    UI.render();
    if (next) {
      UI.toast('На этой неделе ещё один матч');
      return;
    }
    finishWeek();
  }
  UI.afterFixture = afterFixture;

  function finishWeek() {
    const g = UI.game;
    const before = g.results.length;
    Sn.completeWeek(g);
    S.Save.save(g);
    UI.render();
    // церемонии показываем до сводки недели: сначала кубок, потом бумаги
    S.Ceremony.drain(g, () => {
      if (g.phase === 'offseason') { UI.seasonReport(); return; }
      weekDigest(before);
    });
  }

  function weekDigest(beforeCount) {
    const g = UI.game;
    const club = g.clubs[g.playerClubId];
    const fresh = g.results.slice(0, g.results.length - beforeCount).filter((r) => r.week === g.week);
    const div = g.divisions[club.division];
    const order = W.sortTable(div);
    const pos = order.indexOf(club.id) + 1;
    UI.modal('Неделя ' + g.week + ' завершена', (m) => {
      const mine = fresh.filter((r) => r.h === club.id || r.a === club.id);
      const others = fresh.filter((r) => r.div === club.division && r.h !== club.id && r.a !== club.id).slice(0, 7);
      return [
        h('div', { class: 'row between mb' },
          h('span', { class: 'small muted', text: 'Позиция в таблице' }),
          h('span', { class: 'pill accent', text: pos + '-е место' })),
        others.length ? h('div', { class: 'section-title', style: 'margin-left:0', text: 'Матчи тура' }) : null,
        ...others.map((r) => h('div', { class: 'row between small', style: 'padding:4px 0;border-bottom:1px solid var(--line)' },
          h('span', { class: 'grow ellipsis', text: r.hn + ' — ' + r.an }),
          h('b', { text: r.score.join(':') }))),
        h('button', { class: 'btn primary full mt', onclick: () => { m.close(); UI.go('club'); } }, 'Продолжить'),
      ];
    });
  }

  /* ---------- следующая неделя без матча ---------- */
  UI.advanceWeek = function () {
    const g = UI.game;
    if (g.phase === 'offseason' || g.week >= Sn.SEASON_END_WEEK) { UI.seasonReport(); return; }
    const wk = Sn.startWeek(g);
    if (wk.seasonOver) { UI.seasonReport(); return; }
    const next = Sn.nextPlayerFixture(g);
    UI.render();
    if (next) {
      UI.toast('Матч недели: ' + Sn.teamName(g, next.h === g.playerClubId ? next.a : next.h));
      return;
    }
    finishWeek();
  };

  S.MatchUI = { closeLive, openLive };
})(typeof window !== 'undefined' ? window : globalThis);
