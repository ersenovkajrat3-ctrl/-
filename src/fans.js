/* Сетка — болельщики: настроение трибун, ядро поддержки, абонементы, любимец публики,
   ожидания сезона и кричалки. Трибуны здесь не декорация: от них зависят посещаемость,
   деньги за абонементы, громкость зала и реальное преимущество своей площадки в движке матча. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U, DIVISIONS } = S;
  const P = S.Players;

  /* ---------- модель ---------- */
  function makeFans(rng, club) {
    const base = U.clamp(38 + club.reputation * 0.35, 30, 78);
    return {
      mood: Math.round(base),
      loyalty: Math.round(base * 0.9),          // ядро поддержки: меняется медленно
      members: 0,                                // абонементы на сезон
      memberIncome: 0,
      favoriteId: null,
      banner: null,
      demands: [],
      chants: ['base'],
      homeLosses: 0,
      streakBest: 0,
      log: [],
    };
  }

  /** к чему настроение тянется само по себе */
  function baseline(club) {
    // настроение тянется к ядру поддержки, а ядро само медленно идёт за настроением
    return U.clamp(club.fans.loyalty + (3 - club.division) * 2, 12, 92);
  }

  function shift(game, club, delta, reason) {
    const f = club.fans;
    if (!isFinite(delta)) return 0;
    const before = f.mood;
    f.mood = U.clamp(f.mood + delta, 3, 100);
    if (Math.abs(delta) >= 4 && reason) {
      f.log.unshift({ week: game.week, delta: Math.round(f.mood - before), reason });
      if (f.log.length > 12) f.log.pop();
    }
    return f.mood - before;
  }

  /* ---------- поддержка на матче ---------- */
  /** 0..1 — насколько зал помогает своей команде */
  function support(game, club, fill) {
    const f = club.fans;
    const noise = fill != null ? fill : 0.6;
    return U.clamp(noise * 0.55 + (f.mood / 100) * 0.30 + (f.members / Math.max(1, S.World.arenaCapacity(club))) * 0.15, 0, 1);
  }

  /** бонус своей площадки в движке матча: тихий полупустой зал почти ничего не даёт */
  function homeBonus(game, club, fill) {
    return 0.5 + support(game, club, fill) * 2.6;
  }

  /* ---------- реакция на матч ---------- */
  function afterMatch(game, club, opts) {
    const { won, home, opponent, competition, sets } = opts;
    let d = won ? 2.4 : -2.8;
    if (home) d *= 1.25;                                   // дома реакция острее
    if (opponent) {
      // у зарубежных клубов нет репутации — там её роль играет сила по коэффициенту страны
      const oppRep = opponent.reputation != null ? opponent.reputation : opponent.power;
      const gap = (oppRep != null ? oppRep : club.reputation) - club.reputation;
      if (won) d += U.clamp(gap / 14, -0.8, 3.2);          // победа над сильным ценится
      else d -= U.clamp(-gap / 14, -0.8, 2.6);             // поражение слабому бьёт больнее
    }
    if (competition === 'playoff' || competition === 'euro') d *= 1.5;
    if (sets && won && sets[0] === 3 && sets[1] === 2) d += 0.8;   // камбэк заводит трибуны
    if (!won && home) club.fans.homeLosses++;
    shift(game, club, d, won ? 'победа' : 'поражение');
    // кричалки открываются за события, а не за деньги
    const streak = club.form.slice().reverse().findIndex((x) => x !== 'w');
    const winStreak = streak < 0 ? club.form.length : streak;
    club.fans.streakBest = Math.max(club.fans.streakBest, winStreak);
    if (winStreak >= 5) unlock(game, club, 'streak');
    if (won && sets && sets[0] === 3 && sets[1] === 2) unlock(game, club, 'comeback');
  }

  /* ---------- кричалки ---------- */
  const CHANTS = {
    base: { id: 'base', name: 'Основная', text: 'Впе-рёд, {club}! Впе-рёд!', how: 'есть с самого начала' },
    streak: { id: 'streak', name: 'За серию', text: 'Мы не оста-но-вим-ся! Ещё! Ещё!', how: 'пять побед подряд' },
    comeback: { id: 'comeback', name: 'Камбэк', text: 'Ноль—два — и что? Мы всё равно вас до-жмём!', how: 'победа со счётом 3:2' },
    trophy: { id: 'trophy', name: 'Чемпионская', text: 'Чем-пи-о-ны! Чем-пи-о-ны!', how: 'выигранный трофей' },
    euro: { id: 'euro', name: 'Еврокубковая', text: 'Вся Ев-ро-па зна-ет нас!', how: 'матч в еврокубках' },
    derby: { id: 'derby', name: 'Дерби', text: 'Этот зал — только наш! Слышите?', how: 'победа над принципиальным соперником' },
    youth: { id: 'youth', name: 'За своих', text: 'Свой! Воспитанник! Наш!', how: 'воспитанник академии стал любимцем трибун' },
  };

  function unlock(game, club, id) {
    if (!CHANTS[id] || club.fans.chants.includes(id)) return false;
    club.fans.chants.push(id);
    if (club.isPlayer) {
      game.inbox.unshift({ week: game.week, kind: 'fans', text: 'Трибуны разучили новую кричалку: «' + CHANTS[id].name + '».' });
    }
    return true;
  }

  /** реплика трибун по ходу матча */
  function chantFor(game, club, situation) {
    const list = club.fans.chants.map((id) => CHANTS[id]).filter(Boolean);
    const rng = game._rng;
    let pick = list[0];
    if (situation === 'comeback' && club.fans.chants.includes('comeback')) pick = CHANTS.comeback;
    else if (situation === 'streak' && club.fans.chants.includes('streak')) pick = CHANTS.streak;
    else if (situation === 'euro' && club.fans.chants.includes('euro')) pick = CHANTS.euro;
    else pick = rng.pick(list);
    return pick.text.replace('{club}', club.baseName);
  }

  /* ---------- любимец трибун ---------- */
  function pickFavorite(game, club) {
    const squad = club.squad.map((id) => game.players[id]).filter(Boolean);
    if (!squad.length) return null;
    const scored = squad.map((p) => ({
      p,
      score: p.season.points * 1.2 + (p.youth || p.age <= 21 ? 25 : 0) + P.overall(p) * 1.5 +
        (p.clubId === club.id && p.homegrown ? 60 : 0) + (p.foreign ? -15 : 10),
    })).sort((a, b) => b.score - a.score);
    const fav = scored[0].p;
    const changed = club.fans.favoriteId !== fav.id;
    club.fans.favoriteId = fav.id;
    if (changed && (fav.youth || fav.homegrown)) unlock(game, club, 'youth');
    return fav;
  }

  /* ---------- абонементы ---------- */
  /** продажа абонементов перед сезоном: главная выплата, которую приносит настроение трибун */
  function sellSeasonTickets(game, club) {
    const f = club.fans;
    const cap = S.World.arenaCapacity(club);
    const div = DIVISIONS[club.division];
    const share = U.clamp(0.10 + f.mood / 340 + f.loyalty / 300, 0.08, 0.62);
    f.members = Math.round(cap * share);
    const homeMatches = Math.round((div.size - 1));
    const price = Math.round(club.ticketPrice * 0.72);       // абонемент дешевле разовых билетов
    const income = f.members * price * homeMatches;
    f.memberIncome = income;
    S.Economy.ledger(club, 'tickets', 'Абонементы на сезон (' + U.num(f.members) + ')', income);
    return { members: f.members, income, price };
  }

  /* ---------- ожидания трибун ---------- */
  function makeDemands(game, club) {
    const rng = game._rng;
    const div = game.divisions[club.division];
    const rivals = div.clubIds.filter((id) => id !== club.id)
      .sort((a, b) => game.clubs[b].reputation - game.clubs[a].reputation);
    const rival = game.clubs[rivals[0]];
    const pool = [
      { id: 'home', text: 'проиграть дома не больше пяти раз', check: (g, c) => c.fans.homeLosses <= 5, reward: 6 },
      { id: 'rival', text: 'обыграть «' + rival.baseName + '»', rivalId: rival.id, check: (g, c) => (c.fans.beatenRivals || []).includes(rival.id), reward: 8 },
      { id: 'youth', text: 'дать молодёжи не меньше 25 сетов', check: (g, c) => U.sum(c.squad.map((id) => g.players[id]).filter((p) => p && p.age <= 21), (p) => p.season.sets) >= 25, reward: 7 },
      { id: 'playoff', text: 'выйти в плей-офф', check: (g, c) => !!(g.playoffs && g.playoffs.byDiv[c.division].series.some((s) => s.a === c.id || s.b === c.id)), reward: 9 },
    ];
    club.fans.demands = rng.shuffle(pool).slice(0, 2).map((d) => Object.assign({}, d, { done: false }));
    club.fans.homeLosses = 0;
    club.fans.beatenRivals = [];
    return club.fans.demands;
  }

  function checkDemands(game, club) {
    const results = club.fans.demands.map((d) => {
      const src = d.check;
      const ok = typeof src === 'function' ? src(game, club) : false;
      d.done = ok;
      shift(game, club, ok ? d.reward : -d.reward * 0.8, ok ? 'ожидание выполнено' : 'ожидание не выполнено');
      return { text: d.text, done: ok };
    });
    return results;
  }

  /* ---------- недельный дрейф ---------- */
  function weekly(game, club) {
    const f = club.fans;
    // раз в месяц трибуны пересматривают, кто у них любимец
    if (game.week % 4 === 0) pickFavorite(game, club);
    const target = baseline(club);
    f.mood = U.clamp(f.mood + (target - f.mood) * 0.07, 3, 100);
    f.loyalty = U.clamp(f.loyalty + (f.mood - f.loyalty) * 0.02, 5, 97);
    // цена билета: дороже ожидаемого — трибуны ворчат
    const expected = 300 + club.reputation * 12;
    const ratio = club.ticketPrice / expected;
    if (ratio > 1.15) f.mood = U.clamp(f.mood - (ratio - 1.15) * 1.6, 3, 100);
    else if (ratio < 0.85) f.mood = U.clamp(f.mood + 0.25, 3, 100);
    // трибуны читают прессу: разгромная колонка портит фон, доброжелательная — держит
    if (S.Press && club.isPlayer) f.mood = U.clamp(f.mood + S.Press.mood(game, club.id) * 0.6, 3, 100);
  }

  /* ---------- события клуба ---------- */
  function onTransferIn(game, club, player) {
    const q = U.clamp((P.overall(player) - S.World.clubPower(game, club)) / 3, -2, 7);
    shift(game, club, 2 + q, 'подписан ' + P.fullName(player));
  }
  function onTransferOut(game, club, player) {
    const fav = club.fans.favoriteId === player.id;
    shift(game, club, fav ? -13 : -1.5, fav ? 'продан любимец трибун' : 'продан игрок');
    if (fav) {
      club.fans.favoriteId = null;
      if (club.isPlayer) {
        game.inbox.unshift({ week: game.week, kind: 'fans', text: 'Сектор Б вывесил баннер: «' + P.fullName(player).toUpperCase() + ', ТЫ БЫЛ НАШИМ». Настроение трибун упало.' });
      }
    }
  }
  function onTrophy(game, club) { shift(game, club, 18, 'трофей'); unlock(game, club, 'trophy'); club.fans.loyalty = U.clamp(club.fans.loyalty + 6, 5, 97); }
  function onPromotion(game, club) { shift(game, club, 14, 'повышение'); club.fans.loyalty = U.clamp(club.fans.loyalty + 4, 5, 97); }
  function onRelegation(game, club) { shift(game, club, -19, 'вылет'); club.fans.loyalty = U.clamp(club.fans.loyalty - 3, 5, 97); }
  function onArena(game, club, name) { shift(game, club, 4, 'сдан объект: ' + name); }

  function moodLabel(mood) {
    if (mood >= 82) return 'праздник на трибунах';
    if (mood >= 66) return 'заряженный зал';
    if (mood >= 50) return 'ровная поддержка';
    if (mood >= 34) return 'терпение кончается';
    if (mood >= 18) return 'свист с трибун';
    return 'бойкот';
  }

  S.Fans = {
    makeFans, baseline, shift, support, homeBonus, afterMatch, weekly,
    CHANTS, unlock, chantFor, pickFavorite, sellSeasonTickets,
    makeDemands, checkDemands, moodLabel,
    onTransferIn, onTransferOut, onTrophy, onPromotion, onRelegation, onArena,
  };
})(typeof window !== 'undefined' ? window : globalThis);
