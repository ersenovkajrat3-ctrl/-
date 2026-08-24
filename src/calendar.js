/* Сетка — ход сезона: неделя за неделей, плей-офф, межсезонье. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U, DIVISIONS, EURO_CUPS } = S;
  const P = S.Players, W = S.World, Ec = S.Economy, Sn = S.Season;

  /* ---------- неделя ---------- */
  function weekLabel(game) {
    return 'Неделя ' + game.week + ' · ' + U.dateLabel(game.week * 7);
  }

  function startWeek(game) {
    if (game.phase === 'offseason') return { week: game.week, fixtures: [], playerFixtures: [], seasonOver: true };
    game.week++;
    if (game.week === W.PLAYOFF_START) buildPlayoffs(game);
    if (game.week > Sn.SEASON_END_WEEK) return { seasonOver: true, week: game.week, fixtures: [], playerFixtures: [] };
    const fixtures = game.fixtures.filter((f) => f.week === game.week && !f.played);
    return {
      week: game.week,
      label: weekLabel(game),
      fixtures,
      playerFixtures: fixtures.filter((f) => f.h === game.playerClubId || f.a === game.playerClubId),
    };
  }

  /** следующий несыгранный матч клуба игрока на этой неделе (учитывает отменённые игры серии) */
  function nextPlayerFixture(game) {
    const list = game.fixtures
      .filter((f) => f.week === game.week && !f.played && !f.cancelled && (f.h === game.playerClubId || f.a === game.playerClubId))
      .sort((a, b) => (a.gameNo || 0) - (b.gameNo || 0));
    return list[0] || null;
  }

  /** учёт результата: таблица, серия плей-офф, деньги, лента */
  function applyFixtureResult(game, fx) {
    const res = fx.result;
    if (!res) return;
    const homeIsClub = !!game.clubs[fx.h];
    const awayIsClub = !!game.clubs[fx.a];
    if (fx.type === 'league') applyToTableSafe(game, fx);
    if (fx.type === 'euro') Sn.applyEuroTable(game, fx);
    if (fx.series) updateSeries(game, fx);
    // деньги за домашний матч
    if (homeIsClub && fx.type !== 'friendly') {
      const opp = awayIsClub ? game.clubs[fx.a] : Sn.team(game, fx.a);
      const inc = Ec.matchdayIncome(game, game.clubs[fx.h], opp);
      fx.attendance = inc.attendance;
    }
    game.results.unshift({
      week: game.week, type: fx.type, stage: fx.stage, div: fx.div,
      h: fx.h, a: fx.a, hn: Sn.teamName(game, fx.h), an: Sn.teamName(game, fx.a),
      score: res.score, setScores: res.setScores,
    });
    if (game.results.length > 400) game.results.pop();
    // лента реагирует на матч клуба игрока
    const pid = game.playerClubId;
    if (pid && (fx.h === pid || fx.a === pid)) {
      const club = game.clubs[pid];
      const win = (fx.h === pid) === (res.score[0] > res.score[1]);
      const oppName = Sn.teamName(game, fx.h === pid ? fx.a : fx.h);
      const scoreStr = (fx.h === pid ? res.score : [res.score[1], res.score[0]]).join(':');
      const streak = club.form.slice().reverse().findIndex((f) => f !== (win ? 'w' : 'l'));
      const importance = fx.type === 'league' ? (fx.stageKey ? 1.5 : 0.9) : 1.3;
      S.Feed.event(game, club, win ? 'win' : 'loss',
        { score: scoreStr, opp: oppName, club: club.name, streak: (streak < 0 ? club.form.length : streak) },
        importance, { positive: win });
    }
  }

  function applyToTableSafe(game, fx) {
    const div = game.divisions[fx.div];
    if (div && div.table[fx.h] && div.table[fx.a]) Sn.applyToTable(game, fx);
  }

  /** сыграть матч и учесть его */
  function playFixture(game, fx, opts = {}) {
    const res = Sn.simMatch(game, fx, opts);
    applyFixtureResult(game, fx);
    return res;
  }

  /** досимулировать неделю и закрыть её */
  function completeWeek(game) {
    const events = [];
    const rest = game.fixtures
      .filter((f) => f.week === game.week && !f.played && !f.cancelled)
      .sort((a, b) => (a.gameNo || 0) - (b.gameNo || 0));
    rest.forEach((fx) => {
      if (fx.series && seriesDecided(game, fx.series)) { fx.cancelled = true; fx.played = true; return; }
      playFixture(game, fx);
    });
    // кубок
    if (Sn.CUP_ROUNDS.some((r) => r.week === game.week)) Sn.resolveCupWeek(game);
    // еврокубки
    if (game.euro && (W.EURO_GROUP_WEEKS.includes(game.week) || Object.values(Sn.EURO_KO).includes(game.week))) Sn.advanceEuro(game);
    // плей-офф: продвижение по стадиям
    if (game.playoffs) advancePlayoffs(game);
    // экономика раз в месяц
    if (Sn.MONTH_WEEKS.includes(game.week)) {
      Object.values(game.clubs).forEach((club) => {
        const out = Sn.MONTH_WEEKS.includes(game.week) ? Ec.monthlyTick(game, club) : [];
        if (club.isPlayer) {
          events.push({ kind: 'finance', items: out });
          out.forEach((o) => {
            if (o.built) S.Feed.event(game, club, 'arena', { object: o.built.name }, 1.2);
            if (o.expired) game.inbox.unshift({ week: game.week, kind: 'sponsor', text: o.label + '. Нужен новый партнёр.' });
          });
          checkBankruptcy(game, club, events);
        }
      });
      // в середине сезона спонсоры выходят на связь заново
      if (game.week === 20 && game.playerClubId) {
        const club = game.clubs[game.playerClubId];
        const offers = Ec.generateSponsorOffers(game, club, game._rng, 2);
        if (offers.length) {
          game.offers.sponsors = game.offers.sponsors.concat(offers);
          game.inbox.unshift({ week: game.week, kind: 'sponsor', text: 'Новые спонсорские предложения на столе: ' + offers.map((o) => o.brand).join(', ') + '.' });
        }
      }
    }
    // зимнее трансферное окно
    if (game.week === 18) S.Transfers.openWindow(game, 'winter');
    if (game.week === 22) S.Transfers.closeWindow(game);
    S.Transfers.aiTick(game);
    Sn.weeklyRecovery(game);
    if (game.playerClubId) S.Feed.idleChatter(game, game.clubs[game.playerClubId]);
    if (game.week >= Sn.SEASON_END_WEEK) { game.phase = 'offseason'; }
    return events;
  }

  function checkBankruptcy(game, club, events) {
    if (club.finance.balance < 0) {
      club.finance.negativeMonths = (club.finance.negativeMonths || 0) + 1;
      if (club.finance.negativeMonths >= 3) {
        game.inbox.unshift({ week: game.week, kind: 'board', text: 'Совет директоров: третий месяц подряд минус на счёте. Ещё один — и с вами расстанутся.' });
      } else {
        game.inbox.unshift({ week: game.week, kind: 'board', text: 'Баланс клуба ушёл в минус (' + U.money(club.finance.balance) + '). Совет ждёт объяснений.' });
      }
      if (club.finance.negativeMonths >= 4) { game.dismissed = { reason: 'финансы' }; }
    } else club.finance.negativeMonths = 0;
  }

  /* ---------- плей-офф ---------- */
  function seriesById(game, id) {
    if (!game.playoffs) return null;
    for (const d of Object.keys(game.playoffs.byDiv)) {
      const s = game.playoffs.byDiv[d].series.find((x) => x.id === id);
      if (s) return s;
    }
    return null;
  }
  function seriesDecided(game, id) {
    const s = seriesById(game, id);
    return s ? s.wins[0] >= s.toWin || s.wins[1] >= s.toWin : false;
  }
  function updateSeries(game, fx) {
    const s = seriesById(game, fx.series);
    if (!s) return;
    const winnerId = fx.result.score[0] > fx.result.score[1] ? fx.h : fx.a;
    s.wins[winnerId === s.a ? 0 : 1]++;
    s.log.push({ h: fx.h, a: fx.a, score: fx.result.score });
    if (s.wins[0] >= s.toWin || s.wins[1] >= s.toWin) {
      s.winner = s.wins[0] >= s.toWin ? s.a : s.b;
      s.loser = s.winner === s.a ? s.b : s.a;
      game.fixtures.filter((f) => f.series === s.id && !f.played).forEach((f) => { f.cancelled = true; f.played = true; });
    }
  }

  function makeSeries(game, divId, stageKey, stageName, pairs, toWin, week) {
    const out = [];
    pairs.forEach((pair, i) => {
      const id = 'sr' + U.id();
      const homes = toWin === 2 ? [pair[0], pair[1], pair[0]] : [pair[0], pair[0], pair[1], pair[1], pair[0]];
      const s = { id, div: divId, stage: stageKey, stageName, a: pair[0], b: pair[1], wins: [0, 0], toWin, log: [], winner: null };
      homes.forEach((h, gi) => {
        const away = h === pair[0] ? pair[1] : pair[0];
        game.fixtures.push({
          id: 'fx' + U.id(), week, type: 'playoff', div: divId, stage: stageName + ' · матч ' + (gi + 1),
          stageKey, series: id, gameNo: gi + 1, h, a: away, played: false, result: null,
        });
      });
      out.push(s);
    });
    return out;
  }

  function buildPlayoffs(game) {
    game.phase = 'playoff';
    game.playoffs = { byDiv: {} };
    game.divisions.forEach((d) => {
      const order = W.sortTable(d);
      d.finalTable = order;
      const size = order.length;
      const st = { stage: null, series: [], order, champion: null };
      if (d.id === 0) {
        // как в реальной Суперлиге: 1–4 сразу в 1/4, 5–12 играют квалификацию
        const pairs = [[order[4], order[11]], [order[5], order[10]], [order[6], order[9]], [order[7], order[8]]];
        st.series = makeSeries(game, d.id, 'qual', 'Квалификация плей-офф', pairs, 2, Sn.PLAYOFF_WEEKS.qual);
        st.stage = 'qual';
      } else {
        const pairs = [[order[0], order[7]], [order[1], order[6]], [order[2], order[5]], [order[3], order[4]]];
        st.series = makeSeries(game, d.id, 'qf', '1/4 финала', pairs, 2, Sn.PLAYOFF_WEEKS.qf);
        st.stage = 'qf';
      }
      game.playoffs.byDiv[d.id] = st;
    });
    if (game.playerClubId) {
      const club = game.clubs[game.playerClubId];
      const st = game.playoffs.byDiv[club.division];
      const inPlayoff = st.series.some((s) => s.a === club.id || s.b === club.id);
      const pos = st.order.indexOf(club.id) + 1;
      game.inbox.unshift({
        week: game.week, kind: 'season',
        text: 'Регулярный чемпионат завершён: ' + pos + '-е место. ' +
          (club.division === 0 && pos <= 4 ? 'Клуб сразу в 1/4 финала.' : inPlayoff ? 'Клуб в плей-офф.' : 'В плей-офф пробиться не удалось.'),
      });
    }
  }

  function advancePlayoffs(game) {
    const wk = game.week;
    Object.keys(game.playoffs.byDiv).forEach((divKey) => {
      const st = game.playoffs.byDiv[divKey];
      const d = game.divisions[Number(divKey)];
      const done = st.series.every((s) => s.winner);
      if (!done) return;
      const order = st.order;
      if (st.stage === 'qual' && wk >= Sn.PLAYOFF_WEEKS.qual) {
        const winners = st.series.map((s) => s.winner);
        const bySeed = (id) => order.indexOf(id);
        winners.sort((a, b) => bySeed(a) - bySeed(b));
        const pairs = [[order[0], winners[3]], [order[1], winners[2]], [order[2], winners[1]], [order[3], winners[0]]];
        st.series = makeSeries(game, d.id, 'qf', '1/4 финала', pairs, 2, Sn.PLAYOFF_WEEKS.qf);
        st.stage = 'qf';
      } else if (st.stage === 'qf' && wk >= Sn.PLAYOFF_WEEKS.qf) {
        const w = st.series.map((s) => s.winner);
        const pairs = [[w[0], w[3]], [w[1], w[2]]];
        st.series = makeSeries(game, d.id, 'sf', '1/2 финала', pairs, d.id === 0 ? 3 : 2, Sn.PLAYOFF_WEEKS.sf);
        st.stage = 'sf';
      } else if (st.stage === 'sf' && wk >= Sn.PLAYOFF_WEEKS.sf) {
        const w = st.series.map((s) => s.winner);
        const losers = st.series.map((s) => s.loser);
        st.thirdPlace = losers;
        st.series = makeSeries(game, d.id, 'final', 'Финал ' + d.name, [[w[0], w[1]]], 3, Sn.PLAYOFF_WEEKS.final);
        st.stage = 'final';
      } else if (st.stage === 'final' && wk >= Sn.PLAYOFF_WEEKS.final) {
        const s = st.series[0];
        st.champion = s.winner;
        st.runnerUp = s.loser;
        st.stage = 'done';
        const champ = game.clubs[st.champion];
        champ.trophies.push({ season: game.seasonLabel, name: d.name });
        S.Feed.event(game, champ, 'trophy', { trophy: d.name, club: champ.name }, 1.8);
      }
    });
  }

  /* ---------- межсезонье ---------- */
  function endSeason(game) {
    const rng = game._rng;
    const report = { season: game.seasonLabel, divisions: [], player: {}, dismissed: false };
    const playerClub = game.clubs[game.playerClubId];
    const nextQual = { ucl: [], cev: [], ch: [] };

    game.divisions.forEach((d) => {
      const st = game.playoffs ? game.playoffs.byDiv[d.id] : null;
      const order = W.sortTable(d); // итоговая таблица регулярного чемпионата
      const size = order.length;
      // призовые
      order.forEach((id, i) => {
        const club = game.clubs[id];
        const prize = Ec.prizeMoney(d.id, i + 1, size);
        Ec.ledger(club, 'prize', 'Призовые за ' + (i + 1) + '-е место', prize);
        club.history.push({ season: game.seasonLabel, division: d.name, position: i + 1 });
      });
      const champion = st ? st.champion : order[0];
      const runnerUp = st ? st.runnerUp : order[1];
      const relegated = DIVISIONS[d.id].relegate ? order.slice(size - DIVISIONS[d.id].relegate) : [];
      const promoted = d.id > 0 ? [champion, runnerUp].filter(Boolean) : [];
      d.champion = champion;
      report.divisions.push({ id: d.id, name: d.name, order, champion, runnerUp, promoted, relegated });
      if (d.id === 0) {
        const euroOrder = [champion, runnerUp].concat(order.filter((id) => id !== champion && id !== runnerUp));
        nextQual.ucl = euroOrder.slice(0, 2);
        nextQual.cev = euroOrder.slice(2, 4);
        nextQual.ch = euroOrder.slice(4, 6);
      }
    });

    // спонсорские бонусы и штрафы
    if (playerClub) {
      const d = game.divisions[playerClub.division];
      const st = game.playoffs.byDiv[playerClub.division];
      const pos = report.divisions[playerClub.division].order.indexOf(playerClub.id) + 1;
      const rel = report.divisions[playerClub.division].relegated.includes(playerClub.id);
      const euro = nextQual.ucl.concat(nextQual.cev, nextQual.ch).includes(playerClub.id);
      playerClub.finance.sponsors.forEach((s) => {
        if (pos <= 4 && s.bonusTop4) Ec.ledger(playerClub, 'sponsor', 'Бонус спонсора за топ-4: ' + s.brand, s.bonusTop4);
        if (euro && s.bonusEuro) Ec.ledger(playerClub, 'sponsor', 'Бонус спонсора за еврокубки: ' + s.brand, s.bonusEuro);
        if (rel && s.penaltyRelegation) Ec.ledger(playerClub, 'sponsor', 'Штраф спонсора за вылет: ' + s.brand, -s.penaltyRelegation);
      });
      report.player = { position: pos, champion: st.champion === playerClub.id, relegated: rel, euro, objective: game.board };
      // оценка совета директоров
      if (game.board && pos > game.board.fail) {
        report.dismissed = true;
        game.dismissed = { reason: 'результат', position: pos };
      }
    }

    // переходы между дивизионами
    report.divisions.forEach((r) => {
      r.relegated.forEach((id) => { game.clubs[id].division = Math.min(3, game.clubs[id].division + 1); game.clubs[id].tier = game.clubs[id].division; });
      r.promoted.forEach((id) => { game.clubs[id].division = Math.max(0, game.clubs[id].division - 1); game.clubs[id].tier = game.clubs[id].division; });
      r.promoted.forEach((id) => {
        const c = game.clubs[id];
        S.Feed.event(game, c, 'promo', { division: DIVISIONS[c.division].name, club: c.name }, 1.6);
      });
      r.relegated.forEach((id) => {
        const c = game.clubs[id];
        S.Feed.event(game, c, 'releg', { division: DIVISIONS[c.division].name, club: c.name }, 1.4, { positive: false });
      });
    });

    // еврокубки следующего сезона — с проверкой лицензии арены
    game.euroQual = nextQual;
    // развитие, возраст, завершение карьеры, молодёжь
    Object.values(game.clubs).forEach((club) => {
      const retire = [];
      club.squad.forEach((id) => {
        const p = game.players[id];
        if (!p) return;
        P.develop(rng, p, club.arena.base);
        p.contract.years--;
        if (p.age >= 39 || (p.age >= 34 && rng.chance(0.28 + (p.age - 34) * 0.12))) retire.push(id);
        else if (p.contract.years <= 0) {
          // автопродление с ростом зарплаты по текущему уровню
          const ovr = P.overall(p);
          p.contract.wage = Math.round(Math.max(p.contract.wage * 0.9, P.wageFor(ovr, club.division)) * rng.range(1.02, 1.18));
          p.contract.years = rng.int(1, 3);
        }
      });
      retire.forEach((id) => {
        const p = game.players[id];
        club.squad = club.squad.filter((x) => x !== id);
        if (club.isPlayer) game.inbox.unshift({ week: 0, kind: 'squad', text: P.fullName(p) + ' (' + p.age + ') завершает карьеру.' });
        delete game.players[id];
      });
      // выпуск академии
      const intake = 1 + (rng.chance(0.3 + club.arena.base * 0.15) ? 1 : 0);
      for (let i = 0; i < intake; i++) {
        const role = rng.pick(['OH', 'MB', 'OP', 'S', 'L']);
        const p = P.makePlayer(rng, role, club.level - 11 + club.arena.base * 2.2, {
          clubId: club.id, divisionId: club.division, age: rng.int(17, 19), foreign: false, youth: true,
        });
        game.players[p.id] = p;
        club.squad.push(p.id);
        if (club.isPlayer) game.inbox.unshift({ week: 0, kind: 'academy', text: 'Академия: ' + P.fullName(p) + ' (' + S.ROLES[p.role].name.toLowerCase() + ', ' + p.age + ') переведён в первую команду.' });
      }
      // добор состава, если кого-то не хватает по амплуа
      S.Transfers.fillSquad(game, club);
      club.reputation = U.clamp(club.reputation * 0.85 + W.clubPower(game, club) * 0.15, 20, 95);
      club.level = U.clamp(W.clubPower(game, club) * 0.9 + club.level * 0.1, 30, 90);
      W.autoLineupAvailable(game, club);
    });

    S.Transfers.aiOffseason(game);
    game.season++;
    game.stats.seasonsPlayed++;
    game.phase = 'preseason';
    game.lastReport = report;
    return report;
  }

  Object.assign(S.Season, {
    weekLabel, startWeek, nextPlayerFixture, playFixture, completeWeek, applyFixtureResult,
    buildPlayoffs, advancePlayoffs, endSeason, seriesById, seriesDecided, makeSeries,
  });
})(typeof window !== 'undefined' ? window : globalThis);
