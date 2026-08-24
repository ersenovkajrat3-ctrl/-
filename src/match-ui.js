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
    const sets = h('div', { class: 'm-sets' });
    m.log.setScores.forEach((sc, i) => {
      const mine = live.isHome ? sc[0] : sc[1];
      const theirs = live.isHome ? sc[1] : sc[0];
      sets.appendChild(h('span', { class: 'st' + (mine > theirs ? ' won' : ''), text: (i + 1) + ': ' + mine + '–' + theirs }));
    });
    live.head.appendChild(sets);
  }

  /* ---------- корт ---------- */
  function drawCourt(step) {
    const g = UI.game, m = live.match;
    const W_ = 320, H = 210, pad = 10;
    const cw = W_ - pad * 2, ch = H - pad * 2;
    const half = ch / 2;
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 ' + W_ + ' ' + H);
    s.setAttribute('class', 'court');
    const add = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      s.appendChild(e);
      return e;
    };
    add('rect', { x: 0, y: 0, width: W_, height: H, rx: 12, fill: '#8a3f0c' });
    add('rect', { x: pad, y: pad, width: cw, height: ch, fill: '#1d5fb5', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 1.4 });
    add('line', { x1: pad, y1: pad + half, x2: pad + cw, y2: pad + half, stroke: '#fff', 'stroke-width': 2.4 });
    // линии атаки
    add('line', { x1: pad, y1: pad + half * 0.42, x2: pad + cw, y2: pad + half * 0.42, stroke: 'rgba(255,255,255,.5)', 'stroke-width': 1 });
    add('line', { x1: pad, y1: pad + half + half * 0.58, x2: pad + cw, y2: pad + half + half * 0.58, stroke: 'rgba(255,255,255,.5)', 'stroke-width': 1 });

    const posOf = (zone, top) => {
      const [fx_, fy] = ZONE_POS[zone];
      const x = pad + (top ? 1 - fx_ : fx_) * cw;
      const y = top ? pad + (1 - fy) * half : pad + half + fy * half;
      return [x, y];
    };
    const draw = (side, top) => {
      const court = side.onCourt();
      court.forEach((slot) => {
        const [x, y] = posOf(slot.zone, top);
        const isLibero = slot.player.role === 'L';
        const serving = m.serving === side && slot.zone === 1;
        add('circle', {
          cx: x, cy: y, r: serving ? 11 : 9.5,
          fill: isLibero ? '#fde047' : (top ? '#2dd4bf' : '#ff9f1c'),
          stroke: serving ? '#fff' : 'rgba(0,0,0,.35)', 'stroke-width': serving ? 2 : 1,
          opacity: 0.95,
        });
        add('text', {
          x, y: y + 3.4, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 700,
          fill: '#12203a',
        }, ROLES[slot.player.role].short);
        // подпись всегда в сторону сетки, иначе она вылезает за пределы площадки
        add('text', {
          x, y: y + (top ? 17 : -12), 'text-anchor': 'middle', 'font-size': 7.5, fill: 'rgba(255,255,255,.82)',
        }, slot.player.last.slice(0, 10));
      });
    };
    draw(live.opp, true);
    draw(live.me, false);

    // дуга последнего действия
    if (step && step.ev) {
      const ev = step.ev;
      const atk = ev.attacker;
      const server = ev.server;
      const findSide = (pl) => (live.me.order.includes(pl) || live.me.libero === pl ? live.me : live.opp);
      let from = null, to = null;
      const other = (side) => (side === live.me ? live.opp : live.me);
      if (atk) {
        const side = findSide(atk);
        const slot = side.onCourt().find((x) => x.player === atk);
        if (slot) from = posOf(slot.zone, side === live.opp);
        const def = other(side);
        const digSlot = ev.digger && def.onCourt().find((x) => x.player === ev.digger);
        to = posOf(digSlot ? digSlot.zone : 6, def === live.opp);
      } else if (server) {
        const side = findSide(server);
        from = posOf(1, side === live.opp);
        const rcv = other(side);
        const recSlot = ev.receiver && rcv.onCourt().find((x) => x.player === ev.receiver);
        to = posOf(recSlot ? recSlot.zone : 6, rcv === live.opp);
      }
      if (from && to) {
        const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2 - 26;
        add('path', {
          d: 'M' + from[0] + ' ' + from[1] + ' Q' + mx + ' ' + my + ' ' + to[0] + ' ' + to[1],
          stroke: '#fff', 'stroke-width': 1.6, fill: 'none', 'stroke-dasharray': '4 3', opacity: .85,
        });
        add('circle', { cx: to[0], cy: to[1], r: 3.4, fill: '#fff' });
      }
    }
    live.courtWrap.innerHTML = '';
    live.courtWrap.appendChild(s);
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
    if (live) clearTimeout(live.timer);
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
    if (g.dismissed) { UI.dismissedScreen(); return; }
    if (g.phase === 'offseason') { UI.seasonReport(); return; }
    weekDigest(before);
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
