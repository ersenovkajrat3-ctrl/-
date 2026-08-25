/* Volleyball Manager — трансферы: рынок, лимит легионеров, торг, работа ИИ-клубов. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U, FOREIGN_LIMIT, DIVISIONS } = S;
  const P = S.Players, W = S.World, Ec = S.Economy;

  const MIN_BY_ROLE = { S: 2, OP: 2, OH: 3, MB: 3, L: 2 };

  function squadOf(game, club) { return club.squad.map((id) => game.players[id]).filter(Boolean); }
  function countRole(game, club, role) { return squadOf(game, club).filter((p) => p.role === role).length; }
  function foreignCount(game, club) { return squadOf(game, club).filter((p) => p.foreign).length; }

  /* ---------- окно ---------- */
  function openWindow(game, type) {
    game.window = { open: true, type, opened: game.week };
    buildMarket(game);
    if (game.playerClubId) {
      game.inbox.unshift({
        week: game.week, kind: 'transfer',
        text: (type === 'preseason' ? 'Летнее' : 'Зимнее') + ' трансферное окно открыто. Лимит легионеров в вашем дивизионе: ' +
          FOREIGN_LIMIT[game.clubs[game.playerClubId].division] + '.',
      });
    }
  }
  function closeWindow(game) {
    if (!game.window || !game.window.open) return;
    game.window.open = false;
    game.market = [];
    if (game.playerClubId) game.inbox.unshift({ week: game.week, kind: 'transfer', text: 'Трансферное окно закрыто.' });
  }

  /* ---------- рынок ---------- */
  function askingPrice(game, player) {
    const club = player.clubId && game.clubs[player.clubId];
    let mult = 1.15;
    if (club) {
      const isKey = squadOf(game, club).filter((p) => p.role === player.role).sort((a, b) => P.overall(b) - P.overall(a))[0] === player;
      mult = isKey ? 1.75 : 1.2;
    }
    return Math.round(P.valueFor(player) * mult / 1e5) * 1e5;
  }
  function wageDemand(game, player, targetDivision) {
    const ovr = P.overall(player);
    const base = P.wageFor(ovr, targetDivision);
    return Math.round(Math.max(base, player.contract.wage * 1.05) * (1 + (player.foreign ? 0.25 : 0.08)) / 1000) * 1000;
  }

  /** Зарубежный рынок: клубы Италии, Польши, Турции и остальной Европы и продают, и покупают.
      Их игроки идут в заявку легионерами, стоят дороже и просят больше — зато класс выше. */
  function foreignMarket(game, rng) {
    const list = [];
    const pool = game.euroClubs.slice().sort((a, b) => b.power - a.power);
    const count = 8;
    for (let i = 0; i < count; i++) {
      const club = rng.weighted(pool, (c) => Math.pow(c.power, 2.6));
      const role = rng.pick(['S', 'OP', 'OH', 'OH', 'MB', 'MB', 'L']);
      const level = U.clamp(club.power * 0.92 + rng.range(-5, 9), 42, 96);
      const p = P.makePlayer(rng, role, level, { divisionId: 0, foreign: true });
      p.abroadClub = club.id;
      p.contract = { wage: P.wageFor(P.overall(p), 0), years: rng.int(1, 3) };
      game.players[p.id] = p;
      list.push({
        playerId: p.id, clubId: null, abroad: true, from: club.name, country: club.country,
        ask: Math.round(P.valueFor(p) * rng.range(1.15, 1.5) / 1e5) * 1e5,   // трансфер за границу дороже: агенты, налоги, переезд
        ovr: P.overall(p),
      });
    }
    return list;
  }

  function buildMarket(game) {
    const rng = game._rng;
    const list = [];
    // свободные агенты — под уровень каждого дивизиона
    for (let d = 0; d <= 3; d++) {
      const [lo, hi] = W.TIER_LEVEL[d];
      const n = d === 0 ? 7 : 6;
      for (let i = 0; i < n; i++) {
        const role = rng.pick(['S', 'OP', 'OH', 'OH', 'MB', 'MB', 'L']);
        const p = P.makePlayer(rng, role, rng.range(lo - 4, hi + 2), { divisionId: d, foreign: rng.chance(0.3) });
        game.players[p.id] = p;
        list.push({ playerId: p.id, clubId: null, free: true });
      }
    }
    // выставленные клубами: лишние по амплуа и те, кому мало игрового времени
    Object.values(game.clubs).forEach((club) => {
      if (club.isPlayer) return;
      const squad = squadOf(game, club).sort((a, b) => P.overall(b) - P.overall(a));
      squad.forEach((p, i) => {
        const depth = squad.filter((x) => x.role === p.role);
        const rankInRole = depth.sort((a, b) => P.overall(b) - P.overall(a)).indexOf(p);
        if (rankInRole >= (MIN_BY_ROLE[p.role] || 2) - 1 && rng.chance(0.35)) list.push({ playerId: p.id, clubId: club.id, free: false });
        else if (p.age >= 33 && rng.chance(0.25)) list.push({ playerId: p.id, clubId: club.id, free: false });
      });
    });
    game.market = list.map((it) => {
      const p = game.players[it.playerId];
      return Object.assign(it, { ask: it.free ? 0 : askingPrice(game, p), ovr: P.overall(p) });
    }).concat(foreignMarket(game, rng));
  }

  /* ---------- покупка ---------- */
  function canSign(game, club, player) {
    const problems = [];
    if (player.foreign && foreignCount(game, club) >= FOREIGN_LIMIT[club.division]) {
      problems.push('Лимит легионеров исчерпан (' + FOREIGN_LIMIT[club.division] + ' в заявке).');
    }
    if (squadOf(game, club).length >= 22) problems.push('В заявке уже 22 игрока.');
    return problems;
  }

  function buy(game, clubId, playerId, opts = {}) {
    const club = game.clubs[clubId];
    const player = game.players[playerId];
    const entry = game.market.find((m) => m.playerId === playerId);
    if (!club || !player || !entry) return { ok: false, reason: 'Игрок больше не доступен.' };
    if (!game.window || !game.window.open) return { ok: false, reason: 'Трансферное окно закрыто.' };
    if (club.transferFreeze > 0) return { ok: false, reason: 'Совет заморозил трансферы: осталось ' + club.transferFreeze + ' мес.' };
    const problems = canSign(game, club, player);
    if (problems.length) return { ok: false, reason: problems.join(' ') };
    const fee = opts.fee != null ? opts.fee : entry.ask;
    const wage = opts.wage != null ? opts.wage : wageDemand(game, player, club.division);
    if (club.finance.balance < fee) return { ok: false, reason: 'Не хватает денег на трансфер: нужно ' + U.money(fee) + '.' };
    // игрок сравнивает амбиции: слабый клуб не подпишет звезду
    const ovr = P.overall(player);
    const clubPull = club.reputation + (3 - club.division) * 8 + club.mediaIndex * 0.2;
    if (ovr > clubPull * 0.95 + 12) return { ok: false, reason: P.fullName(player) + ' не видит себя в клубе такого уровня.' };
    if (wage < wageDemand(game, player, club.division) * 0.95) return { ok: false, reason: 'Игрок хочет больше денег.' };
    // сделка
    if (fee > 0) {
      Ec.ledger(club, 'transfer', (entry.abroad ? 'Покупка из-за рубежа: ' : 'Покупка: ') + P.fullName(player), -fee);
      if (entry.abroad) {
        const agents = Math.round(fee * 0.07);
        Ec.ledger(club, 'transfer', 'Агентские и оформление перехода', -agents);
      }
      if (entry.clubId && game.clubs[entry.clubId]) {
        const seller = game.clubs[entry.clubId];
        Ec.ledger(seller, 'transfer', 'Продажа: ' + P.fullName(player), fee);
        seller.squad = seller.squad.filter((id) => id !== playerId);
        fillSquad(game, seller);
      }
    }
    player.clubId = club.id;
    player.contract = { wage, years: opts.years || 2 };
    player.fatigue = Math.max(0, player.fatigue - 20);
    club.squad.push(playerId);
    game.market = game.market.filter((m) => m.playerId !== playerId);
    W.autoLineupAvailable(game, club);
    S.Fans.onTransferIn(game, club, player);
    // именная форма новой звезды сама себя продаёт
    if (P.overall(player) >= 78) Ec.merchSpike(game, club, (P.overall(player) - 74) / 60);
    if (club.isPlayer) {
      S.Feed.event(game, club, 'transferIn', {
        player: P.fullName(player), role: S.ROLES[player.role].full, club: club.name, fee: fee ? U.money(fee) : 'свободный агент',
      }, 1.2);
    }
    return { ok: true, fee, wage, player };
  }

  /** торг: попытка сбить цену. Успех зависит от медийности и репутации клуба */
  function haggle(game, clubId, playerId) {
    const club = game.clubs[clubId];
    const entry = game.market.find((m) => m.playerId === playerId);
    if (!entry || entry.free) return { ok: false, reason: 'Торговаться не с кем — игрок свободен.' };
    if (entry.haggled) return { ok: false, reason: 'Вы уже торговались по этому игроку.' };
    entry.haggled = true;
    const rng = game._rng;
    const chance = U.clamp(0.3 + club.mediaIndex / 300 + club.reputation / 320, 0.2, 0.75);
    if (rng.chance(chance)) {
      const cut = rng.range(0.08, 0.22);
      entry.ask = Math.round(entry.ask * (1 - cut) / 1e5) * 1e5;
      return { ok: true, ask: entry.ask, cut: Math.round(cut * 100) };
    }
    entry.ask = Math.round(entry.ask * 1.05 / 1e5) * 1e5;
    return { ok: false, reason: 'Клуб-продавец на уступки не пошёл и поднял цену.', ask: entry.ask };
  }

  /* ---------- продажа ---------- */
  function offersFor(game, playerId) {
    const player = game.players[playerId];
    const club = game.clubs[player.clubId];
    const rng = game._rng;
    const ovr = P.overall(player);
    const buyers = Object.values(game.clubs).filter((c) => {
      if (c.id === club.id) return false;
      if (player.foreign && foreignCount(game, c) >= FOREIGN_LIMIT[c.division]) return false;
      const pull = c.reputation + (3 - c.division) * 8;
      return ovr <= pull * 0.95 + 10 && ovr >= pull * 0.45;
    });
    const offers = rng.shuffle(buyers).slice(0, 3).map((c) => ({
      clubId: c.id, name: c.name,
      fee: Math.round(P.valueFor(player) * rng.range(0.72, 1.25) / 1e5) * 1e5,
    }));
    // зарубежные клубы платят больше, но игрок уезжает из страны насовсем
    const abroad = game.euroClubs.filter((c) => ovr >= c.power * 0.78 && ovr <= c.power * 1.15);
    rng.shuffle(abroad).slice(0, ovr >= 74 ? 2 : 1).forEach((c) => {
      offers.push({
        clubId: c.id, name: c.name, abroad: true, country: c.country,
        fee: Math.round(P.valueFor(player) * rng.range(1.05, 1.55) / 1e5) * 1e5,
      });
    });
    return offers.sort((a, b) => b.fee - a.fee);
  }

  function sell(game, playerId, offer) {
    const player = game.players[playerId];
    const club = game.clubs[player.clubId];
    if (!game.window || !game.window.open) return { ok: false, reason: 'Трансферное окно закрыто.' };
    if (squadOf(game, club).filter((p) => p.role === player.role).length <= (MIN_BY_ROLE[player.role] || 2) - 1) {
      return { ok: false, reason: 'Нельзя продать: в амплуа «' + S.ROLES[player.role].name.toLowerCase() + '» не останется замены.' };
    }
    const buyer = game.clubs[offer.clubId];
    Ec.ledger(club, 'transfer', (offer.abroad ? 'Продажа за рубеж: ' : 'Продажа: ') + P.fullName(player), offer.fee);
    if (offer.abroad) {
      // игрок уходит в зарубежный клуб и выпадает из внутреннего рынка
      game.euroSquads = game.euroSquads || {};
      const squad = game.euroSquads[offer.clubId];
      if (squad) squad.push(playerId);
      player.clubId = offer.clubId;
      player.abroadClub = offer.clubId;
      club.squad = club.squad.filter((id) => id !== playerId);
      S.Fans.onTransferOut(game, club, player);
      W.autoLineupAvailable(game, club);
      if (club.isPlayer) {
        game.inbox.unshift({
          week: game.week, kind: 'transfer',
          text: P.fullName(player) + ' продан в ' + offer.name + ' (' + offer.country + ') за ' + U.money(offer.fee) + '.',
        });
        S.Feed.event(game, club, 'transferOut', { player: P.fullName(player), club: club.name, fee: U.money(offer.fee) }, 1.2);
      }
      return { ok: true, fee: offer.fee, abroad: true };
    }
    if (buyer) {
      Ec.ledger(buyer, 'transfer', 'Покупка: ' + P.fullName(player), -offer.fee);
      buyer.squad.push(playerId);
      player.clubId = buyer.id;
      player.contract.wage = wageDemand(game, player, buyer.division);
      W.autoLineupAvailable(game, buyer);
    }
    S.Fans.onTransferOut(game, club, player);
    club.squad = club.squad.filter((id) => id !== playerId);
    W.autoLineupAvailable(game, club);
    if (club.isPlayer) {
      S.Feed.event(game, club, 'transferOut', { player: P.fullName(player), club: club.name, fee: U.money(offer.fee) }, 1);
    }
    return { ok: true, fee: offer.fee };
  }

  function release(game, playerId) {
    const player = game.players[playerId];
    const club = game.clubs[player.clubId];
    const payoff = player.contract.wage * Math.max(1, player.contract.years * 3);
    if (squadOf(game, club).filter((p) => p.role === player.role).length <= (MIN_BY_ROLE[player.role] || 2) - 1) {
      return { ok: false, reason: 'Нельзя отпустить: в амплуа не останется замены.' };
    }
    Ec.ledger(club, 'transfer', 'Компенсация при расторжении: ' + P.fullName(player), -payoff);
    club.squad = club.squad.filter((id) => id !== playerId);
    player.clubId = null;
    W.autoLineupAvailable(game, club);
    return { ok: true, payoff };
  }

  /* ---------- ИИ ---------- */
  function fillSquad(game, club) {
    const rng = game._rng;
    Object.keys(MIN_BY_ROLE).forEach((role) => {
      while (countRole(game, club, role) < MIN_BY_ROLE[role]) {
        const p = P.makePlayer(rng, role, club.level - rng.range(2, 9), {
          clubId: club.id, divisionId: club.division, foreign: false,
        });
        game.players[p.id] = p;
        club.squad.push(p.id);
      }
    });
  }

  /** редкие трансферы между ИИ-клубами по ходу окна — рынок должен «дышать» */
  function aiTick(game) {
    if (!game.window || !game.window.open) return;
    const rng = game._rng;
    const candidates = game.market.filter((m) => m.free && rng.chance(0.06));
    candidates.forEach((entry) => {
      const player = game.players[entry.playerId];
      const ovr = P.overall(player);
      const buyer = rng.pick(Object.values(game.clubs).filter((c) => !c.isPlayer && !canSign(game, c, player).length &&
        ovr <= c.reputation + (3 - c.division) * 8 && c.finance.balance > 0));
      if (!buyer) return;
      player.clubId = buyer.id;
      player.contract = { wage: wageDemand(game, player, buyer.division), years: 2 };
      buyer.squad.push(player.id);
      game.market = game.market.filter((m) => m.playerId !== entry.playerId);
      W.autoLineupAvailable(game, buyer);
    });
  }

  function aiOffseason(game) {
    const rng = game._rng;
    Object.values(game.clubs).forEach((club) => {
      if (club.isPlayer) return;
      fillSquad(game, club);
      // клуб подтягивает состав к уровню дивизиона
      const [lo, hi] = W.TIER_LEVEL[club.division];
      const target = U.lerp(lo, hi, U.clamp((club.reputation - 35) / 55, 0, 1));
      const squad = squadOf(game, club).sort((a, b) => P.overall(a) - P.overall(b));
      const gap = target - W.clubPower(game, club);
      if (gap > 2 && squad.length && club.finance.balance > 0) {
        const out = squad[0];
        if (countRole(game, club, out.role) > MIN_BY_ROLE[out.role]) {
          club.squad = club.squad.filter((id) => id !== out.id);
          delete game.players[out.id];
        }
        const role = rng.pick(['OH', 'MB', 'OP', 'S', 'L']);
        const p = P.makePlayer(rng, role, target + rng.range(-2, 4), { clubId: club.id, divisionId: club.division, foreign: rng.chance(0.2) && foreignCount(game, club) < FOREIGN_LIMIT[club.division] });
        game.players[p.id] = p;
        club.squad.push(p.id);
      }
      W.autoLineupAvailable(game, club);
    });
  }

  S.Transfers = {
    openWindow, closeWindow, buildMarket, askingPrice, wageDemand, canSign, buy, haggle,
    offersFor, sell, release, fillSquad, aiTick, aiOffseason, squadOf, foreignCount, countRole, MIN_BY_ROLE, foreignMarket,
  };
})(typeof window !== 'undefined' ? window : globalThis);
