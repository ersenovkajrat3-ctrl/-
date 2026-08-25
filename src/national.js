/* Volleyball Manager — сборные: чемпионат Европы, чемпионат мира и Олимпиада между сезонами.
   Состав нашей сборной собирается из игроков лиги и тех, кого продали за рубеж, —
   поэтому проданная звезда продолжает мозолить глаза в бегущей строке. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U, ROLES } = S;
  const P = S.Players, W = S.World;

  const HOME = 'Россия';
  const HOME_GEN = 'России';   // родительный падеж для строк вида «сборная России»

  /* сила сборных — тот же порядок, что и у клубных коэффициентов */
  const NATIONS = [
    { name: 'Россия',     code: 'RUS', power: 86, euro: true, color: '#e8eef7' },
    { name: 'Италия',     code: 'ITA', power: 90, euro: true, color: '#2f6fed' },
    { name: 'Польша',     code: 'POL', power: 89, euro: true, color: '#e8eef7' },
    { name: 'Франция',    code: 'FRA', power: 85, euro: true, color: '#3b82f6' },
    { name: 'Сербия',     code: 'SRB', power: 82, euro: true, color: '#c0392b' },
    { name: 'Словения',   code: 'SLO', power: 81, euro: true, color: '#22c7b8' },
    { name: 'Германия',   code: 'GER', power: 78, euro: true, color: '#111827' },
    { name: 'Турция',     code: 'TUR', power: 77, euro: true, color: '#dc2626' },
    { name: 'Нидерланды', code: 'NED', power: 75, euro: true, color: '#ff7a1a' },
    { name: 'Болгария',   code: 'BUL', power: 74, euro: true, color: '#12a05a' },
    { name: 'Украина',    code: 'UKR', power: 73, euro: true, color: '#f2d13c' },
    { name: 'Чехия',      code: 'CZE', power: 71, euro: true, color: '#3b82f6' },
    { name: 'Бельгия',    code: 'BEL', power: 70, euro: true, color: '#facc15' },
    { name: 'Греция',     code: 'GRE', power: 68, euro: true, color: '#60a5fa' },
    { name: 'Финляндия',  code: 'FIN', power: 67, euro: true, color: '#93c5fd' },
    { name: 'Португалия', code: 'POR', power: 66, euro: true, color: '#15803d' },
    { name: 'Бразилия',   code: 'BRA', power: 91, euro: false, color: '#facc15' },
    { name: 'США',        code: 'USA', power: 84, euro: false, color: '#3b82f6' },
    { name: 'Аргентина',  code: 'ARG', power: 80, euro: false, color: '#7dd3fc' },
    { name: 'Иран',       code: 'IRI', power: 79, euro: false, color: '#12a05a' },
    { name: 'Япония',     code: 'JPN', power: 78, euro: false, color: '#e8eef7' },
    { name: 'Куба',       code: 'CUB', power: 76, euro: false, color: '#ff5c72' },
    { name: 'Канада',     code: 'CAN', power: 74, euro: false, color: '#dc2626' },
    { name: 'Китай',      code: 'CHN', power: 70, euro: false, color: '#f59e0b' },
    { name: 'Египет',     code: 'EGY', power: 66, euro: false, color: '#d9a441' },
    { name: 'Тунис',      code: 'TUN', power: 65, euro: false, color: '#ff5c72' },
    { name: 'Австралия',  code: 'AUS', power: 65, euro: false, color: '#12a05a' },
    { name: 'Катар',      code: 'QAT', power: 62, euro: false, color: '#8e1f3d' },
  ];
  const nationBy = (name) => NATIONS.find((n) => n.name === name);

  /** какой турнир идёт этим летом: Европа — раз в два года, мир и Олимпиада — раз в четыре */
  const CYCLE = [
    { id: 'euro', name: 'Чемпионат Европы', short: 'ЧЕ', teams: 16, euroOnly: true, prestige: 1 },
    { id: 'world', name: 'Чемпионат мира', short: 'ЧМ', teams: 16, euroOnly: false, prestige: 1.3 },
    { id: 'euro', name: 'Чемпионат Европы', short: 'ЧЕ', teams: 16, euroOnly: true, prestige: 1 },
    { id: 'olympics', name: 'Олимпийские игры', short: 'ОИ', teams: 12, euroOnly: false, prestige: 1.6 },
  ];
  function tournamentFor(season) { return CYCLE[(season - 1) % CYCLE.length]; }

  /* ---------- состав сборной ---------- */
  /** право играть за сборную: свои игроки лиги плюс уехавшие за рубеж */
  function eligible(game) {
    return Object.values(game.players).filter((p) => p && !p.foreign && (p.clubId || p.abroadClub));
  }

  function callUp(game) {
    const pool = eligible(game);
    const byRole = {};
    pool.forEach((p) => { (byRole[p.role] = byRole[p.role] || []).push(p); });
    Object.keys(byRole).forEach((r) => byRole[r].sort((a, b) => P.overall(b) - P.overall(a)));
    const need = { S: 2, OP: 2, OH: 4, MB: 4, L: 2 };
    const squad = [];
    Object.keys(need).forEach((role) => {
      (byRole[role] || []).slice(0, need[role]).forEach((p) => squad.push(p));
    });
    return squad;
  }

  /** сила сборной: класс шестёрки плюс небольшой бонус за глубину состава */
  function squadPower(game, squad) {
    if (!squad.length) return 60;
    const six = squad.slice().sort((a, b) => P.overall(b) - P.overall(a)).slice(0, 7);
    return U.avg(six, (p) => P.overall(p)) + Math.min(3, squad.length * 0.1);
  }

  /* ---------- симуляция турнира ---------- */
  function abstractResult(rng, a, b) {
    const p = 1 / (1 + Math.pow(10, (b - a) / 12));
    const aWin = rng.chance(p);
    const r = rng.next();
    const sets = r < 0.36 ? [3, 0] : r < 0.72 ? [3, 1] : [3, 2];
    return aWin ? sets : [sets[1], sets[0]];
  }

  /** матч нашей сборной считается настоящим движком — игроки набирают статистику */
  function playOurMatch(game, rivalName, ourSquad) {
    const rng = game._rng;
    const rival = nationBy(rivalName);
    const E = S.Engine;
    const byRole = (r) => ourSquad.filter((p) => p.role === r).sort((a, b) => P.overall(b) - P.overall(a));
    const line = [byRole('S')[0], byRole('OH')[0], byRole('MB')[0], byRole('OP')[0], byRole('OH')[1], byRole('MB')[1]].filter(Boolean);
    const lib = byRole('L')[0];
    if (line.length < 6) return { score: abstractResult(rng, 70, rival.power), abstract: true };
    line.concat(lib ? [lib] : []).forEach((p) => { p.st = P.emptyStats(); p.fatigue = Math.max(0, p.fatigue - 25); });
    const ours = new E.Side({ name: HOME }, line, lib, null, { human: true });
    const theirSquad = P.makeSquad(rng, rival.power, 0, 'nat_' + rival.code, 6);
    const tByRole = (r) => theirSquad.filter((p) => p.role === r).sort((a, b) => P.overall(b) - P.overall(a));
    const tLine = [tByRole('S')[0], tByRole('OH')[0], tByRole('MB')[0], tByRole('OP')[0], tByRole('OH')[1], tByRole('MB')[1]].filter(Boolean);
    const tLib = tByRole('L')[0];
    tLine.concat(tLib ? [tLib] : []).forEach((p) => { p.st = P.emptyStats(); });
    const theirs = new E.Side({ name: rival.name }, tLine, tLib, null, {});
    const log = E.playMatch(rng, ours, theirs, { homeBonus: 0 });   // турнир на нейтральном поле
    // статистика сборной копится отдельно от клубного сезона
    line.concat(lib ? [lib] : []).forEach((p) => {
      p.natStats = p.natStats || P.emptyStats();
      p.st.matches = 1;
      P.addStats(p.natStats, p.st);
      p.natCaps = (p.natCaps || 0) + 1;
    });
    const mvp = log.mvp && ourSquad.indexOf(log.mvp) >= 0 ? log.mvp : null;
    return {
      score: [ours.sets, theirs.sets],
      setScores: log.setScores,
      hero: mvp ? { name: P.fullName(mvp), points: mvp.st.points } : null,
    };
  }

  /**
   * Провести турнир: группы, плей-офф, медали.
   * Возвращает отчёт с матчами нашей сборной, финальной сеткой и итоговым местом.
   */
  function run(game) {
    const rng = game._rng;
    const meta = tournamentFor(game.season);
    const pool = NATIONS.filter((n) => (meta.euroOnly ? n.euro : true) && n.name !== HOME);
    const rivals = rng.shuffle(pool)
      .sort((a, b) => b.power - a.power)
      .slice(0, meta.teams - 1);
    const squad = callUp(game);
    const ourPower = squadPower(game, squad);
    const teams = [{ name: HOME, power: ourPower, ours: true }]
      .concat(rivals.map((n) => ({ name: n.name, power: n.power + rng.range(-3, 3), ours: false })));

    const report = {
      season: game.seasonLabel, tournament: meta.name, short: meta.short, id: meta.id,
      squad: squad.map((p) => ({ id: p.id, name: P.fullName(p), role: p.role, ovr: P.overall(p), club: p.clubId && game.clubs[p.clubId] ? game.clubs[p.clubId].name : (p.abroadClub ? 'за рубежом' : '—') })),
      power: Math.round(ourPower),
      matches: [], stage: null, place: null, medal: null, champion: null, ticker: [],
    };

    // групповой этап
    const groups = [];
    const shuffled = rng.shuffle(teams);
    const groupCount = meta.teams === 12 ? 2 : 4;
    const perGroup = meta.teams / groupCount;
    for (let i = 0; i < groupCount; i++) groups.push(shuffled.slice(i * perGroup, (i + 1) * perGroup));
    const advance = [];
    groups.forEach((grp) => {
      const table = grp.map((t) => ({ t, w: 0, l: 0, diff: 0 }));
      for (let i = 0; i < grp.length; i++) {
        for (let j = i + 1; j < grp.length; j++) {
          const a = grp[i], b = grp[j];
          let score;
          if (a.ours || b.ours) {
            const rivalName = a.ours ? b.name : a.name;
            const res = playOurMatch(game, rivalName, squad);
            score = a.ours ? res.score : [res.score[1], res.score[0]];
            report.matches.push({
              stage: 'Групповой этап', rival: rivalName,
              score: a.ours ? res.score : [res.score[1], res.score[0]],
              hero: res.hero,
            });
          } else {
            score = abstractResult(rng, a.power, b.power);
          }
          const ra = table.find((x) => x.t === a), rb = table.find((x) => x.t === b);
          if (score[0] > score[1]) { ra.w++; rb.l++; } else { rb.w++; ra.l++; }
          ra.diff += score[0] - score[1]; rb.diff += score[1] - score[0];
        }
      }
      table.sort((x, y) => y.w - x.w || y.diff - x.diff);
      const take = meta.teams === 12 ? 4 : 2;
      advance.push(...table.slice(0, take).map((x) => x.t));
    });

    // плей-офф: путь нашей сборной отслеживаем отдельно — где выиграли, где сошли
    const stageNames = { 8: '1/4 финала', 4: '1/2 финала', 2: 'Финал' };
    const playPair = (a, b, stage) => {
      let score;
      if (a.ours || b.ours) {
        const rivalName = a.ours ? b.name : a.name;
        const res = playOurMatch(game, rivalName, squad);
        const ourScore = a.ours ? res.score : [res.score[1], res.score[0]];
        report.matches.push({ stage, rival: rivalName, score: ourScore, hero: res.hero });
        score = a.ours ? res.score : [res.score[1], res.score[0]];
        if (!a.ours) score = [score[1], score[0]];
      } else {
        score = abstractResult(rng, a.power, b.power);
      }
      return score[0] > score[1] ? { win: a, lose: b } : { win: b, lose: a };
    };

    let alive = rng.shuffle(advance);
    let semiLosers = [];
    let finalists = [];
    while (alive.length > 1) {
      const stage = stageNames[alive.length] || '1/8 финала';
      const next = [], losers = [];
      for (let i = 0; i < alive.length; i += 2) {
        const a = alive[i], b = alive[i + 1];
        if (!b) { next.push(a); continue; }
        const r = playPair(a, b, stage);
        next.push(r.win);
        losers.push(r.lose);
        if (r.lose.ours) report.stage = stage;      // здесь наша сборная сошла
      }
      if (alive.length === 4) semiLosers = losers;
      if (alive.length === 2) finalists = alive.slice();
      alive = next;
    }
    const champion = alive[0];
    report.champion = champion.name;
    const ours = teams.find((t) => t.ours);

    // матч за третье место
    let bronze = null;
    if (semiLosers.length === 2) {
      const r = playPair(semiLosers[0], semiLosers[1], 'Матч за 3-е место');
      bronze = r.win;
      if (r.lose.ours) report.place = 4;
    }

    if (champion.ours) { report.place = 1; report.medal = 'золото'; report.stage = 'Финал'; }
    else if (finalists.indexOf(ours) >= 0) { report.place = 2; report.medal = 'серебро'; report.stage = 'Финал'; }
    else if (bronze && bronze.ours) { report.place = 3; report.medal = 'бронза'; report.stage = 'Матч за 3-е место'; }
    else if (!report.stage) report.stage = 'Групповой этап';

    finishEffects(game, squad, report, meta);
    report.ticker = buildTicker(game, report);
    game.national = game.national || { history: [] };
    game.national.last = report;
    game.national.history.unshift({
      season: report.season, tournament: report.short, place: report.place,
      medal: report.medal, champion: report.champion, stage: report.stage,
    });
    if (game.national.history.length > 20) game.national.history.pop();
    // официальные аккаунты: федерация подводит итог турнира, лига считает своих
    const club = game.playerClubId && game.clubs[game.playerClubId];
    if (club && S.Feed) {
      const place = report.medal ? report.medal : report.place ? report.place + '-е место' : report.stage;
      S.Feed.event(game, club, 'natResult', {
        tournament: report.tournament || report.short, nation: HOME, nationGen: HOME_GEN, place: place, club: club.name,
        count: squad.filter((p) => p.clubId === club.id).length || 'наши',
        leagueName: S.DIVISIONS[club.division].name,
      }, 1.4, { authors: ['world', 'league'] });
      S.Feed.event(game, club, 'ranking', {
        nation: HOME, nationGen: HOME_GEN, place: (report.place && report.place <= 3 ? report.place : Math.max(2, Math.round(4 + (report.place || 6) * 0.7))) + '-я',
        club: club.name,
      }, 0.8, { authors: ['world'] });
    }
    return report;
  }

  /* ---------- последствия для клубов и игроков ---------- */
  function finishEffects(game, squad, report, meta) {
    const rng = game._rng;
    squad.forEach((p) => {
      const club = p.clubId && game.clubs[p.clubId];
      // сборная — это нагрузка: игрок выходит на сезон подуставшим
      p.fatigue = U.clamp((p.fatigue || 0) + rng.range(12, 26), 0, 100);
      if (rng.chance(0.05)) {
        p.injury = rng.int(1, 4);
        p.injuryNote = 'привёз травму из сборной';
      }
      // и школа: молодые прибавляют быстрее
      if (p.age <= 23) {
        const k = P.SKILLS[Math.floor(rng.next() * P.SKILLS.length)];
        p.skills[k] = U.clamp(p.skills[k] + rng.int(1, 2), 1, 99);
      }
      if (club) {
        // вызов в сборную — репутационный бонус клубу
        club.mediaIndex = U.clamp(club.mediaIndex + 1.2 * meta.prestige, 5, 99);
        if (club.isPlayer) {
          game.inbox.unshift({
            week: 0, kind: 'national',
            text: P.fullName(p) + ' вызван в сборную на ' + report.tournament + '.',
          });
        }
      }
    });
    if (report.medal) {
      squad.forEach((p) => {
        const club = p.clubId && game.clubs[p.clubId];
        if (club) club.mediaIndex = U.clamp(club.mediaIndex + (report.place === 1 ? 4 : 2) * meta.prestige, 5, 99);
      });
    }
  }

  /* ---------- бегущая строка ---------- */
  function buildTicker(game, report) {
    const items = [];
    const home = nationBy(HOME);
    items.push({ kind: 'head', flag: home.code, text: report.tournament + ' · ' + report.season });
    report.matches.forEach((m) => {
      const rival = nationBy(m.rival);
      items.push({
        kind: 'match',
        flag: rival ? rival.code : null,
        text: 'СБОРНАЯ ' + m.score.join(':') + ' ' + m.rival.toUpperCase() + ' · ' + m.stage +
          (m.hero ? ' · ' + m.hero.name + ' — ' + m.hero.points + ' очк.' : ''),
        good: m.score[0] > m.score[1],
      });
    });
    if (report.medal) {
      items.push({ kind: 'medal', flag: home.code, text: 'СБОРНАЯ БЕРЁТ ' + report.medal.toUpperCase() + ' НА ' + report.short + '!', good: true });
    } else {
      items.push({ kind: 'out', flag: home.code, text: 'Сборная закончила турнир на стадии «' + (report.stage || 'групповой этап') + '»' });
    }
    const champ = nationBy(report.champion);
    items.push({ kind: 'champ', flag: champ ? champ.code : null, text: 'Чемпион: ' + report.champion.toUpperCase() });
    return items;
  }

  S.National = {
    NATIONS, HOME, CYCLE, nationBy, tournamentFor, callUp, squadPower, eligible, run, buildTicker,
  };
})(typeof window !== 'undefined' ? window : globalThis);
