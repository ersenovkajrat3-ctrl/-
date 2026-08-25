/* Сетка — генерация мира: клубы, составы, арены, финансы, календарь сезона. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U, DIVISIONS, CLUB_SEED, FOREIGN_LIMIT, EURO_POOL } = S;
  const P = S.Players;

  /** уровень мастерства состава по дивизиону: узкий разброс, иначе сезон предрешён */
  const TIER_LEVEL = [[66, 74], [58, 65], [50, 57], [42, 49]];

  const WEEKS = 37;
  const CUP_WEEKS = [6, 11, 16, 21, 26];            // 1/16 → финал Кубка страны
  const EURO_GROUP_WEEKS = [8, 10, 12, 14, 17, 19]; // 6 туров группового этапа
  const EURO_QF_WEEK = 24, EURO_SF_WEEK = 35, EURO_FINAL_WEEK = 36;
  const PLAYOFF_START = 31;

  /* ---------- расписание: круговой метод ---------- */
  function roundRobin(ids, rng) {
    const teams = rng ? rng.shuffle(ids) : ids.slice();
    if (teams.length % 2) teams.push(null);
    const n = teams.length, rounds = [];
    const arr = teams.slice();
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        if (a && b) pairs.push(r % 2 === 0 ? { h: a, a: b } : { h: b, a });
      }
      rounds.push(pairs);
      arr.splice(1, 0, arr.pop()); // фиксируем первую команду, крутим остальные
    }
    // второй круг — с обратными полями
    const second = rounds.map((rd) => rd.map((m) => ({ h: m.a, a: m.h })));
    return rounds.concat(second);
  }

  /** равномерно раскладываем туры дивизиона по неделям сезона */
  function spreadRounds(nRounds, lastWeek) {
    const weeks = [];
    for (let i = 0; i < nRounds; i++) weeks.push(1 + Math.round((i * (lastWeek - 1)) / Math.max(1, nRounds - 1)));
    // разводим дубли
    for (let i = 1; i < weeks.length; i++) if (weeks[i] <= weeks[i - 1]) weeks[i] = weeks[i - 1] + 1;
    return weeks;
  }

  /* ---------- клуб ---------- */
  function makeArena(capacity) {
    return { baseCapacity: capacity, stands: 0, vip: 0, media: 0, base: 0, works: [] };
  }
  function arenaCapacity(club) { return club.arena.baseCapacity + club.arena.stands * 800; }
  function arenaHasCevLicense(club) { return club.arena.media >= 2 && arenaCapacity(club) >= 2000; }

  function makeClub(rng, seed, index) {
    const [name, city, tier, strength, capacity] = seed;
    const club = {
      id: 'c' + index,
      name, baseName: name, city, tier, division: tier,
      strength, level: 0,
      reputation: Math.round(strength),
      arena: makeArena(capacity),
      ticketPrice: Math.round(300 + strength * 12),
      finance: { balance: 0, debt: 0, loanMonthly: 0, loanMonths: 0, sponsors: [], seasonIncome: 0, seasonSpend: 0, ledger: [] },
      squad: [], lineup: [], liberoId: null, tactics: null,
      mediaIndex: U.clamp(Math.round(strength * 0.7 + rng.range(-6, 6)), 5, 95),
      tone: 'calm',
      isPlayer: false,
      autoRotate: true,
      form: [],
      trophies: [],
      history: [],
      aiSkill: U.clamp(strength / 100 + rng.range(-0.1, 0.1), 0.2, 0.95),
    };
    club.fans = S.Fans.makeFans(rng, club);
    return club;
  }

  /** сила клуба для абстрактных прикидок (еврокубковый пул, скаутинг) */
  function clubPower(game, club) {
    const squad = club.squad.map((id) => game.players[id]);
    const best = squad.slice().sort((a, b) => P.overall(b) - P.overall(a)).slice(0, 7);
    return U.avg(best, (p) => P.overall(p));
  }

  /* ---------- стартовый состав ---------- */
  function autoLineup(game, club, onlyAvailable) {
    let squad = club.squad.map((id) => game.players[id]).filter(Boolean);
    if (onlyAvailable) {
      const fit = squad.filter((p) => !(p.injury > 0));
      if (fit.length >= 7) squad = fit;
    }
    const byRole = (r) => squad.filter((p) => p.role === r).sort((a, b) => (P.overall(b) + (100 - b.fatigue) * 0.12) - (P.overall(a) + (100 - a.fatigue) * 0.12));
    const s = byRole('S')[0], op = byRole('OP')[0];
    const oh = byRole('OH').slice(0, 2), mb = byRole('MB').slice(0, 2);
    const l = byRole('L')[0];
    // связующий и диагональный стоят через три позиции — как и должно быть в расстановке 5-1
    const line = [s, oh[0], mb[0], op, oh[1], mb[1]].filter(Boolean);
    if (line.length < 6) { // добираем кем есть
      for (const p of squad) { if (line.length >= 6) break; if (!line.includes(p) && p.role !== 'L') line.push(p); }
    }
    club.lineup = line.slice(0, 6).map((p) => p.id);
    club.liberoId = l ? l.id : null;
  }

  /** проверка заявки: лимит легионеров и комплектность */
  function validateLineup(game, club) {
    const ids = club.lineup || [];
    const players = ids.map((id) => game.players[id]).filter(Boolean);
    const problems = [];
    if (players.length !== 6) problems.push('В стартовой шестёрке должно быть ровно 6 игроков.');
    const roles = {};
    players.forEach((p) => { roles[p.role] = (roles[p.role] || 0) + 1; });
    if (!roles.S) problems.push('Нет связующего.');
    const libero = club.liberoId ? game.players[club.liberoId] : null;
    if (libero && libero.role !== 'L') problems.push('Либеро должен быть игроком амплуа «либеро».');
    const foreigners = players.concat(libero ? [libero] : []).filter((p) => p.foreign).length;
    const limit = FOREIGN_LIMIT[club.division];
    if (foreigners > limit) problems.push('Легионеров на площадке ' + foreigners + ' при лимите ' + limit + '.');
    return problems;
  }

  /* ---------- еврокубковый пул ---------- */
  const EURO_NICKS = ['Волеро', 'Астра', 'Кастелло', 'Пантера', 'Виктория', 'Атлас', 'Корона', 'Аврора', 'Спарта', 'Феникс', 'Кондор', 'Легион',
    'Ривьера', 'Меркурий', 'Олимпия', 'Ланца', 'Вертикаль', 'Кобра', 'Тритон', 'Аллегро', 'Форса', 'Аквила', 'Бастион', 'Комета',
    'Сирокко', 'Тандем', 'Верона', 'Гладио', 'Нордик', 'Пирамида', 'Кристалл', 'Ротор', 'Юпитер', 'Магнум'];

  function makeEuroClubs(rng) {
    const out = [];
    let i = 0;
    const nicks = rng.shuffle(EURO_NICKS);
    for (const c of EURO_POOL) {
      for (const city of c.cities) {
        const nick = nicks[i % nicks.length];
        out.push({
          id: 'e' + (i++),
          name: nick + ' ' + city, city, country: c.country, code: c.code,
          power: U.clamp(Math.round(c.power * 0.78 + rng.range(-5, 5) + (out.length % 3)), 45, 92),
          foreign: true,
        });
      }
    }
    return out;
  }

  /* ---------- создание мира ---------- */
  function createWorld(seed, opts = {}) {
    const rng = new S.RNG(seed);
    U.resetIds(1);
    const game = {
      version: 3,
      seed,
      rngState: null,
      season: 1,
      seasonLabel: '2025/26',
      week: 0,
      phase: 'preseason',
      clubs: {},
      players: {},
      divisions: [],
      euroClubs: [],
      playerClubId: null,
      feed: [],
      inbox: [],
      offers: { sponsors: [], transfers: [] },
      market: [],
      cup: null,
      euro: null,
      results: [],
      settings: { sound: true, commentary: true, speed: 'fast', tone: 'calm' },
      board: null,
      stats: { seasonsPlayed: 0, trophies: [] },
      log: [],
    };

    // клубы
    CLUB_SEED.forEach((seedRow, i) => {
      const club = makeClub(rng, seedRow, i);
      game.clubs[club.id] = club;
    });
    // уровень состава — сжатая шкала внутри дивизиона
    DIVISIONS.forEach((d) => {
      const list = Object.values(game.clubs).filter((c) => c.tier === d.id).sort((a, b) => b.strength - a.strength);
      const [lo, hi] = TIER_LEVEL[d.id];
      list.forEach((c, i) => {
        c.level = hi - (i / Math.max(1, list.length - 1)) * (hi - lo);
      });
    });
    // составы и финансы
    Object.values(game.clubs).forEach((club) => {
      const squad = P.makeSquad(rng, club.level, club.division, club.id, FOREIGN_LIMIT[club.division]);
      squad.forEach((p) => { game.players[p.id] = p; club.squad.push(p.id); });
      autoLineup(game, club);
      club.tactics = Object.assign({}, S.Engine.DEFAULT_TACTICS);
      const wageBill = U.sum(squad, (p) => p.contract.wage);
      club.finance.balance = Math.round(wageBill * rng.range(3.5, 7));
    });

    // формы и эмблемы: внутри дивизиона комплекты не повторяются
    S.Identity.assign(rng, Object.values(game.clubs));

    // стартовые спонсорские контракты у всех клубов, иначе лига уходит в минус с первого месяца
    const takenBrands = new Set();
    Object.values(game.clubs).forEach((club) => {
      const types = ['local', 'kit'];
      if (club.mediaIndex >= 55 && club.division <= 1) types.push('title');
      types.forEach((type) => {
        const meta = S.SPONSOR_TYPES[type];
        if (club.division > meta.minDivision) return;
        const free = S.SPONSOR_BRANDS[type].filter((b) => !takenBrands.has(b));
        if (!free.length) return;
        const brand = rng.pick(free);
        if (type !== 'local') takenBrands.add(brand); // локальных партнёров может быть много одноимённых сетей

        const monthly = Math.round(S.Economy.sponsorValue(club, type) * rng.range(0.85, 1.1) / 1e5) * 1e5;
        club.finance.sponsors.push({
          id: 'sc' + U.id(), type, brand, monthly, monthsLeft: rng.int(4, 22), years: 2,
          rename: meta.rename && type === 'title', name: meta.name,
          bonusTop4: monthly * 3, bonusEuro: monthly * 4, penaltyRelegation: monthly * 2, breakFee: monthly * 4,
        });
        if (meta.rename && type === 'title') S.Economy.renameFor(club, brand);
      });
    });

    game.euroClubs = makeEuroClubs(rng);
    game.rngState = rng.save();
    game._rng = rng;
    return game;
  }

  /** привязать пользователя к клубу */
  function assignPlayerClub(game, clubId) {
    Object.values(game.clubs).forEach((c) => { c.isPlayer = false; });
    const club = game.clubs[clubId];
    club.isPlayer = true;
    game.playerClubId = clubId;
    // старт карьеры: стартовый капитал скромный, задача от совета
    club.finance.balance = Math.round(U.sum(club.squad.map((id) => game.players[id]), (p) => p.contract.wage) * 4.5);
    return club;
  }

  /* ---------- календарь ---------- */
  function buildSchedule(game) {
    const rng = game._rng;
    game.divisions = DIVISIONS.map((d) => {
      const clubIds = Object.values(game.clubs).filter((c) => c.division === d.id).map((c) => c.id);
      const rounds = roundRobin(clubIds, rng);
      const weeks = spreadRounds(rounds.length, PLAYOFF_START - 1);
      return {
        id: d.id, name: d.name, short: d.short, clubIds,
        rounds, weeks, played: 0,
        table: Object.fromEntries(clubIds.map((id) => [id, emptyRow()])),
        playoff: null, finished: false, champion: null, promoted: [], relegated: [],
      };
    });
  }

  function emptyRow() {
    return { p: 0, w: 0, l: 0, w30: 0, w32: 0, w23: 0, l03: 0, setsW: 0, setsL: 0, ptsW: 0, ptsL: 0, pts: 0, form: [] };
  }

  /** очки как в реальном волейболе: 3:0 и 3:1 — 3 очка, 3:2 — 2, поражение 2:3 — 1 */
  function tablePoints(setsFor, setsAgainst) {
    if (setsFor === 3) return setsAgainst <= 1 ? 3 : 2;
    return setsAgainst === 3 && setsFor === 2 ? 1 : 0;
  }

  function sortTable(division) {
    return division.clubIds.slice().sort((a, b) => {
      const ra = division.table[a], rb = division.table[b];
      if (rb.pts !== ra.pts) return rb.pts - ra.pts;
      if (rb.w !== ra.w) return rb.w - ra.w;
      const sa = ra.setsL ? ra.setsW / ra.setsL : ra.setsW, sb = rb.setsL ? rb.setsW / rb.setsL : rb.setsW;
      if (sb !== sa) return sb - sa;
      const pa = ra.ptsL ? ra.ptsW / ra.ptsL : ra.ptsW, pb = rb.ptsL ? rb.ptsW / rb.ptsL : rb.ptsW;
      return pb - pa;
    });
  }

  S.World = {
    TIER_LEVEL, WEEKS, CUP_WEEKS, EURO_GROUP_WEEKS, EURO_QF_WEEK, EURO_SF_WEEK, EURO_FINAL_WEEK, PLAYOFF_START,
    createWorld, assignPlayerClub, buildSchedule, roundRobin, spreadRounds,
    autoLineup, autoLineupAvailable: (g, c) => autoLineup(g, c, true), validateLineup, arenaCapacity, arenaHasCevLicense, clubPower,
    emptyRow, tablePoints, sortTable, makeEuroClubs,
  };
})(typeof window !== 'undefined' ? window : globalThis);
