/* Сетка — экономика клуба: билеты, спонсоры, арена как капекс, кредиты, призовые. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U, DIVISIONS, ARENA_UPGRADES, SPONSOR_BRANDS, SPONSOR_TYPES } = S;
  const P = S.Players;

  const PRIZE_BASE = 70e6; // призовые чемпиона Суперлиги

  function ledger(club, kind, label, amount) {
    club.finance.balance += amount;
    club.finance.ledger.unshift({ kind, label, amount, ts: Date.now() });
    if (club.finance.ledger.length > 60) club.finance.ledger.pop();
    if (amount > 0) club.finance.seasonIncome += amount; else club.finance.seasonSpend -= amount;
    return amount;
  }

  function wageBill(game, club) {
    return U.sum(club.squad.map((id) => game.players[id]).filter(Boolean), (p) => p.contract.wage);
  }

  function sponsorIncome(club) {
    return U.sum(club.finance.sponsors, (s) => s.monthly);
  }

  /* ---------- билеты ---------- */
  function attendance(game, club, opponent) {
    const cap = S.World.arenaCapacity(club);
    const div = DIVISIONS[club.division];
    const fans = club.fans;
    const formWins = club.form.slice(-5).filter((f) => f === 'w').length;
    let fill = 0.30 + fans.mood / 250 + formWins * 0.055 + club.mediaIndex / 420;
    const oppRep = opponent ? (opponent.reputation != null ? opponent.reputation : opponent.power) : null;
    if (oppRep != null) fill += U.clamp((oppRep - 55) / 320, -0.05, 0.14);
    // цена билета: дороже ожидаемой — зал пустее
    const expected = 300 + club.reputation * 12;
    fill *= U.clamp(1.25 - (club.ticketPrice / expected) * 0.42, 0.45, 1.2);
    fill = U.clamp(fill, 0.12, 0.99);
    // абонементы — гарантированный пол посещаемости: эти люди придут в любую погоду
    const floor = Math.min(cap, fans.members * 0.9);
    const count = Math.max(Math.round(cap * fill), Math.round(floor));
    return { count, fill: count / cap, cap, members: fans.members };
  }

  function matchdayIncome(game, club, opponent) {
    const att = attendance(game, club, opponent);
    const tickets = att.count * club.ticketPrice;
    const vip = club.arena.vip * 45 * club.ticketPrice * 4; // ложи продаются пакетами
    const total = Math.round(tickets + vip);
    ledger(club, 'tickets', 'Домашний матч: билеты' + (club.arena.vip ? ' и ложи' : ''), total);
    // полный зал сам по себе поднимает настроение, пустой — гасит
    S.Fans.shift(game, club, att.fill > 0.82 ? 0.5 : att.fill < 0.45 ? -0.4 : 0);
    return { total, attendance: att };
  }

  /* ---------- месячный тик (каждые 4 недели) ---------- */
  /** Взнос учредителя: регион или профильная компания закрывают часть сметы —
      так устроено большинство клубов в реальном волейболе, без этого низшие лиги нежизнеспособны. */
  const FOUNDER_BASE = [2.8e6, 750e3, 300e3, 150e3];
  function founderSupport(club) {
    return Math.round(FOUNDER_BASE[club.division] * (0.55 + club.reputation / 110) / 1000) * 1000;
  }

  function monthlyTick(game, club) {
    const out = [];
    const support = founderSupport(club);
    ledger(club, 'founder', 'Взнос учредителя клуба', support);
    out.push({ label: 'Учредитель', amount: support });
    const wages = wageBill(game, club);
    ledger(club, 'wages', 'Зарплатная ведомость', -wages);
    out.push({ label: 'Зарплаты', amount: -wages });
    const sp = sponsorIncome(club);
    if (sp > 0) { ledger(club, 'sponsor', 'Спонсорские выплаты', sp); out.push({ label: 'Спонсоры', amount: sp }); }
    if (club.finance.loanMonths > 0) {
      const pay = club.finance.loanMonthly;
      ledger(club, 'loan', 'Платёж по кредиту', -pay);
      club.finance.loanMonths--;
      club.finance.debt = Math.max(0, club.finance.debt - pay);
      out.push({ label: 'Кредит', amount: -pay });
      if (club.finance.loanMonths === 0) club.finance.loanMonthly = 0;
    }
    // содержание арены
    const upkeep = Math.round(S.World.arenaCapacity(club) * 220 + club.arena.vip * 180000 + club.arena.media * 240000 + club.arena.base * 300000);
    ledger(club, 'upkeep', 'Содержание арены и базы', -upkeep);
    out.push({ label: 'Инфраструктура', amount: -upkeep });
    if (club.transferFreeze > 0) club.transferFreeze--;
    // контракты спонсоров тикают
    club.finance.sponsors.forEach((s) => { s.monthsLeft--; });
    const expired = club.finance.sponsors.filter((s) => s.monthsLeft <= 0);
    club.finance.sponsors = club.finance.sponsors.filter((s) => s.monthsLeft > 0);
    expired.forEach((s) => {
      if (s.rename && club.name === s.brand + ' ' + club.city) restoreName(club);
      out.push({ label: 'Контракт «' + s.brand + '» истёк', amount: 0, expired: true });
    });
    // стройка на арене
    club.arena.works.forEach((w) => { w.monthsLeft--; });
    const done = club.arena.works.filter((w) => w.monthsLeft <= 0);
    club.arena.works = club.arena.works.filter((w) => w.monthsLeft > 0);
    done.forEach((w) => {
      club.arena[w.id]++;
      out.push({ label: 'Сдан объект: ' + w.name, amount: 0, built: w });
    });
    return out;
  }

  /* ---------- призовые ---------- */
  function prizeMoney(divisionId, position, size) {
    const div = DIVISIONS[divisionId];
    const share = Math.pow(U.clamp(1 - (position - 1) / size, 0.05, 1), 2.1);
    return Math.round(PRIZE_BASE * div.prize * share / 1e5) * 1e5;
  }

  function euroPrize(cupId, stage) {
    const cup = S.EURO_CUPS.find((c) => c.id === cupId);
    const stageMult = { group: 0.35, qf: 0.6, sf: 0.85, final: 1.2, win: 1.8 }[stage] || 0.3;
    return Math.round(PRIZE_BASE * 0.32 * cup.prize * stageMult / 1e5) * 1e5;
  }

  /* ---------- спонсоры ---------- */
  function renameFor(club, brand) {
    club.name = brand + ' ' + club.city;
  }
  function restoreName(club) { club.name = club.baseName; }

  function sponsorValue(club, type) {
    const div = DIVISIONS[club.division];
    const mediaFactor = 0.55 + club.mediaIndex / 130;
    const repFactor = 0.7 + club.reputation / 200;
    const base = 22e6 * div.wageIndex * mediaFactor * repFactor;
    const mult = { title: 0.22, kit: 0.09, local: 0.035 }[type];
    return Math.round(base * mult / 1e5) * 1e5;
  }

  /** бренды, уже занятые другими клубами: два «Севергаза» в одной лиге выглядят ошибкой */
  function usedBrands(game) {
    const set = new Set();
    Object.values(game.clubs).forEach((c) => c.finance.sponsors.forEach((s) => set.add(s.brand)));
    return set;
  }

  function generateSponsorOffers(game, club, rng, count) {
    const offers = [];
    const taken = usedBrands(game);
    const has = (t) => club.finance.sponsors.some((s) => s.type === t);
    const types = ['title', 'kit', 'local'].filter((t) => !has(t));
    for (const type of types) {
      const meta = SPONSOR_TYPES[type];
      if (club.division > meta.minDivision) continue;
      if (club.mediaIndex < meta.minMedia) continue;
      if (!rng.chance(type === 'title' ? 0.55 + club.mediaIndex / 300 : 0.85)) continue;
      const free = SPONSOR_BRANDS[type].filter((b) => !taken.has(b));
      if (!free.length) continue;
      const brand = rng.pick(free);
      taken.add(brand);
      const monthly = Math.round(sponsorValue(club, type) * rng.range(0.85, 1.2) / 1e5) * 1e5;
      offers.push({
        id: 'so' + U.id(), type, brand, monthly,
        years: type === 'local' ? 1 : rng.int(1, 3),
        rename: meta.rename,
        bonusTop4: Math.round(monthly * rng.range(2, 4)),
        bonusEuro: Math.round(monthly * rng.range(3, 6)),
        penaltyRelegation: Math.round(monthly * rng.range(1.5, 3)),
        breakFee: meta.rename ? Math.round(monthly * 6) : Math.round(monthly * 2),
        note: meta.note,
        name: meta.name,
      });
      if (offers.length >= (count || 3)) break;
    }
    return offers;
  }

  function signSponsor(game, club, offer) {
    const contract = {
      id: offer.id, type: offer.type, brand: offer.brand, monthly: offer.monthly,
      monthsLeft: offer.years * 9, years: offer.years, rename: offer.rename,
      bonusTop4: offer.bonusTop4, bonusEuro: offer.bonusEuro, penaltyRelegation: offer.penaltyRelegation,
      breakFee: offer.breakFee, name: offer.name,
    };
    club.finance.sponsors.push(contract);
    if (offer.rename) renameFor(club, offer.brand);
    // подписной бонус
    ledger(club, 'sponsor', 'Подписной бонус: ' + offer.brand, offer.monthly * 2);
    return contract;
  }

  function breakSponsor(game, club, contractId) {
    const idx = club.finance.sponsors.findIndex((s) => s.id === contractId);
    if (idx < 0) return null;
    const c = club.finance.sponsors[idx];
    ledger(club, 'sponsor', 'Штраф за разрыв контракта: ' + c.brand, -c.breakFee);
    club.finance.sponsors.splice(idx, 1);
    if (c.rename) restoreName(club);
    return c;
  }

  /* ---------- арена ---------- */
  /** стройка в низших лигах дешевле: другой класс подрядчиков и объёмов */
  const TIER_COST = [1, 0.62, 0.36, 0.22];

  function upgradeCost(club, upgradeId) {
    const up = ARENA_UPGRADES.find((u) => u.id === upgradeId);
    const lvl = club.arena[upgradeId] + club.arena.works.filter((w) => w.id === upgradeId).length;
    if (lvl >= up.levels) return null;
    return Math.round(up.baseCost * TIER_COST[club.division] * Math.pow(up.costGrow, lvl) / 1e5) * 1e5;
  }

  function startUpgrade(game, club, upgradeId, useLoan) {
    const up = ARENA_UPGRADES.find((u) => u.id === upgradeId);
    const cost = upgradeCost(club, upgradeId);
    if (cost == null) return { ok: false, reason: 'Максимальный уровень уже достигнут.' };
    if (club.arena.works.length >= 2) return { ok: false, reason: 'Одновременно можно вести не больше двух строек.' };
    if (useLoan) {
      const r = takeLoan(game, club, cost);
      if (!r.ok) return r;
    } else if (club.finance.balance < cost) {
      return { ok: false, reason: 'Не хватает денег: нужно ' + U.money(cost) + '. Можно взять кредит.' };
    } else {
      ledger(club, 'capex', 'Стройка: ' + up.name, -cost);
    }
    club.arena.works.push({ id: up.id, name: up.name, monthsLeft: up.months, cost });
    return { ok: true, cost };
  }

  function loanLimit(game, club) {
    const income = sponsorIncome(club) * 9 + S.World.arenaCapacity(club) * club.ticketPrice * 12;
    return Math.round(Math.max(15e6, income * 1.1 - club.finance.debt) / 1e5) * 1e5;
  }

  function takeLoan(game, club, amount) {
    const limit = loanLimit(game, club);
    if (amount > limit) return { ok: false, reason: 'Банк даёт не больше ' + U.money(limit) + '.' };
    const months = 27; // три сезона
    const rate = 0.16;
    const total = amount * (1 + rate);
    club.finance.debt += total;
    club.finance.loanMonthly += Math.round(total / months);
    club.finance.loanMonths = Math.max(club.finance.loanMonths, months);
    ledger(club, 'loan', 'Кредит на развитие', amount);
    return { ok: true, amount, monthly: Math.round(total / months), months };
  }

  /* ---------- финансовая сводка ---------- */
  function summary(game, club) {
    const wages = wageBill(game, club);
    const sponsors = sponsorIncome(club);
    const upkeep = Math.round(S.World.arenaCapacity(club) * 220 + club.arena.vip * 180000 + club.arena.media * 240000 + club.arena.base * 300000);
    const att = attendance(game, club, null);
    const perMatch = att.count * club.ticketPrice + club.arena.vip * 45 * club.ticketPrice * 4;
    const homeMatchesPerMonth = 2;
    const support = founderSupport(club);
    const monthly = sponsors + support + perMatch * homeMatchesPerMonth - wages - upkeep - (club.finance.loanMonths > 0 ? club.finance.loanMonthly : 0);
    return { wages, sponsors, support, upkeep, perMatch, monthly, attendance: att, debt: club.finance.debt };
  }

  S.Economy = {
    ledger, wageBill, sponsorIncome, attendance, matchdayIncome, monthlyTick,
    prizeMoney, euroPrize, founderSupport, usedBrands, generateSponsorOffers, signSponsor, breakSponsor, sponsorValue,
    upgradeCost, startUpgrade, takeLoan, loanLimit, summary, renameFor, restoreName, PRIZE_BASE, TIER_COST,
  };
})(typeof window !== 'undefined' ? window : globalThis);
