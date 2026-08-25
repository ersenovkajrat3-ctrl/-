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
      const inc = Ec.matchdayIncome(game, game.clubs[fx.h], opp, S.Weather && S.Weather.forFixture(game, fx));
      fx.attendance = inc.attendance;
      const hc = game.clubs[fx.h];
      hc.attendanceLog = hc.attendanceLog || [];
      hc.attendanceLog.push({ week: game.week, count: inc.attendance.count, fill: inc.attendance.fill, income: inc.total });
      if (hc.attendanceLog.length > 30) hc.attendanceLog.shift();
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
      const oppId = fx.h === pid ? fx.a : fx.h;
      if (win && game.clubs[oppId]) {
        club.fans.beatenRivals = club.fans.beatenRivals || [];
        if (!club.fans.beatenRivals.includes(oppId)) club.fans.beatenRivals.push(oppId);
        if (club.fans.demands.some((d) => d.rivalId === oppId)) S.Fans.unlock(game, club, 'derby');
      }
      const oppName = Sn.teamName(game, fx.h === pid ? fx.a : fx.h);
      const scoreStr = (fx.h === pid ? res.score : [res.score[1], res.score[0]]).join(':');
      const streak = club.form.slice().reverse().findIndex((f) => f !== (win ? 'w' : 'l'));
      const importance = fx.type === 'league' ? (fx.stageKey ? 1.5 : 0.9) : 1.3;
      const mvp = res.mvp;
      S.Feed.event(game, club, win ? 'win' : 'loss',
        { score: scoreStr, opp: oppName, club: club.name, streak: (streak < 0 ? club.form.length : streak),
          mvp: mvp ? mvp.name : 'связующий', pts: mvp ? mvp.points : 0,
          sets: fx.h === pid ? res.score : [res.score[1], res.score[0]] },
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
    // след для графиков: место в таблице после каждого тура
    if (game.playerClubId) {
      const club = game.clubs[game.playerClubId];
      const div = game.divisions[club.division];
      const played = div.table[club.id] ? div.table[club.id].p : 0;
      if (played) {
        club.positionLog = club.positionLog || [];
        const last = club.positionLog[club.positionLog.length - 1];
        if (!last || last.p !== played) {
          club.positionLog.push({ week: game.week, p: played, pos: W.sortTable(div).indexOf(club.id) + 1 });
        }
      }
    }
    // экономика раз в месяц
    if (Sn.MONTH_WEEKS.includes(game.week)) {
      Object.values(game.clubs).forEach((club) => {
        const out = Sn.MONTH_WEEKS.includes(game.week) ? Ec.monthlyTick(game, club) : [];
        if (club.isPlayer) {
          events.push({ kind: 'finance', items: out });
          out.forEach((o) => {
            if (o.built) { S.Feed.event(game, club, 'arena', { object: o.built.name }, 1.2); S.Fans.onArena(game, club, o.built.name); }
            if (o.expired) game.inbox.unshift({ week: game.week, kind: 'sponsor', text: o.label + '. Нужен новый партнёр.' });
          });
          checkFinances(game, club);
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
    if (game.playerClubId) {
      S.Feed.idleChatter(game, game.clubs[game.playerClubId]);
      if (S.Press) S.Press.weekly(game, game.clubs[game.playerClubId]);
    }
    if (game.week >= Sn.SEASON_END_WEEK) { game.phase = 'offseason'; }
    return events;
  }

  /* Тренера в «Сетке» не увольняют: совет может быть недоволен, урезать бюджет и
     потребовать объяснений, но карьера продолжается — партия не обрывается на полуслове. */
  function checkFinances(game, club) {
    if (club.finance.balance >= 0) { club.finance.negativeMonths = 0; return; }
    club.finance.negativeMonths = (club.finance.negativeMonths || 0) + 1;
    const n = club.finance.negativeMonths;
    if (n >= 3) {
      // учредитель закрывает дыру, но доверие падает, а трансферы замораживаются
      const rescue = Math.abs(club.finance.balance);
      Ec.ledger(club, 'founder', 'Экстренная помощь учредителя', rescue);
      trust(game, -12);
      club.finance.negativeMonths = 0;
      club.transferFreeze = 2;
      game.inbox.unshift({
        week: game.week, kind: 'board',
        text: 'Совет директоров закрыл минус на счёте (' + U.money(rescue) + '), но заморозил трансферы на два месяца. ' +
          'Доверие к вам упало до ' + Math.round(game.board.trust) + '.',
      });
    } else {
      game.inbox.unshift({ week: game.week, kind: 'board', text: 'Баланс клуба в минусе (' + U.money(club.finance.balance) + '). Совет ждёт объяснений.' });
    }
  }

  /** доверие совета: влияет на тон сообщений и на задачу следующего сезона, но не на вашу работу */
  function trust(game, delta) {
    if (!game.board) return 60;
    game.board.trust = U.clamp((game.board.trust != null ? game.board.trust : 60) + delta, 0, 100);
    return game.board.trust;
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
      // сыгранные раунды сохраняем, чтобы в интерфейсе была видна вся сетка, а не только текущая стадия
      const archive = () => {
        st.history = st.history || [];
        st.history.push({ stage: st.stage, stageName: st.series[0] ? st.series[0].stageName : '', series: st.series.slice() });
      };
      if (st.stage === 'qual' && wk >= Sn.PLAYOFF_WEEKS.qual) {
        archive();
        const winners = st.series.map((s) => s.winner);
        const bySeed = (id) => order.indexOf(id);
        winners.sort((a, b) => bySeed(a) - bySeed(b));
        const pairs = [[order[0], winners[3]], [order[1], winners[2]], [order[2], winners[1]], [order[3], winners[0]]];
        st.series = makeSeries(game, d.id, 'qf', '1/4 финала', pairs, 2, Sn.PLAYOFF_WEEKS.qf);
        st.stage = 'qf';
      } else if (st.stage === 'qf' && wk >= Sn.PLAYOFF_WEEKS.qf) {
        archive();
        const w = st.series.map((s) => s.winner);
        const pairs = [[w[0], w[3]], [w[1], w[2]]];
        st.series = makeSeries(game, d.id, 'sf', '1/2 финала', pairs, d.id === 0 ? 3 : 2, Sn.PLAYOFF_WEEKS.sf);
        st.stage = 'sf';
      } else if (st.stage === 'sf' && wk >= Sn.PLAYOFF_WEEKS.sf) {
        archive();
        const w = st.series.map((s) => s.winner);
        const losers = st.series.map((s) => s.loser);
        st.thirdPlace = losers;
        st.series = makeSeries(game, d.id, 'final', 'Финал ' + d.name, [[w[0], w[1]]], 3, Sn.PLAYOFF_WEEKS.final);
        st.stage = 'final';
      } else if (st.stage === 'final' && wk >= Sn.PLAYOFF_WEEKS.final) {
        archive();
        const s = st.series[0];
        st.champion = s.winner;
        st.runnerUp = s.loser;
        st.stage = 'done';
        const champ = game.clubs[st.champion];
        champ.trophies.push({ season: game.seasonLabel, name: d.name });
        S.Fans.onTrophy(game, champ);
        Ec.merchSpike(game, champ, 0.5);      // за чемпионской формой выстраивается очередь
        if (champ.isPlayer) {
          Sn.queueCeremony(game, {
            type: 'league', title: d.name, subtitle: 'Чемпионский титул', clubId: champ.id,
            awards: Sn.seasonAwards(game, d.id),
          });
        }
        S.Feed.event(game, champ, 'trophy', { trophy: d.name, club: champ.name }, 1.8);
      }
    });
  }

  /* ---------- межсезонье ---------- */
  function endSeason(game) {
    const rng = game._rng;
    const report = { season: game.seasonLabel, divisions: [], player: {} };
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
      // оценка совета директоров: доверие, а не увольнение
      if (game.board) {
        const met = pos <= game.board.target;
        const failed = pos > game.board.fail;
        trust(game, met ? 14 : failed ? -18 : 4);
        report.board = {
          met, failed, trust: Math.round(game.board.trust),
          text: met ? 'Совет доволен: задача сезона выполнена.'
            : failed ? 'Совет недоволен результатом, но контракт с вами продлён — работу продолжаете вы.'
              : 'Совет считает сезон приемлемым.',
        };
      }
    }

    // трибуны подводят свои итоги
    if (playerClub) {
      report.fans = {
        demands: S.Fans.checkDemands(game, playerClub),
        mood: Math.round(playerClub.fans.mood),
        members: playerClub.fans.members,
      };
      report.awards = Sn.seasonAwards(game, playerClub.division);
    }

    // переходы между дивизионами
    report.divisions.forEach((r) => {
      r.relegated.forEach((id) => { game.clubs[id].division = Math.min(3, game.clubs[id].division + 1); game.clubs[id].tier = game.clubs[id].division; });
      r.promoted.forEach((id) => { game.clubs[id].division = Math.max(0, game.clubs[id].division - 1); game.clubs[id].tier = game.clubs[id].division; });
      r.promoted.forEach((id) => {
        const c = game.clubs[id];
        S.Fans.onPromotion(game, c);
        Ec.merchSpike(game, c, 0.3);
        if (c.isPlayer) {
          Sn.queueCeremony(game, {
            type: 'promotion', title: DIVISIONS[c.division].name, subtitle: 'Клуб поднимается дивизионом выше', clubId: c.id,
          });
        }
        S.Feed.event(game, c, 'promo', { division: DIVISIONS[c.division].name, club: c.name }, 1.6);
      });
      r.relegated.forEach((id) => {
        const c = game.clubs[id];
        S.Fans.onRelegation(game, c);
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
      S.Fans.pickFavorite(game, club);
      club.reputation = U.clamp(club.reputation * 0.85 + W.clubPower(game, club) * 0.15, 20, 95);
      club.level = U.clamp(W.clubPower(game, club) * 0.9 + club.level * 0.1, 30, 90);
      W.autoLineupAvailable(game, club);
    });

    S.Transfers.aiOffseason(game);

    // лето: сборные разыгрывают свой турнир
    const nat = S.National.run(game);
    report.national = nat;
    if (playerClub) {
      const mine = nat.squad.filter((x) => {
        const p = game.players[x.id];
        return p && p.clubId === playerClub.id;
      });
      game.inbox.unshift({
        week: 0, kind: 'national',
        text: nat.tournament + ': сборная — ' + (nat.medal ? nat.medal.toUpperCase() : (nat.stage || 'групповой этап')) +
          '. Чемпион: ' + nat.champion + '.' + (mine.length ? ' От клуба вызывали: ' + mine.map((x) => x.name).join(', ') + '.' : ''),
      });
      if (nat.medal === 'золото' && mine.length) {
        Sn.queueCeremony(game, {
          type: 'national', title: nat.tournament, subtitle: 'Сборная — чемпион', clubId: playerClub.id,
        });
      }
    }

    game.season++;
    game.stats.seasonsPlayed++;
    game.phase = 'preseason';
    game.lastReport = report;
    return report;
  }

  Object.assign(S.Season, {
    weekLabel, startWeek, nextPlayerFixture, playFixture, completeWeek, applyFixtureResult,
    buildPlayoffs, advancePlayoffs, endSeason, seriesById, seriesDecided, makeSeries, trust,
  });
})(typeof window !== 'undefined' ? window : globalThis);
