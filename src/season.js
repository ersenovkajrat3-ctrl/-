/* Сетка — сезон: календарь, симуляция тура, Кубок страны, еврокубки CEV,
   плей-офф по образцу Суперлиги, повышения/вылеты и межсезонье. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U, DIVISIONS, EURO_CUPS, FOREIGN_LIMIT } = S;
  const P = S.Players, W = S.World, Ec = S.Economy, E = S.Engine;

  const CUP_ROUNDS = [
    { key: 'r32', name: '1/16 финала', week: 6 },
    { key: 'r16', name: '1/8 финала', week: 11 },
    { key: 'qf', name: '1/4 финала', week: 16 },
    { key: 'sf', name: '1/2 финала', week: 21 },
    { key: 'final', name: 'Финал Кубка', week: 26 },
  ];
  const PLAYOFF_WEEKS = { qual: 31, qf: 32, sf: 33, final: 34 };
  const EURO_KO = { qf: 24, sf: 35, final: 36 };
  const SEASON_END_WEEK = 37;
  const MONTH_WEEKS = [4, 8, 12, 16, 20, 24, 28, 32, 36];

  /* ---------- доступ к участникам ---------- */
  function team(game, id) {
    return game.clubs[id] || game.euroClubs.find((c) => c.id === id) || null;
  }
  function isForeign(game, id) { return !game.clubs[id]; }
  function teamName(game, id) { const t = team(game, id); return t ? t.name : '—'; }

  /* ---------- вспомогательный абстрактный матч (зарубеж vs зарубеж) ---------- */
  function abstractMatch(rng, powerA, powerB) {
    const p = 1 / (1 + Math.pow(10, (powerB - powerA) / 13));
    const aWin = rng.chance(p);
    const margin = Math.abs(p - 0.5);
    const r = rng.next();
    let sets;
    if (r < 0.34 + margin) sets = [3, 0];
    else if (r < 0.70 + margin * 0.5) sets = [3, 1];
    else sets = [3, 2];
    return aWin ? { score: sets, winner: 'h' } : { score: [sets[1], sets[0]], winner: 'a' };
  }

  /* ---------- состав на матч ---------- */
  function available(game, club) {
    return club.squad.map((id) => game.players[id]).filter((p) => p && !(p.injury > 0));
  }

  function buildSide(game, clubId, opts = {}) {
    const club = game.clubs[clubId];
    const inj = club.squad.map((id) => game.players[id]).filter((p) => p && p.injury > 0).map((p) => p.id);
    let lineup = (club.lineup || []).filter((id) => !inj.includes(id));
    let libero = club.liberoId && !inj.includes(club.liberoId) ? club.liberoId : null;
    // ИИ ставит свежих каждый матч; клуб игрока — только при авто-ротации или вынужденно
    const needAuto = !club.isPlayer || club.autoRotate !== false || lineup.length < 6 || !libero;
    if (needAuto) {
      W.autoLineupAvailable(game, club);
      lineup = club.lineup; libero = club.liberoId;
    }
    const players = lineup.map((id) => game.players[id]).filter(Boolean);
    const lib = libero ? game.players[libero] : null;
    players.concat(lib ? [lib] : []).forEach((p) => { p.st = P.emptyStats(); });
    const side = new E.Side(club, players, lib, club.tactics, {
      human: club.isPlayer,
      aiSkill: club.aiSkill,
      bench: available(game, club).filter((p) => !lineup.includes(p.id) && p.id !== libero),
    });
    side.clubId = clubId;
    return side;
  }

  /* ---------- последствия матча ---------- */
  function afterMatch(game, side, won, opts = {}) {
    const club = game.clubs[side.clubId];
    const rng = game._rng;
    const squad = side.order.concat(side.libero ? [side.libero] : []);
    squad.forEach((p) => {
      p.st.matches = 1;
      P.addStats(p.season, p.st);
      // форма и мораль
      const perf = (p.st.points || 0) - (p.st.attackErrors || 0) * 0.7 - (p.st.serveErrors || 0) * 0.5;
      p.form = U.clamp(p.form + U.clamp(perf * 0.6, -6, 6) + (won ? 2 : -2), 15, 95);
      p.morale = U.clamp(p.morale + (won ? 2.2 : -2.6), 10, 95);
      // травмы: тем вероятнее, чем выше усталость
      const risk = 0.006 + (p.fatigue / 100) * 0.022 + Math.max(0, p.age - 30) * 0.001;
      if (rng.chance(risk)) {
        p.injury = rng.int(1, p.fatigue > 70 ? 8 : 4);
        p.injuryNote = rng.pick(['растяжение голеностопа', 'спина', 'плечо', 'колено', 'мышца бедра']);
        if (club.isPlayer) game.inbox.unshift({ week: game.week, kind: 'injury', text: P.fullName(p) + ' травмирован (' + p.injuryNote + '), вне игры ' + p.injury + ' ' + U.plural(p.injury, ['неделю', 'недели', 'недель']) + '.' });
      }
    });
    club.form.push(won ? 'w' : 'l');
    if (club.form.length > 10) club.form.shift();
  }

  /** восстановление между турами */
  function weeklyRecovery(game) {
    Object.values(game.clubs).forEach((club) => {
      // медийность сама по себе оседает к уровню, который держит дивизион и репутация клуба
      const base = S.Feed.mediaBaseline(club);
      club.mediaIndex = U.clamp(club.mediaIndex + (base - club.mediaIndex) * 0.09, 5, 99);
      const rec = 9 + club.arena.base * 2.2;
      club.squad.forEach((id) => {
        const p = game.players[id];
        if (!p) return;
        p.fatigue = U.clamp(p.fatigue - rec, 0, 100);
        if (p.injury > 0) { p.injury--; if (p.injury === 0) p.injuryNote = null; }
        p.form = U.clamp(p.form + (50 - p.form) * 0.06, 15, 95);
      });
    });
  }

  /* ---------- симуляция одного матча ---------- */
  /** создать пошаговый матч (для просмотра вживую); null — если обе команды зарубежные */
  function createMatch(game, fx) {
    const rng = game._rng;
    const hForeign = isForeign(game, fx.h), aForeign = isForeign(game, fx.a);
    if (hForeign && aForeign) return null;
    if (hForeign || aForeign) ensureEuroSquad(game, hForeign ? fx.h : fx.a);
    const home = hForeign ? buildEuroSide(game, fx.h) : buildSide(game, fx.h);
    const away = aForeign ? buildEuroSide(game, fx.a) : buildSide(game, fx.a);
    const homeClub = game.clubs[fx.h], awayClub = game.clubs[fx.a];
    let homeBonus = 1.6;
    // провокационный тон в ленте заводит соперника: он играет против клуба игрока злее
    if (homeClub && !homeClub.isPlayer && awayClub && awayClub.isPlayer && game.settings.tone === 'provoc') homeBonus += 1.4;
    if (homeClub && homeClub.isPlayer && awayClub && !awayClub.isPlayer && game.settings.tone === 'provoc') homeBonus -= 0.9;
    const match = new E.Match(rng, home, away, {
      homeBonus,
      trainingLevel: homeClub ? homeClub.arena.base : 0,
      awayTrainingLevel: awayClub ? awayClub.arena.base : 0,
    });
    match.fixture = fx;
    return match;
  }

  /** записать результат матча в фикстуру и раздать последствия игрокам */
  function finalizeMatch(game, fx, match) {
    const log = match.log;
    const home = match.home, away = match.away;
    if (!isForeign(game, fx.h)) afterMatch(game, home, log.winner === home);
    if (!isForeign(game, fx.a)) afterMatch(game, away, log.winner === away);
    fx.result = {
      score: [home.sets, away.sets],
      setScores: log.setScores,
      stats: { h: home.stats, a: away.stats },
      mvp: log.mvp ? { id: log.mvp.id, name: P.fullName(log.mvp), points: log.mvp.st.points } : null,
    };
    fx.played = true;
    return fx.result;
  }

  function simMatch(game, fx, opts = {}) {
    const match = createMatch(game, fx);
    if (!match) {
      const r = abstractMatch(game._rng, team(game, fx.h).power, team(game, fx.a).power);
      fx.result = { score: r.score, setScores: [], abstract: true };
      fx.played = true;
      return fx.result;
    }
    match.runToEnd();
    const res = finalizeMatch(game, fx, match);
    if (opts.keepLog) fx.log = match.log;
    return res;
  }

  /* ---------- зарубежные соперники ---------- */
  function ensureEuroSquad(game, euroId) {
    game.euroSquads = game.euroSquads || {};
    if (game.euroSquads[euroId]) return game.euroSquads[euroId];
    const ec = game.euroClubs.find((c) => c.id === euroId);
    const rng = game._rng;
    const squad = P.makeSquad(rng, ec.power * 0.86 + 6, 0, euroId, 6);
    squad.forEach((p) => { p.foreign = true; game.players[p.id] = p; });
    game.euroSquads[euroId] = squad.map((p) => p.id);
    return game.euroSquads[euroId];
  }

  function buildEuroSide(game, euroId) {
    const ids = ensureEuroSquad(game, euroId);
    const squad = ids.map((id) => game.players[id]);
    const byRole = (r) => squad.filter((p) => p.role === r).sort((a, b) => P.overall(b) - P.overall(a));
    const line = [byRole('S')[0], byRole('OH')[0], byRole('MB')[0], byRole('OP')[0], byRole('OH')[1], byRole('MB')[1]].filter(Boolean);
    const lib = byRole('L')[0];
    line.concat(lib ? [lib] : []).forEach((p) => { p.st = P.emptyStats(); p.fatigue = Math.max(0, p.fatigue - 30); });
    const ec = game.euroClubs.find((c) => c.id === euroId);
    const side = new E.Side(ec, line, lib, null, {});
    side.clubId = euroId;
    side.foreign = true;
    return side;
  }

  /* ---------- таблица ---------- */
  function applyToTable(game, fx) {
    const div = game.divisions[fx.div];
    const [hs, as] = fx.result.score;
    const rh = div.table[fx.h], ra = div.table[fx.a];
    if (!rh || !ra) return;
    rh.p++; ra.p++;
    rh.setsW += hs; rh.setsL += as; ra.setsW += as; ra.setsL += hs;
    const hp = U.sum(fx.result.setScores, (s) => s[0]), ap = U.sum(fx.result.setScores, (s) => s[1]);
    rh.ptsW += hp; rh.ptsL += ap; ra.ptsW += ap; ra.ptsL += hp;
    rh.pts += W.tablePoints(hs, as); ra.pts += W.tablePoints(as, hs);
    if (hs > as) { rh.w++; ra.l++; rh.form.push('w'); ra.form.push('l'); }
    else { ra.w++; rh.l++; ra.form.push('w'); rh.form.push('l'); }
    [rh, ra].forEach((r) => { if (r.form.length > 5) r.form.shift(); });
    div.table[fx.h] = rh; div.table[fx.a] = ra;
  }

  /* ---------- построение сезона ---------- */
  function startSeason(game) {
    const rng = game._rng;
    W.buildSchedule(game);
    game.week = 0;
    game.phase = 'regular';
    game.fixtures = [];
    game.results = [];
    game.playoffs = null;
    game.seasonLabel = seasonLabel(game.season);
    Object.values(game.players).forEach((p) => { p.season = P.emptyStats(); p.fatigue = 0; p.injury = 0; });
    Object.values(game.clubs).forEach((c) => {
      c.form = [];
      c.finance.seasonIncome = 0; c.finance.seasonSpend = 0;
      W.autoLineupAvailable(game, c);
    });
    // лига
    game.divisions.forEach((d) => {
      d.rounds.forEach((round, i) => {
        round.forEach((m) => {
          game.fixtures.push({ id: 'fx' + U.id(), week: d.weeks[i], type: 'league', div: d.id, round: i + 1, h: m.h, a: m.a, played: false, result: null });
        });
      });
    });
    buildCup(game);
    buildEuro(game);
    // клуб игрока: предложения спонсоров и задача от совета
    const club = game.clubs[game.playerClubId];
    if (club) {
      game.offers.sponsors = Ec.generateSponsorOffers(game, club, rng, 3);
      game.board = makeObjective(game, club);
      game.inbox.unshift({ week: 0, kind: 'board', text: 'Совет директоров ставит задачу на сезон: ' + game.board.text });
    }
    S.Transfers.openWindow(game, 'preseason');
    return game;
  }

  function seasonLabel(n) {
    const y = 2025 + n - 1;
    return y + '/' + String((y + 1) % 100).padStart(2, '0');
  }

  function makeObjective(game, club) {
    const div = game.divisions[club.division];
    const ranked = div.clubIds.slice().sort((a, b) => W.clubPower(game, game.clubs[b]) - W.clubPower(game, game.clubs[a]));
    const pos = ranked.indexOf(club.id) + 1;
    const size = div.clubIds.length;
    if (pos <= 2) return { type: 'title', target: 1, text: 'стать чемпионом ' + DIVISIONS[club.division].nameGen + '.', fail: 3 };
    if (pos <= Math.ceil(size * 0.35)) return { type: 'top4', target: 4, text: 'финишировать в топ-4 регулярного чемпионата.', fail: 8 };
    if (pos <= Math.ceil(size * 0.7)) return { type: 'playoff', target: Math.min(8, size - 4), text: 'выйти в плей-офф.', fail: size - 2 };
    return { type: 'survive', target: size - 2, text: 'сохранить прописку в дивизионе.', fail: size - 1 };
  }

  /* ---------- Кубок страны ---------- */
  function buildCup(game) {
    const rng = game._rng;
    const pool = [];
    game.divisions.forEach((d) => {
      const ranked = d.clubIds.slice().sort((a, b) => game.clubs[b].reputation - game.clubs[a].reputation);
      if (d.id === 0) pool.push(...ranked);
      else if (d.id === 1) pool.push(...ranked);
      else if (d.id === 2) pool.push(...ranked.slice(0, 2));
    });
    const teams = rng.shuffle(pool).slice(0, 32);
    game.cup = { name: 'Кубок страны', round: 0, alive: teams, results: [], winner: null };
    scheduleCupRound(game);
  }

  function scheduleCupRound(game) {
    const cup = game.cup;
    const meta = CUP_ROUNDS[cup.round];
    if (!meta || cup.alive.length < 2) return;
    const rng = game._rng;
    const draw = rng.shuffle(cup.alive);
    for (let i = 0; i < draw.length; i += 2) {
      if (!draw[i + 1]) continue;
      // хозяин — клуб из более низкого дивизиона (как в реальных кубках)
      const a = draw[i], b = draw[i + 1];
      const h = game.clubs[a].division >= game.clubs[b].division ? a : b;
      const aw = h === a ? b : a;
      game.fixtures.push({ id: 'fx' + U.id(), week: meta.week, type: 'cup', stage: meta.name, stageKey: meta.key, h, a: aw, played: false, result: null });
    }
  }

  function resolveCupWeek(game) {
    const cup = game.cup;
    const meta = CUP_ROUNDS[cup.round];
    if (!meta) return;
    const played = game.fixtures.filter((f) => f.type === 'cup' && f.stageKey === meta.key && f.played);
    if (!played.length) return;
    const winners = played.map((f) => (f.result.score[0] > f.result.score[1] ? f.h : f.a));
    cup.alive = winners;
    cup.round++;
    if (meta.key === 'final') {
      cup.winner = winners[0];
      const c = game.clubs[cup.winner];
      c.trophies.push({ season: game.seasonLabel, name: 'Кубок страны' });
      S.Feed.event(game, c, 'trophy', { trophy: 'Кубок страны', club: c.name }, 1.6);
      if (c.isPlayer) {
        Ec.ledger(c, 'prize', 'Призовые: Кубок страны', Ec.PRIZE_BASE * 0.18);
        game.inbox.unshift({ week: game.week, kind: 'trophy', text: 'Кубок страны выигран! Призовые: ' + U.money(Ec.PRIZE_BASE * 0.18) });
      }
    } else {
      scheduleCupRound(game);
    }
  }

  /* ---------- еврокубки CEV ---------- */
  function buildEuro(game) {
    game.euro = null;
    const qual = game.euroQual || seedEuroQual(game);
    const clubId = game.playerClubId;
    const cupId = Object.keys(qual).find((k) => qual[k].includes(clubId));
    // фоновые еврокубки для новостей — победитель разыгрывается абстрактно в конце сезона
    game.euroBackground = qual;
    if (!cupId) return;
    const cup = EURO_CUPS.find((c) => c.id === cupId);
    const club = game.clubs[clubId];
    // проверка лицензии арены — реальный критерий CEV, а не только место в таблице
    const cap = W.arenaCapacity(club);
    if (cap < cup.minCapacity || (cup.needMedia && club.arena.media < 2)) {
      const reasons = [];
      if (cap < cup.minCapacity) reasons.push('вместимость арены ' + U.num(cap) + ' при минимуме ' + U.num(cup.minCapacity));
      if (cup.needMedia && club.arena.media < 2) reasons.push('нет второго уровня освещения и медиа-инфраструктуры (LED-свет, 5 HD-камер, трансляция)');
      game.inbox.unshift({
        week: 0, kind: 'euro',
        text: 'Клуб пробился в ' + cup.name + ' по спорту, но CEV отказала в лицензии: ' + reasons.join('; ') +
          '. Путёвка передана следующему клубу — арену надо достраивать.',
      });
      return;
    }
    const rng = game._rng;
    const pool = rng.shuffle(game.euroClubs.slice()).sort((a, b) => b.power - a.power);
    const band = cupId === 'ucl' ? pool.slice(0, 14) : cupId === 'cev' ? pool.slice(8, 24) : pool.slice(16);
    const rivals = rng.shuffle(band).slice(0, 3);
    const groupIds = [clubId].concat(rivals.map((r) => r.id));
    const rounds = W.roundRobin(groupIds, rng);
    game.euro = {
      cupId, name: cup.name, short: cup.short, group: groupIds,
      table: Object.fromEntries(groupIds.map((id) => [id, { p: 0, w: 0, l: 0, pts: 0, setsW: 0, setsL: 0 }])),
      stage: 'group', knockout: [], done: false, result: null,
    };
    rounds.forEach((round, i) => {
      round.forEach((m) => {
        game.fixtures.push({ id: 'fx' + U.id(), week: W.EURO_GROUP_WEEKS[i], type: 'euro', stage: 'Групповой этап, тур ' + (i + 1), stageKey: 'group', h: m.h, a: m.a, played: false, result: null });
      });
    });
    S.Feed.event(game, club, 'euro', { cup: cup.name, club: club.name }, 1.5);
  }

  /** для первого сезона: путёвки раздаём по репутации клубов Суперлиги */
  function seedEuroQual(game) {
    const sl = game.divisions[0].clubIds.slice().sort((a, b) => game.clubs[b].reputation - game.clubs[a].reputation);
    return { ucl: sl.slice(0, 2), cev: sl.slice(2, 4), ch: sl.slice(4, 6) };
  }

  function applyEuroTable(game, fx) {
    const eu = game.euro;
    if (!eu || fx.stageKey !== 'group') return;
    const [hs, as] = fx.result.score;
    const rh = eu.table[fx.h], ra = eu.table[fx.a];
    if (!rh || !ra) return;
    rh.p++; ra.p++; rh.setsW += hs; rh.setsL += as; ra.setsW += as; ra.setsL += hs;
    rh.pts += W.tablePoints(hs, as); ra.pts += W.tablePoints(as, hs);
    if (hs > as) { rh.w++; ra.l++; } else { ra.w++; rh.l++; }
  }

  function euroStandings(game) {
    const eu = game.euro;
    return eu.group.slice().sort((a, b) => {
      const ra = eu.table[a], rb = eu.table[b];
      if (rb.pts !== ra.pts) return rb.pts - ra.pts;
      return (rb.setsW - rb.setsL) - (ra.setsW - ra.setsL);
    });
  }

  function advanceEuro(game) {
    const eu = game.euro;
    if (!eu || eu.done) return;
    const rng = game._rng;
    const club = game.clubs[game.playerClubId];
    const cup = EURO_CUPS.find((c) => c.id === eu.cupId);
    if (eu.stage === 'group' && game.week >= W.EURO_GROUP_WEEKS[W.EURO_GROUP_WEEKS.length - 1]) {
      const st = euroStandings(game);
      const pos = st.indexOf(game.playerClubId) + 1;
      eu.groupPosition = pos;
      Ec.ledger(club, 'prize', 'Призовые ' + cup.short + ': групповой этап', Ec.euroPrize(eu.cupId, 'group'));
      if (pos <= 2) {
        eu.stage = 'qf';
        const rival = rng.pick(game.euroClubs.filter((c) => !eu.group.includes(c.id)));
        game.fixtures.push({ id: 'fx' + U.id(), week: EURO_KO.qf, type: 'euro', stage: '1/4 финала', stageKey: 'qf', h: game.playerClubId, a: rival.id, played: false, result: null });
        game.inbox.unshift({ week: game.week, kind: 'euro', text: 'Группа пройдена с ' + pos + '-го места. В 1/4 финала ' + cup.short + ' соперник — ' + rival.name + ' (' + rival.country + ').' });
      } else {
        eu.done = true; eu.result = 'Групповой этап, ' + pos + '-е место';
        game.inbox.unshift({ week: game.week, kind: 'euro', text: 'Еврокубковый поход закончен: ' + pos + '-е место в группе ' + cup.short + '.' });
      }
      return;
    }
    const ko = game.fixtures.filter((f) => f.type === 'euro' && f.played && ['qf', 'sf', 'final'].includes(f.stageKey));
    const last = ko[ko.length - 1];
    if (!last) return;
    const won = (last.h === game.playerClubId) === (last.result.score[0] > last.result.score[1]);
    if (last.stageKey === 'qf' && eu.stage === 'qf') {
      Ec.ledger(club, 'prize', 'Призовые ' + cup.short + ': 1/4 финала', Ec.euroPrize(eu.cupId, 'qf'));
      if (won) {
        eu.stage = 'sf';
        const rival = rng.pick(game.euroClubs.filter((c) => !eu.group.includes(c.id) && c.id !== last.a && c.id !== last.h));
        game.fixtures.push({ id: 'fx' + U.id(), week: EURO_KO.sf, type: 'euro', stage: '«Финал четырёх», 1/2', stageKey: 'sf', h: game.playerClubId, a: rival.id, played: false, result: null });
        game.inbox.unshift({ week: game.week, kind: 'euro', text: 'Клуб вышел в «Финал четырёх» ' + cup.short + '! Полуфинал против ' + rival.name + '.' });
      } else { eu.done = true; eu.result = '1/4 финала'; }
    } else if (last.stageKey === 'sf' && eu.stage === 'sf') {
      Ec.ledger(club, 'prize', 'Призовые ' + cup.short + ': полуфинал', Ec.euroPrize(eu.cupId, 'sf'));
      if (won) {
        eu.stage = 'final';
        const rival = rng.pick(game.euroClubs.filter((c) => c.id !== last.a));
        game.fixtures.push({ id: 'fx' + U.id(), week: EURO_KO.final, type: 'euro', stage: 'ФИНАЛ ' + cup.short, stageKey: 'final', h: game.playerClubId, a: rival.id, played: false, result: null });
      } else { eu.done = true; eu.result = 'Полуфинал'; }
    } else if (last.stageKey === 'final' && eu.stage === 'final') {
      eu.done = true;
      if (won) {
        eu.result = 'ПОБЕДА';
        Ec.ledger(club, 'prize', 'Призовые ' + cup.short + ': победа', Ec.euroPrize(eu.cupId, 'win'));
        club.trophies.push({ season: game.seasonLabel, name: cup.name });
        S.Feed.event(game, club, 'trophy', { trophy: cup.name, club: club.name }, 2);
      } else {
        eu.result = 'Финал';
        Ec.ledger(club, 'prize', 'Призовые ' + cup.short + ': финал', Ec.euroPrize(eu.cupId, 'final'));
      }
    }
  }

  S.Season = {
    CUP_ROUNDS, PLAYOFF_WEEKS, EURO_KO, SEASON_END_WEEK, MONTH_WEEKS,
    team, isForeign, teamName, abstractMatch, buildSide, buildEuroSide, simMatch, createMatch, finalizeMatch, applyToTable,
    startSeason, seasonLabel, makeObjective, buildCup, scheduleCupRound, resolveCupWeek,
    buildEuro, seedEuroQual, applyEuroTable, euroStandings, advanceEuro,
    weeklyRecovery, available, afterMatch, ensureEuroSquad,
  };
})(typeof window !== 'undefined' ? window : globalThis);
