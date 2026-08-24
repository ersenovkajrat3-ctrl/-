/* Сетка — игроки: генерация, рейтинги, развитие, стоимость, зарплата. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U, ROLE_WEIGHTS, NAMES, FOREIGN_LANGS } = S;

  const SKILLS = ['serve', 'attack', 'block', 'receive', 'set', 'defense'];
  const SKILL_NAMES = { serve: 'Подача', attack: 'Атака', block: 'Блок', receive: 'Приём', set: 'Пас', defense: 'Защита' };

  /** профиль амплуа: смещение навыков относительно базового уровня игрока */
  const ROLE_BIAS = {
    S:  { set: +14, serve: +1, block: -2, defense: +2, receive: -8, attack: -10 },
    OP: { attack: +12, serve: +6, block: +1, defense: -4, receive: -14, set: -16 },
    OH: { attack: +6, receive: +7, serve: +2, defense: +4, block: -4, set: -12 },
    MB: { block: +13, attack: +5, serve: 0, defense: -3, receive: -12, set: -14 },
    L:  { receive: +16, defense: +15, set: -2, attack: -26, serve: -24, block: -22 },
  };

  /* Калибровка по амплуа: у либеро оцениваются всего два навыка, и без поправки
     его «общий рейтинг» оказывается систематически выше, чем у нападающих.
     На сами навыки поправка не влияет — только на сопоставимость чисел в интерфейсе,
     зарплатах и трансферной стоимости. */
  const ROLE_CALIB = { S: 0, OP: 0, OH: 0, MB: 0, L: -12 };

  function overall(p) {
    const w = ROLE_WEIGHTS[p.role];
    let v = 0;
    for (const k of SKILLS) v += (p.skills[k] || 0) * (w[k] || 0);
    return Math.round(U.clamp(v + (ROLE_CALIB[p.role] || 0), 1, 99));
  }

  /** эффективный навык с учётом усталости, формы и морали */
  function eff(p, skill) {
    const fatiguePenalty = (p.fatigue / 100) * 16;      // до −16 при полной усталости
    const formBonus = (p.form - 50) * 0.10;             // ±5
    const moralBonus = (p.morale - 50) * 0.04;          // ±2
    return U.clamp(p.skills[skill] - fatiguePenalty + formBonus + moralBonus, 5, 99);
  }

  /* Зарплата привязана к дивизиону: «типовой» игрок дивизиона стоит DIV_WAGE_UNIT в месяц,
     каждый пункт рейтинга сверх типового добавляет 7,8%. Так ведомость каждой лиги
     остаётся соразмерной её же доходам — от полупрофессионалов до Суперлиги. */
  const DIV_TYPICAL_OVR = [72, 62, 54, 46];
  const DIV_WAGE_UNIT = [664000, 168000, 70000, 18000];

  function wageFor(ovr, divisionId) {
    const d = U.clamp(divisionId | 0, 0, 3);
    const factor = U.clamp(Math.pow(1.078, ovr - DIV_TYPICAL_OVR[d]), 0.12, 6);
    return Math.round(DIV_WAGE_UNIT[d] * factor / 1000) * 1000;
  }

  function valueFor(p) {
    const ovr = overall(p);
    let v = Math.pow(Math.max(1, ovr - 20), 3.0) * 600;
    const age = p.age;
    if (age <= 21) v *= 1.15 + (p.potential - ovr) * 0.012;
    else if (age <= 25) v *= 1.1 + (p.potential - ovr) * 0.01;
    else if (age <= 29) v *= 1.0;
    else if (age <= 32) v *= 0.7;
    else v *= 0.42;
    if (p.foreign) v *= 1.15;
    return Math.round(v / 1e5) * 1e5;
  }

  function makeName(rng, foreign) {
    const lang = foreign ? rng.pick(FOREIGN_LANGS) : 'ru';
    const pool = NAMES[lang];
    return { first: rng.pick(pool.first), last: rng.pick(pool.last), lang };
  }

  /**
   * Генерация игрока.
   * @param level базовый уровень мастерства (соответствует силе клуба)
   */
  function makePlayer(rng, role, level, opts = {}) {
    const age = opts.age != null ? opts.age : Math.round(U.clamp(rng.normal(26, 4.4), 17, 38));
    const foreign = opts.foreign != null ? opts.foreign : rng.chance(0.16);
    const nm = makeName(rng, foreign);
    // молодые ещё не раскрыты: их текущий уровень ниже целевого
    let curve = 1;
    if (age < 20) curve = 0.72; else if (age < 23) curve = 0.85; else if (age < 26) curve = 0.95;
    else if (age > 33) curve = 0.9; else if (age > 30) curve = 0.97;
    const base = rng.normal(level, 5.5) * curve;
    const skills = {};
    for (const k of SKILLS) {
      skills[k] = Math.round(U.clamp(base + (ROLE_BIAS[role][k] || 0) + rng.normal(0, 4.5), 12, 96));
    }
    const p = {
      id: 'p' + U.id(),
      first: nm.first, last: nm.last, lang: nm.lang, foreign,
      role, age, skills,
      stamina: Math.round(U.clamp(rng.normal(70, 11), 35, 97)),
      potential: 0, form: Math.round(rng.range(42, 62)), fatigue: 0, morale: Math.round(rng.range(45, 70)),
      clubId: opts.clubId || null,
      contract: { wage: 0, years: rng.int(1, 3) },
      value: 0,
      youth: !!opts.youth,
      history: [],
      st: emptyStats(),
      season: emptyStats(),
      career: emptyStats(),
    };
    const ovr = overall(p);
    p.potential = Math.round(U.clamp(ovr + (age < 24 ? rng.range(4, 20) * (24 - age) / 6 : rng.range(0, 3)), ovr, 97));
    p.contract.wage = wageFor(ovr, opts.divisionId != null ? opts.divisionId : 2);
    p.value = valueFor(p);
    return p;
  }

  function emptyStats() {
    return { matches: 0, sets: 0, points: 0, kills: 0, attacks: 0, aces: 0, serveErrors: 0, blocks: 0, digs: 0, receptions: 0, recPerfect: 0, recErrors: 0, attackErrors: 0 };
  }
  function addStats(dst, src) { for (const k in src) dst[k] = (dst[k] || 0) + src[k]; }

  /** состав клуба: 2 связующих, 2 диагональных, 4 доигровщика, 4 центральных, 2 либеро (+ молодёжь) */
  const SQUAD_PLAN = [['S', 2], ['OP', 2], ['OH', 4], ['MB', 4], ['L', 2]];

  function makeSquad(rng, level, divisionId, clubId, foreignLimit) {
    const squad = [];
    const used = new Set();
    let foreigners = 0;
    const uniq = (p) => {
      // две одинаковые фамилии в одном составе путают в комментарии матча
      let guard = 0;
      while (used.has(p.last) && guard++ < 12) p.last = rng.pick(NAMES[p.lang].last);
      used.add(p.last);
      return p;
    };
    for (const [role, n] of SQUAD_PLAN) {
      for (let i = 0; i < n; i++) {
        // первые номера сильнее запасных
        const lv = level - (i === 0 ? 0 : i * 3.2);
        const canForeign = foreigners < foreignLimit && i === 0 && rng.chance(0.45);
        const p = uniq(makePlayer(rng, role, lv, { clubId, divisionId, foreign: canForeign }));
        if (p.foreign) foreigners++;
        squad.push(p);
      }
    }
    // двое молодых из академии
    for (let i = 0; i < 2; i++) {
      const role = rng.pick(['OH', 'MB', 'OP', 'S']);
      squad.push(uniq(makePlayer(rng, role, level - 12, { clubId, divisionId, age: rng.int(17, 19), foreign: false, youth: true })));
    }
    return squad;
  }

  /** межсезонное развитие: молодые растут к потенциалу, ветераны спадают */
  function develop(rng, p, trainingLevel) {
    p.age++;
    const ovr = overall(p);
    const gap = p.potential - ovr;
    let delta;
    if (p.age <= 23) delta = rng.range(0.8, 2.6) + gap * 0.16 + trainingLevel * 0.45;
    else if (p.age <= 27) delta = rng.range(-0.2, 1.4) + gap * 0.08 + trainingLevel * 0.25;
    else if (p.age <= 30) delta = rng.range(-0.8, 0.7) + trainingLevel * 0.12;
    else if (p.age <= 33) delta = rng.range(-2.4, 0.2);
    else delta = rng.range(-4.2, -0.6);
    // игровая практика ускоряет рост, скамейка — тормозит
    const load = U.clamp(p.season.sets / 60, 0, 1.2);
    delta += (load - 0.5) * (p.age <= 25 ? 1.2 : 0.4);
    for (const k of SKILLS) {
      p.skills[k] = Math.round(U.clamp(p.skills[k] + delta + rng.normal(0, 0.9), 8, 97));
    }
    p.stamina = Math.round(U.clamp(p.stamina + (p.age <= 25 ? rng.range(0, 2) : rng.range(-2.5, 0.5)), 30, 97));
    p.value = valueFor(p);
    p.youth = p.youth && p.age < 21;
    addStats(p.career, p.season);
    p.season = emptyStats();
    return delta;
  }

  S.Players = {
    SKILLS, SKILL_NAMES, ROLE_BIAS, SQUAD_PLAN,
    overall, eff, wageFor, valueFor, ROLE_CALIB, DIV_TYPICAL_OVR, DIV_WAGE_UNIT, makePlayer, makeSquad, develop,
    emptyStats, addStats,
    fullName: (p) => p.first + ' ' + p.last,
    shortName: (p) => p.first[0] + '. ' + p.last,
  };
})(typeof window !== 'undefined' ? window : globalThis);
