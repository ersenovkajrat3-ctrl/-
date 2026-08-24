/* Сетка — просмотр матча: схематичный корт сверху, текстовый комментарий и звук.
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
    const logBox = h('div', { class: 'm-log' });
    const ctrl = h('div', { class: 'm-ctrl' });
    ov.append(head, courtWrap, logBox, ctrl);

    live = {
      fx, match, me, isHome, opp: isHome ? match.away : match.home,
      support: fx.support != null ? fx.support : (g.clubs[fx.h] ? S.Fans.support(g, g.clubs[fx.h], att.fill) : 0.5),
      playing: true, timer: null, ov, head, courtWrap, logBox, ctrl,
      fill: att.fill, speed: g.settings.speed || 'fast',
    };

    drawHead();
    drawCourt();
    drawControls();
    pushLine('evt', 'Стартовый свисток. ' + Sn.teamName(g, fx.h) + ' принимает ' + Sn.teamName(g, fx.a) + '.', '');
    if (g.settings.sound) S.Audio.whistle(false);
    schedule();
  }

  function schedule() {
    if (!live) return;
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

  /* ---------- шапка со счётом ---------- */
  /* Клуб игрока всегда слева на табло и внизу на корте — так не путаешься, за кого играешь. */
  function drawHead() {
    const g = UI.game, m = live.match;
    const me = live.me, opp = live.opp;
    live.head.innerHTML = '';
    live.head.appendChild(h('div', { class: 'm-score' },
      h('div', { class: 'tm' },
        h('div', { class: 'nm ellipsis', text: me.name }),
        h('div', { class: 'tiny dim', text: (live.isHome ? 'дома' : 'в гостях') + ' · сеты ' + me.sets })),
      h('div', { class: 'pts' + (m.serving === me ? ' serving' : ''), text: me.points }),
      h('div', { class: 'tiny dim', text: 'сет ' + m.setNo }),
      h('div', { class: 'pts' + (m.serving === opp ? ' serving' : ''), text: opp.points }),
      h('div', { class: 'tm right' },
        h('div', { class: 'nm ellipsis', text: opp.name }),
        h('div', { class: 'tiny dim', text: 'сеты ' + opp.sets }))));
    if (live.isHome) {
      const sup = Math.round((live.support != null ? live.support : 0.5) * 100);
      live.head.appendChild(h('div', { class: 'support-meter' },
        h('span', { class: 'tiny dim', text: 'трибуны' }),
        h('div', { class: 'bar' }, h('i', { style: 'width:' + sup + '%' })),
        h('span', { class: 'tiny dim', text: sup + '%' })));
    }
    const sets = h('div', { class: 'm-sets' });
    m.log.setScores.forEach((sc, i) => {
      const mine = live.isHome ? sc[0] : sc[1];
      const theirs = live.isHome ? sc[1] : sc[0];
      sets.appendChild(h('span', { class: 'st' + (mine > theirs ? ' won' : ''), text: (i + 1) + ': ' + mine + '–' + theirs }));
    });
    live.head.appendChild(sets);
  }

  /* ---------- корт ---------- */
  /* Площадка живёт: игроки переезжают по зонам с анимацией, мяч летит по дуге,
     трибуны вспыхивают на очко, а по бортам крутится реклама спонсоров —
     тех самых, с которыми клуб подписал контракты. */
  const NS = 'http://www.w3.org/2000/svg';
  const VB = { w: 340, h: 252 };
  const COURT = { x: 22, y: 42, w: 296, h: 168 };

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
    add('СЕТКА · ЛИГА');
    return list;
  }

  function buildCourt(game, fx) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const svg = svgEl('svg', { viewBox: '0 0 ' + VB.w + ' ' + VB.h, class: 'court' });
    const homeClub = game.clubs[fx.h];
    const away = Sn.team(game, fx.a);

    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: VB.w, height: VB.h, rx: 12, fill: '#121b2c' }));

    // трибуны: два ряда зрителей сверху и снизу, их плотность зависит от заполняемости
    const crowd = [];
    const fill = live ? live.fill : 0.6;
    [{ y: 8, rows: 2 }, { y: VB.h - 20, rows: 2 }].forEach((band, bi) => {
      for (let r = 0; r < band.rows; r++) {
        for (let i = 0; i < 34; i++) {
          if (game._rng.next() > 0.35 + fill * 0.65) continue;
          const dot = svgEl('circle', {
            cx: 12 + i * 9.4 + (r % 2) * 4,
            cy: band.y + r * 8,
            r: 2.6,
            fill: bi === 1 ? '#ff9f1c' : '#3b4a6b',   // нижняя трибуна — свои болельщики
            opacity: 0.55 + game._rng.next() * 0.4,
          });
          crowd.push(dot);
          svg.appendChild(dot);
        }
      }
    });

    // рекламные борта по периметру
    const boards = [];
    const mkBoard = (x, y, w, hgt, size) => {
      const g = svgEl('g', {});
      g.appendChild(svgEl('rect', { x, y, width: w, height: hgt, rx: 2, fill: '#0d1524', stroke: 'rgba(255,255,255,.10)', 'stroke-width': 0.8 }));
      const t = svgEl('text', {
        x: x + w / 2, y: y + hgt / 2 + size * 0.36, 'text-anchor': 'middle',
        'font-size': size, 'font-weight': 700, 'letter-spacing': 0.6, fill: 'rgba(255,255,255,.62)',
        class: 'board-text',
      }, '');
      g.appendChild(t);
      svg.appendChild(g);
      boards.push(t);
      return t;
    };
    mkBoard(COURT.x, COURT.y - 14, COURT.w * 0.48, 11, 6.4);
    mkBoard(COURT.x + COURT.w * 0.52, COURT.y - 14, COURT.w * 0.48, 11, 6.4);
    mkBoard(COURT.x, COURT.y + COURT.h + 3, COURT.w * 0.48, 11, 6.4);
    mkBoard(COURT.x + COURT.w * 0.52, COURT.y + COURT.h + 3, COURT.w * 0.48, 11, 6.4);

    // сама площадка: свободная зона, поле, линии атаки и сетка
    svg.appendChild(svgEl('rect', { x: COURT.x - 8, y: COURT.y - 2, width: COURT.w + 16, height: COURT.h + 4, rx: 6, fill: '#8a3f0c' }));
    svg.appendChild(svgEl('rect', { x: COURT.x, y: COURT.y, width: COURT.w, height: COURT.h, fill: '#1d5fb5', stroke: 'rgba(255,255,255,.6)', 'stroke-width': 1.4 }));
    const half = COURT.h / 2;
    svg.appendChild(svgEl('line', { x1: COURT.x, y1: COURT.y + half * 0.42, x2: COURT.x + COURT.w, y2: COURT.y + half * 0.42, stroke: 'rgba(255,255,255,.45)', 'stroke-width': 1 }));
    svg.appendChild(svgEl('line', { x1: COURT.x, y1: COURT.y + half + half * 0.58, x2: COURT.x + COURT.w, y2: COURT.y + half + half * 0.58, stroke: 'rgba(255,255,255,.45)', 'stroke-width': 1 }));
    // сетка: столбы и полотно
    const net = svgEl('g', {});
    net.appendChild(svgEl('rect', { x: COURT.x - 6, y: COURT.y + half - 5, width: COURT.w + 12, height: 10, fill: 'rgba(255,255,255,.10)' }));
    for (let i = 0; i <= 40; i++) {
      const x = COURT.x - 6 + i * ((COURT.w + 12) / 40);
      net.appendChild(svgEl('line', { x1: x, y1: COURT.y + half - 5, x2: x, y2: COURT.y + half + 5, stroke: 'rgba(255,255,255,.28)', 'stroke-width': 0.5 }));
    }
    net.appendChild(svgEl('line', { x1: COURT.x - 6, y1: COURT.y + half - 5, x2: COURT.x + COURT.w + 6, y2: COURT.y + half - 5, stroke: '#fff', 'stroke-width': 2 }));
    svg.appendChild(net);

    // тень мяча и сам мяч
    const shadow = svgEl('ellipse', { cx: -20, cy: -20, rx: 5, ry: 2.2, fill: 'rgba(0,0,0,.35)' });
    const ball = svgEl('circle', { cx: -20, cy: -20, r: 4.2, fill: '#fff', stroke: '#c2620f', 'stroke-width': 1.2 });
    svg.appendChild(shadow);
    svg.appendChild(ball);

    // игроки: группы с плавным переездом между зонами
    const dots = {};
    const mkDot = (player, top) => {
      const g = svgEl('g', { class: 'pdot' });
      const isLibero = player.role === 'L';
      g.appendChild(svgEl('circle', {
        r: 9.4, fill: isLibero ? '#fde047' : (top ? '#2dd4bf' : '#ff9f1c'),
        stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1, class: 'pdot-body',
      }));
      g.appendChild(svgEl('text', { y: 3.2, 'text-anchor': 'middle', 'font-size': 8.4, 'font-weight': 700, fill: '#12203a' }, ROLES[player.role].short));
      g.appendChild(svgEl('text', {
        y: top ? 18 : -13, 'text-anchor': 'middle', 'font-size': 7, fill: '#eaf0ff',
        stroke: 'rgba(6,10,20,.85)', 'stroke-width': 2.2, 'paint-order': 'stroke fill',
      }, player.last.slice(0, 11)));
      svg.appendChild(g);
      dots[player.id] = g;
      return g;
    };
    [[live ? live.opp : null, true], [live ? live.me : null, false]].forEach(([side, top]) => {
      if (!side) return;
      side.order.concat(side.libero ? [side.libero] : []).forEach((p) => mkDot(p, top));
      side.bench.forEach((p) => { if (!dots[p.id]) mkDot(p, top); });
    });

    return { svg, dots, ball, shadow, boards, crowd, reduce, texts: boardTexts(game, homeClub, away), boardIndex: 0 };
  }

  /** расставить игроков по текущей ротации (анимация — через CSS-переход) */
  function placePlayers() {
    const c = live.court, m = live.match;
    const seen = {};
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
        g.style.opacity = '1';
        const serving = m.serving === side && slot.zone === 1;
        g.querySelector('.pdot-body').setAttribute('stroke', serving ? '#fff' : 'rgba(0,0,0,.35)');
        g.querySelector('.pdot-body').setAttribute('stroke-width', serving ? 2.2 : 1);
        seen[slot.player.id] = true;
      });
    });
    // запасные ждут за пределами площадки
    Object.keys(c.dots).forEach((id) => {
      if (seen[id]) return;
      c.dots[id].style.display = 'none';
    });
  }

  /** полёт мяча по дуге между двумя точками */
  function flyBall(from, to, ms) {
    const c = live.court;
    if (!from || !to) return;
    if (c.reduce) {
      c.ball.setAttribute('cx', to[0]); c.ball.setAttribute('cy', to[1]);
      c.shadow.setAttribute('cx', to[0]); c.shadow.setAttribute('cy', to[1] + 6);
      return;
    }
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 34];
    const t0 = performance.now();
    if (live.ballRaf) cancelAnimationFrame(live.ballRaf);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const inv = 1 - t;
      const x = inv * inv * from[0] + 2 * inv * t * mid[0] + t * t * to[0];
      const y = inv * inv * from[1] + 2 * inv * t * mid[1] + t * t * to[1];
      c.ball.setAttribute('cx', x.toFixed(1));
      c.ball.setAttribute('cy', y.toFixed(1));
      c.ball.setAttribute('r', (4.2 + Math.sin(t * Math.PI) * 1.6).toFixed(1));
      c.shadow.setAttribute('cx', x.toFixed(1));
      c.shadow.setAttribute('cy', (inv * from[1] + t * to[1] + 7).toFixed(1));
      c.shadow.setAttribute('rx', (5 - Math.sin(t * Math.PI) * 1.6).toFixed(1));
      if (t < 1) live.ballRaf = requestAnimationFrame(step);
    };
    live.ballRaf = requestAnimationFrame(step);
  }

  /** вспышка трибун на очко */
  function crowdFlash(mine, strength) {
    const c = live.court;
    if (c.reduce) return;
    const pick = Math.round(c.crowd.length * (0.25 + strength * 0.4));
    for (let i = 0; i < pick; i++) {
      const dot = c.crowd[Math.floor(Math.random() * c.crowd.length)];
      if (!dot) continue;
      dot.classList.remove('cheer');
      void dot.getBoundingClientRect();
      dot.style.setProperty('--cheer', mine ? '#ffd166' : '#8fa3c8');
      dot.classList.add('cheer');
      setTimeout(() => dot.classList.remove('cheer'), 700);
    }
  }

  /** реклама на бортах меняется по ходу матча */
  function rotateBoards() {
    const c = live.court;
    if (!c || !c.texts.length) return;
    c.boards.forEach((t, i) => {
      const next = c.texts[(c.boardIndex + i) % c.texts.length];
      t.style.opacity = '0';
      setTimeout(() => { t.textContent = next; t.style.opacity = '1'; }, 220);
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
    const rec = step.record;
    const mine = (rec.winner === 'h') === live.isHome;
    const big = Math.max(rec.h, rec.a) >= live.match.target - 2;
    crowdFlash(mine, big ? 1 : 0.55);
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
