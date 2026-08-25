/* Volleyball Manager — сезон: календарь, симуляция тура, Кубок страны, еврокубки CEV,
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
    // трибуны реагируют на результат: с кем играли, дома или в гостях, что за турнир
    S.Fans.afterMatch(game, club, {
      won, home: !!opts.home, opponent: opts.opponent, competition: opts.competition, sets: opts.sets,
    });
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
      S.Fans.weekly(game, club);
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
    // преимущество своей площадки дают трибуны: полупустой тихий зал почти не помогает
    let homeBonus = 1.6;
    if (fx.neutral) {
      // «Финал четырёх» в чужом городе: трибуны не свои, преимущества площадки нет
      homeBonus = 0;
      fx.attendanceHint = { fill: 0.92, count: 0, cap: 0, members: 0 };
      fx.support = 0.5;
    } else if (homeClub) {
      const att = Ec.attendance(game, homeClub, team(game, fx.a), S.Weather && S.Weather.forFixture(game, fx));
      fx.attendanceHint = att;
      homeBonus = S.Fans.homeBonus(game, homeClub, att.fill);
      if (!isFinite(homeBonus)) homeBonus = 1.6;
      fx.support = S.Fans.support(game, homeClub, att.fill);
    }
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
    const sets = [home.sets, away.sets];
    if (!isForeign(game, fx.h)) {
      afterMatch(game, home, log.winner === home, {
        home: true, opponent: team(game, fx.a), competition: fx.type, sets,
      });
    }
    if (!isForeign(game, fx.a)) {
      afterMatch(game, away, log.winner === away, {
        home: false, opponent: team(game, fx.h), competition: fx.type, sets: [away.sets, home.sets],
      });
    }
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
      c.finance.lastSnapshot = { income: 0, spend: 0 };
      c.positionLog = [];
      c.attendanceLog = [];
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
    buildEuroLeagues(game);   // чемпионаты Европы и их путёвки на этот сезон
    buildEuro(game);
    // трибуны: абонементы на сезон и ожидания
    Object.values(game.clubs).forEach((c) => {
      const sale = S.Fans.sellSeasonTickets(game, c);
      S.Fans.makeDemands(game, c);
      S.Fans.pickFavorite(game, c);
      if (c.isPlayer) {
        game.inbox.unshift({
          week: 0, kind: 'fans',
          text: 'Продано ' + U.num(sale.members) + ' ' + U.plural(sale.members, ['абонемент', 'абонемента', 'абонементов']) +
            ' по ' + U.money(sale.price) + ' — клуб получил ' + U.money(sale.income) + '. Трибуны ждут: ' +
            c.fans.demands.map((d) => d.text).join('; ') + '.',
        });
      }
    });
    // клуб игрока: предложения спонсоров и задача от совета
    const club = game.clubs[game.playerClubId];
    if (club) {
      game.offers.sponsors = Ec.generateSponsorOffers(game, club, rng, 3);
      const prevTrust = game.board && game.board.trust != null ? game.board.trust : 60;
      game.board = makeObjective(game, club);
      game.board.trust = prevTrust;
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
      S.Fans.onTrophy(game, c);
      Ec.merchSpike(game, c, 0.35);
      if (c.isPlayer) queueCeremony(game, { type: 'cup', title: 'Кубок страны', subtitle: 'Финал выигран', clubId: c.id });
      S.Feed.event(game, c, 'trophy', { trophy: 'Кубок страны', club: c.name, city: c.city, leagueName: DIVISIONS[c.division].name }, 1.6);
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
    const band = euroBand(game, cupId);
    // жеребьёвка по корзинам: из каждой — по сопернику, а не три случайных клуба подряд
    const ranked = band.slice().sort((a, b) => b.power - a.power);
    const potSize = Math.max(1, Math.floor(ranked.length / 3));
    const pots = [0, 1, 2].map((i) => ranked.slice(i * potSize, (i + 1) * potSize));
    const rivals = pots.map((pot) => rng.pick(pot.length ? pot : ranked)).filter((r, i, arr) => arr.indexOf(r) === i);
    while (rivals.length < 3) {
      const extra = rng.pick(ranked.filter((r) => rivals.indexOf(r) < 0));
      if (!extra) break;
      rivals.push(extra);
    }
    const groupIds = [clubId].concat(rivals.map((r) => r.id));
    const rounds = W.roundRobin(groupIds, rng);
    // «Финал четырёх» CEV играют на нейтральной площадке: город объявляют заранее
    const hostPool = S.EURO_POOL.filter((c) => c.cities.length);
    const hostCountry = rng.pick(hostPool);
    const host = { city: rng.pick(hostCountry.cities), country: hostCountry.country, code: hostCountry.code };
    game.euro = {
      cupId, name: cup.name, short: cup.short, group: groupIds, host,
      draw: {
        pots: pots.map((pot, i) => ({ n: i + 1, teams: pot.slice(0, 6).map((e) => ({ name: e.name, code: e.code, country: e.country })) })),
        rivals: rivals.map((r) => ({ name: r.name, code: r.code, country: r.country })),
      },
      table: Object.fromEntries(groupIds.map((id) => [id, { p: 0, w: 0, l: 0, pts: 0, setsW: 0, setsL: 0 }])),
      stage: 'group', knockout: [], done: false, result: null,
    };
    game.inbox.unshift({
      week: 0, kind: 'euro',
      text: 'CEV объявила место проведения «Финала четырёх» ' + cup.short + ': ' + host.city + ' (' + host.country + ').',
    });
    rounds.forEach((round, i) => {
      round.forEach((m) => {
        game.fixtures.push({ id: 'fx' + U.id(), week: W.EURO_GROUP_WEEKS[i], type: 'euro', stage: 'Групповой этап, тур ' + (i + 1), stageKey: 'group', h: m.h, a: m.a, played: false, result: null });
      });
    });
    S.Feed.event(game, club, 'euro', { cup: cup.name, club: club.name }, 1.5);
    // официальные аккаунты: жеребьёвка группы и объявление места «Финала четырёх»
    S.Feed.event(game, club, 'draw', {
      cup: cup.name, club: club.name, leagueName: DIVISIONS[club.division].name,
      rivals: rivals.map((r) => r.name).join(', '),
    }, 1.2, { authors: ['euro', 'league'] });
    S.Feed.event(game, club, 'host', {
      cup: cup.short, city: host.city, country: host.country, club: club.name,
    }, 1, { authors: ['euro'] });
  }

  /* ---------- фоновые еврокубки ---------- */
  /* Клуб игрока проходит еврокубок по-настоящему, матч за матчем. Остальные наши участники
     раньше просто числились в списке — теперь их турнир доигрывается абстрактно, чтобы в лиге
     было видно, кто как выступил в Европе и кто вообще выиграл трофей. */

  /** проходит ли клуб лицензирование CEV под конкретный турнир */
  function euroLicensed(game, club, cup) {
    if (!club) return false;
    const cap = W.arenaCapacity(club);
    return cap >= cup.minCapacity && (!cup.needMedia || club.arena.media >= 2);
  }

  /* ---------- чемпионаты Европы ---------- */
  /* У каждой страны свой чемпионат: клубы расставляются по силе с сезонной встряской,
     а путёвки в еврокубки раздаются по коэффициенту страны — как в реальной таблице CEV. */

  /** сколько путёвок каждого уровня даёт страна по своему коэффициенту */
  function countryQuota(power) {
    if (power >= 85) return { ucl: 2, cev: 1 };
    if (power >= 70) return { ucl: 1, cev: 1 };
    if (power >= 63) return { ucl: 1, cev: 0 };
    return { ucl: 0, cev: 1 };
  }

  /** разложить клубы каждой страны по местам и путёвкам на сезон */
  function buildEuroLeagues(game) {
    const rng = game._rng;
    const byCountry = {};
    game.euroClubs.forEach((c) => { (byCountry[c.country] = byCountry[c.country] || []).push(c); });
    const meta = {};
    S.EURO_POOL.forEach((c) => { meta[c.country] = c; });
    game.euroLeagues = Object.keys(byCountry).map((country) => {
      const info = meta[country] || { power: 60, code: '' };
      const quota = countryQuota(info.power);
      // сезонная встряска: чемпион страны меняется от года к году
      const order = byCountry[country].slice()
        .sort((a, b) => (b.power + rng.range(-6, 6)) - (a.power + rng.range(-6, 6)));
      return {
        country, code: info.code, power: info.power,
        clubs: order.map((c, i) => {
          const place = i + 1;
          const cup = place <= quota.ucl ? 'ucl'
            : place <= quota.ucl + quota.cev ? 'cev'
              : place <= quota.ucl + quota.cev + 2 ? 'ch' : null;
          return { id: c.id, name: c.name, city: c.city, place, cup, power: c.power };
        }),
      };
    }).sort((a, b) => b.power - a.power);
    return game.euroLeagues;
  }

  /** европейские соперники турнира: сначала те, кто реально получил такую путёвку */
  function euroBand(game, cupId) {
    const leagues = game.euroLeagues || buildEuroLeagues(game);
    const byId = {};
    game.euroClubs.forEach((c) => { byId[c.id] = c; });
    const qualified = [];
    leagues.forEach((l) => l.clubs.forEach((c) => { if (c.cup === cupId && byId[c.id]) qualified.push(byId[c.id]); }));
    if (qualified.length >= 6) return qualified;
    // если путёвок не хватило, добираем по силе
    const pool = game.euroClubs.slice().sort((a, b) => b.power - a.power);
    const rest = pool.filter((c) => qualified.indexOf(c) < 0);
    const extra = cupId === 'ucl' ? rest.slice(0, 10) : cupId === 'cev' ? rest.slice(2, 20) : rest.slice(6);
    return qualified.concat(extra);
  }

  const STAGE_LABEL = { group: 'Групповой этап', sf: 'Полуфинал', final: 'Финал', win: 'Победа' };

  /** разыграть один турнир: восемь команд, две группы, полуфиналы и финал */
  function runOneCup(game, cupId, ourIds) {
    const rng = game._rng;
    const cup = EURO_CUPS.find((c) => c.id === cupId);
    const ours = ourIds.map((id) => game.clubs[id]).filter((c) => c && euroLicensed(game, c, cup))
      .map((c) => ({ id: c.id, name: c.name, ours: true, power: W.clubPower(game, c) }));
    // сила европейцев приводится к шкале составов: их заявка генерируется как power * 0.86 + 6
    const foreign = rng.shuffle(euroBand(game, cupId)).slice(0, Math.max(2, 8 - ours.length))
      .map((e) => ({ id: e.id, name: e.name, country: e.country, code: e.code, power: e.power * 0.86 + 6 }));
    const teams = ours.concat(foreign).slice(0, 8);
    if (teams.length < 4) return null;
    const result = { cupId, name: cup.name, short: cup.short, teams: [], winner: null, host: null };

    // групповой этап: две группы, дальше проходят по двое
    const shuffled = rng.shuffle(teams.slice());
    const groups = [shuffled.filter((_, i) => i % 2 === 0), shuffled.filter((_, i) => i % 2 === 1)];
    const advanced = [];
    groups.forEach((grp) => {
      const pts = new Map(grp.map((t) => [t, 0]));
      for (let i = 0; i < grp.length; i++) {
        for (let j = i + 1; j < grp.length; j++) {
          const r = abstractMatch(rng, grp[i].power, grp[j].power);
          const w = r.winner === 'h' ? grp[i] : grp[j];
          pts.set(w, pts.get(w) + (Math.max(r.score[0], r.score[1]) === 3 && Math.min(r.score[0], r.score[1]) <= 1 ? 3 : 2));
        }
      }
      const order = grp.slice().sort((a, b) => pts.get(b) - pts.get(a) || b.power - a.power);
      order.forEach((t, i) => { t.stage = 'group'; t.groupPlace = i + 1; });
      advanced.push(order[0], order[1]);
    });

    // полуфиналы и финал
    const sf = [[advanced[0], advanced[3]], [advanced[2], advanced[1]]].filter((p) => p[0] && p[1]);
    const finalists = sf.map((pair) => {
      pair.forEach((t) => { t.stage = 'sf'; });
      const r = abstractMatch(rng, pair[0].power, pair[1].power);
      return r.winner === 'h' ? pair[0] : pair[1];
    });
    let champion = finalists[0];
    if (finalists.length === 2) {
      finalists.forEach((t) => { t.stage = 'final'; });
      const r = abstractMatch(rng, finalists[0].power, finalists[1].power);
      champion = r.winner === 'h' ? finalists[0] : finalists[1];
    }
    if (champion) champion.stage = 'win';

    result.groups = groups.map((grp, i) => ({
      name: String.fromCharCode(65 + i),
      teams: grp.map((t) => ({ name: t.name, ours: !!t.ours, code: t.code || null, place: t.groupPlace || null })),
    }));
    result.teams = teams.map((t) => ({
      id: t.id, name: t.name, ours: !!t.ours, country: t.country || null, code: t.code || null,
      stage: t.stage || 'group', label: STAGE_LABEL[t.stage || 'group'],
    }));
    result.winner = champion ? { id: champion.id, name: champion.name, ours: !!champion.ours, country: champion.country || null, code: champion.code || null } : null;
    return result;
  }

  /** разыграть все три еврокубка за сезон и записать итог в историю */
  function runBackgroundEuro(game) {
    const qual = game.euroBackground || game.euroQual || seedEuroQual(game);
    const season = { season: game.seasonLabel, cups: {} };
    EURO_CUPS.forEach((cup) => {
      const res = runOneCup(game, cup.id, qual[cup.id] || []);
      if (!res) return;
      // клуб игрока прошёл турнир по-настоящему — берём его настоящий результат
      const eu = game.euro;
      if (eu && eu.cupId === cup.id && game.playerClubId) {
        const mine = res.teams.find((t) => t.id === game.playerClubId);
        if (mine) {
          mine.label = eu.result === 'ПОБЕДА' ? STAGE_LABEL.win : (eu.result || mine.label);
          mine.stage = eu.result === 'ПОБЕДА' ? 'win' : mine.stage;
          mine.real = true;
          if (eu.result === 'ПОБЕДА') {
            res.winner = { id: mine.id, name: mine.name, ours: true, country: null, code: null };
            res.teams.forEach((t) => { if (t.id !== mine.id && t.stage === 'win') t.stage = 'final'; });
          }
        }
        res.host = eu.host || null;
      }
      season.cups[cup.id] = res;
    });
    game.euroSeason = season;
    game.euroHistory = game.euroHistory || [];
    game.euroHistory.unshift(season);
    if (game.euroHistory.length > 12) game.euroHistory.pop();
    // лига узнаёт, кто взял трофей
    const club = game.playerClubId && game.clubs[game.playerClubId];
    if (club && S.Feed) {
      const champs = Object.values(season.cups).filter((c) => c.winner)
        .map((c) => c.short + ' — ' + c.winner.name).join('; ');
      if (champs) {
        game.inbox.unshift({ week: 0, kind: 'euro', text: 'Еврокубки сезона ' + season.season + ' разыграны: ' + champs + '.' });
      }
    }
    return season;
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
        const host = eu.host;
        game.fixtures.push({
          id: 'fx' + U.id(), week: EURO_KO.sf, type: 'euro',
          stage: '«Финал четырёх», 1/2' + (host ? ' · ' + host.city : ''), stageKey: 'sf',
          neutral: true, host, h: game.playerClubId, a: rival.id, played: false, result: null,
        });
        game.inbox.unshift({
          week: game.week, kind: 'euro',
          text: 'Клуб вышел в «Финал четырёх» ' + cup.short + '! Полуфинал против ' + rival.name
            + (host ? '. Турнир принимает ' + host.city + ' (' + host.country + ')' : '') + '.',
        });
      } else { eu.done = true; eu.result = '1/4 финала'; }
    } else if (last.stageKey === 'sf' && eu.stage === 'sf') {
      Ec.ledger(club, 'prize', 'Призовые ' + cup.short + ': полуфинал', Ec.euroPrize(eu.cupId, 'sf'));
      if (won) {
        eu.stage = 'final';
        const rival = rng.pick(game.euroClubs.filter((c) => c.id !== last.a));
        game.fixtures.push({
          id: 'fx' + U.id(), week: EURO_KO.final, type: 'euro',
          stage: 'ФИНАЛ ' + cup.short + (eu.host ? ' · ' + eu.host.city : ''), stageKey: 'final',
          neutral: true, host: eu.host, h: game.playerClubId, a: rival.id, played: false, result: null,
        });
      } else { eu.done = true; eu.result = 'Полуфинал'; }
    } else if (last.stageKey === 'final' && eu.stage === 'final') {
      eu.done = true;
      if (won) {
        eu.result = 'ПОБЕДА';
        Ec.ledger(club, 'prize', 'Призовые ' + cup.short + ': победа', Ec.euroPrize(eu.cupId, 'win'));
        club.trophies.push({ season: game.seasonLabel, name: cup.name });
        S.Fans.onTrophy(game, club);
        Ec.merchSpike(game, club, 0.55);
        S.Fans.unlock(game, club, 'euro');
        queueCeremony(game, { type: 'euro', title: cup.name, subtitle: '«Финал четырёх» выигран', clubId: club.id });
        S.Feed.event(game, club, 'trophy', { trophy: cup.name, club: club.name, city: club.city, leagueName: DIVISIONS[club.division].name }, 2);
      } else {
        eu.result = 'Финал';
        Ec.ledger(club, 'prize', 'Призовые ' + cup.short + ': финал', Ec.euroPrize(eu.cupId, 'final'));
      }
    }
  }

  /* ---------- награды по итогам сезона ---------- */
  /** символическая сборная дивизиона, MVP и личные номинации */
  function seasonAwards(game, divisionId) {
    const div = game.divisions[divisionId];
    const pool = [];
    div.clubIds.forEach((id) => {
      const club = game.clubs[id];
      club.squad.forEach((pid) => {
        const p = game.players[pid];
        if (p && p.season.matches >= 6) pool.push({ p, club });
      });
    });
    if (!pool.length) return null;
    const per = (x, key) => (x.p.season.sets ? x.p.season[key] / x.p.season.sets : 0);
    const best = (role, key) => {
      const list = pool.filter((x) => x.p.role === role).sort((a, b) => per(b, key) - per(a, key));
      return list[0] || null;
    };
    const team = [
      { role: 'S', label: 'связующий', pick: pool.filter((x) => x.p.role === 'S').sort((a, b) => (b.p.season.points + b.p.season.blocks * 2) - (a.p.season.points + a.p.season.blocks * 2))[0] },
      { role: 'OP', label: 'диагональный', pick: best('OP', 'points') },
      { role: 'OH', label: 'доигровщик', pick: best('OH', 'points') },
      { role: 'OH', label: 'доигровщик', pick: pool.filter((x) => x.p.role === 'OH').sort((a, b) => per(b, 'points') - per(a, 'points'))[1] },
      { role: 'MB', label: 'центральный', pick: best('MB', 'blocks') },
      { role: 'MB', label: 'центральный', pick: pool.filter((x) => x.p.role === 'MB').sort((a, b) => per(b, 'blocks') - per(a, 'blocks'))[1] },
      { role: 'L', label: 'либеро', pick: best('L', 'digs') },
    ].filter((x) => x.pick);
    // один игрок не может занять две позиции в символической сборной
    const seen = new Set();
    const teamUniq = team.filter((t) => (seen.has(t.pick.p.id) ? false : (seen.add(t.pick.p.id), true)));
    // одна номинация на игрока, пока есть кем её закрыть: иначе весь список — один человек
    const taken = new Set();
    const takeBest = (list) => {
      const free = list.find((x) => !taken.has(x.p.id));
      const pick = free || list[0];
      if (pick) taken.add(pick.p.id);
      return pick;
    };
    const scorer = takeBest(pool.slice().sort((a, b) => b.p.season.points - a.p.season.points));
    const blocker = takeBest(pool.slice().sort((a, b) => b.p.season.blocks - a.p.season.blocks));
    const server = takeBest(pool.slice().sort((a, b) => b.p.season.aces - a.p.season.aces));
    const libero = takeBest(pool.filter((x) => x.p.role === 'L').sort((a, b) => b.p.season.digs - a.p.season.digs));
    // MVP — вклад в очки команды-призёра, а не просто набранные очки
    const order = W.sortTable(div);
    const mvp = pool.slice().sort((a, b) => {
      const bonus = (x) => Math.max(0, 12 - order.indexOf(x.club.id)) * 6;
      return (b.p.season.points + b.p.season.blocks * 2 + b.p.season.aces * 2 + bonus(b)) -
        (a.p.season.points + a.p.season.blocks * 2 + a.p.season.aces * 2 + bonus(a));
    })[0];
    const card = (x, note) => x && { id: x.p.id, name: P.fullName(x.p), club: x.club.name, role: x.p.role, note };
    return {
      division: div.name,
      team: teamUniq.map((t) => ({ label: t.label, player: card(t.pick) })),
      mvp: card(mvp, 'самый ценный игрок'),
      scorer: card(scorer, scorer.p.season.points + ' очков за сезон'),
      blocker: card(blocker, blocker.p.season.blocks + ' блоков'),
      server: card(server, server.p.season.aces + ' эйсов'),
      libero: card(libero, libero ? libero.p.season.digs + ' мячей в защите' : ''),
    };
  }

  /** церемонии показываются интерфейсом после того, как неделя досчитана */
  function queueCeremony(game, ceremony) {
    game.ceremonies = game.ceremonies || [];
    game.ceremonies.push(Object.assign({ season: game.seasonLabel, week: game.week }, ceremony));
  }

  S.Season = {
    CUP_ROUNDS, queueCeremony, seasonAwards, PLAYOFF_WEEKS, EURO_KO, SEASON_END_WEEK, MONTH_WEEKS,
    team, isForeign, teamName, abstractMatch, buildSide, buildEuroSide, simMatch, createMatch, finalizeMatch, applyToTable,
    startSeason, seasonLabel, makeObjective, buildCup, scheduleCupRound, resolveCupWeek,
    buildEuro, seedEuroQual, applyEuroTable, euroStandings, advanceEuro, runBackgroundEuro, euroLicensed, STAGE_LABEL,
    buildEuroLeagues, countryQuota, euroBand,
    weeklyRecovery, available, afterMatch, ensureEuroSquad,
  };
})(typeof window !== 'undefined' ? window : globalThis);
