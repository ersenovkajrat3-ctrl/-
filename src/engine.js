/* Сетка — движок матча.
   Розыгрыш считается как цепочка фаз: подача пробивает приём, качество приёма задаёт
   пас связующего, атака пробивает блок и защиту, защита переводит мяч в контратаку.
   Ротация настоящая: кто сейчас у сетки, а кто сзади, решает, чьи рейтинги участвуют. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U } = S;
  const P = S.Players;

  const ZONE_BY_OFFSET = [1, 6, 5, 4, 3, 2]; // order[rot+i] стоит в зоне ZONE_BY_OFFSET[i]
  const FRONT_ZONES = [4, 3, 2];

  const TACTICS = {
    serve:   [{ id: 'safe', name: 'Надёжная', risk: 0.68 }, { id: 'normal', name: 'Обычная', risk: 1.0 }, { id: 'risk', name: 'Силовая', risk: 1.42 }],
    block:   [{ id: 'read', name: 'Читающий', name2: 'ловит доигровщиков' }, { id: 'commit', name: 'Ловля центра', name2: 'закрывает первый темп' }],
    tempo:   [{ id: 'balance', name: 'Баланс' }, { id: 'opposite', name: 'Через диагонального' }, { id: 'middle', name: 'Через центр' }],
    receive: [{ id: 'three', name: 'Приём втроём' }, { id: 'two', name: 'Приём вдвоём' }],
  };
  const DEFAULT_TACTICS = { serve: 'normal', block: 'read', tempo: 'balance', receive: 'three' };

  /* ---------- вспомогательное ---------- */
  function tacticRisk(t) { return (TACTICS.serve.find((x) => x.id === t) || TACTICS.serve[1]).risk; }

  /** сторона матча: состав, ротация, либеро, тайм-ауты */
  class Side {
    constructor(club, lineup, libero, tactics, opts = {}) {
      this.club = club;
      this.name = club.name;
      this.order = lineup.slice(0, 6);   // порядок ротации, order[0] начинает подавать
      this.libero = libero || null;
      this.bench = opts.bench || [];
      this.tactics = Object.assign({}, DEFAULT_TACTICS, tactics || {});
      this.rot = 0;
      this.sets = 0;
      this.points = 0;
      this.timeouts = 2;
      this.challenges = 2;
      this.subsLeft = 6;
      this.streak = 0;
      this.momentum = 0;
      this.homeBonus = 0;
      this.aiSkill = opts.aiSkill || 0.5;
      this.stats = P.emptyStats();
      this.setScores = [];
      this.human = !!opts.human;
    }
    rotate() { this.rot = (this.rot + 1) % 6; }
    /** игрок на позиции смещения i от подающего (0 = зона 1) */
    at(i) { return this.order[(this.rot + i) % 6]; }
    zoneOf(player) {
      for (let i = 0; i < 6; i++) if (this.at(i) === player) return ZONE_BY_OFFSET[i];
      return 0;
    }
    /** шестёрка на площадке с учётом замены либеро (центральный сзади уходит, кроме зоны подачи) */
    onCourt() {
      const res = [];
      for (let i = 0; i < 6; i++) {
        const zone = ZONE_BY_OFFSET[i];
        let p = this.at(i);
        if (this.libero && p.role === 'MB' && !FRONT_ZONES.includes(zone) && zone !== 1) p = this.libero;
        res.push({ player: p, zone, front: FRONT_ZONES.includes(zone), offset: i });
      }
      return res;
    }
    server() { return this.at(0); }
    front() { return this.onCourt().filter((s) => s.front).map((s) => s.player); }
    back() { return this.onCourt().filter((s) => !s.front).map((s) => s.player); }
    setter() {
      const s = this.onCourt().find((x) => x.player.role === 'S');
      return s ? s.player : this.onCourt()[3].player;
    }
  }

  /* ---------- расчёт розыгрыша ---------- */
  function receiveValue(side) {
    // принимают либеро и доигровщики задней линии; при «приёме вдвоём» нагрузка выше, но зона чище
    const back = side.back();
    const receivers = back.filter((p) => p.role === 'L' || p.role === 'OH');
    const pool = receivers.length ? receivers : back;
    const two = side.tactics.receive === 'two';
    const vals = pool.map((p) => P.eff(p, 'receive')).sort((a, b) => b - a);
    const use = two ? vals.slice(0, 2) : vals;
    return { value: U.avg(use) + (two ? 2.2 : 0), pool };
  }

  function blockValue(side, tempo) {
    const front = side.front();
    const vals = front.map((p) => P.eff(p, 'block')).sort((a, b) => b - a);
    let v = vals[0] * 0.58 + (vals[1] || 40) * 0.30 + (vals[2] || 40) * 0.12;
    if (side.tactics.block === 'commit') v += tempo === 'middle' ? 6.5 : -3.5;
    return { value: v, front };
  }

  function defenseValue(side) {
    const back = side.back();
    const vals = back.map((p) => P.eff(p, 'defense') * (p.role === 'L' ? 1.12 : 1));
    return { value: U.avg(vals), pool: back };
  }

  function pickAttacker(rng, side, setQ) {
    const court = side.onCourt();
    const tempo = side.tactics.tempo;
    const opts = [];
    for (const slot of court) {
      const p = slot.player;
      if (p.role === 'L') continue;
      if (slot.front) {
        let w = P.eff(p, 'attack');
        // доля мячей по амплуа примерно как в реальном волейболе: край > диагональ > центр
        if (p.role === 'MB') w *= 0.38 + setQ * 0.72;                 // первый темп требует чистого приёма
        if (p.role === 'OH') w *= 1.05;
        if (p.role === 'OP') w *= 1.25;
        if (p.role === 'S') w *= 0.08;
        if (tempo === 'opposite' && p.role === 'OP') w *= 1.55;
        if (tempo === 'middle' && p.role === 'MB') w *= 1.9;
        opts.push({ p, w, back: false, quick: p.role === 'MB' });
      } else if (p.role === 'OP' && setQ > 0.55) {
        opts.push({ p, w: P.eff(p, 'attack') * 0.5, back: true, quick: false }); // атака с задней линии
      }
    }
    if (!opts.length) return { p: court[0].player, back: false, quick: false };
    return rng.weighted(opts, (o) => Math.pow(Math.max(1, o.w), 2.2));
  }

  /**
   * Один розыгрыш. Возвращает событие с полным разбором фаз.
   */
  function rally(rng, atkStart, defStart, ctx) {
    const ev = { phases: [], winner: null, reason: '', server: null, attacker: null, blocker: null, digger: null, receiver: null, rallyLength: 0 };
    const srv = atkStart, rcv = defStart;
    const server = srv.server();
    ev.server = server;
    const risk = tacticRisk(srv.tactics.serve);
    const serveSkill = P.eff(server, 'serve') * (1 + 0.05 * (risk - 1)) + srv.homeBonus;
    const rec = receiveValue(rcv);
    const recSkill = rec.value + rcv.homeBonus;
    const d = (serveSkill - recSkill) / 100;

    srv.stats.attacks += 0; // подача считается отдельно
    server.st.serves = (server.st.serves || 0) + 1;

    const pErr = U.clamp(0.085 * risk + 0.035 * risk * (serveSkill / 100) - 0.02, 0.02, 0.30);
    const pAce = U.clamp((0.042 + 0.17 * d) * risk, 0.004, 0.26);
    const roll = rng.next();
    if (roll < pErr) {
      ev.winner = rcv; ev.reason = 'serve_error';
      server.st.serveErrors++; srv.stats.serveErrors++;
      ev.phases.push({ type: 'serve', result: 'error', player: server });
      return ev;
    }
    const target = rng.weighted(rec.pool, (p) => 100 - P.eff(p, 'receive') + 20);
    ev.receiver = target;
    target.st.receptions++; rcv.stats.receptions++;
    if (roll < pErr + pAce) {
      ev.winner = srv; ev.reason = 'ace';
      server.st.aces++; server.st.points++; srv.stats.aces++; srv.stats.points++;
      target.st.recErrors++; rcv.stats.recErrors++;
      ev.phases.push({ type: 'serve', result: 'ace', player: server, target });
      return ev;
    }
    // качество приёма
    let q = U.clamp(0.56 + (P.eff(target, 'receive') - serveSkill) / 150 - 0.10 * (risk - 1) + rng.normal(0, 0.15), 0.05, 1);
    if (q > 0.68) { target.st.recPerfect++; rcv.stats.recPerfect++; }
    ev.phases.push({ type: 'serve', result: 'in', player: server, target, quality: q });

    // розыгрыш: атакует принимающая команда, дальше — контратаки по очереди
    let attacking = rcv, defending = srv, quality = q, exchange = 0;
    while (true) {
      exchange++;
      ev.rallyLength = exchange;
      const setter = attacking.setter();
      const setQ = U.clamp(0.30 + 0.52 * quality + (P.eff(setter, 'set') - 62) / 210 + rng.normal(0, 0.09), 0.05, 1);
      const pick = pickAttacker(rng, attacking, setQ);
      const attacker = pick.p;
      const blk = blockValue(defending, attacking.tactics.tempo);
      const def = defenseValue(defending);
      let power = P.eff(attacker, 'attack') * (0.80 + 0.34 * setQ);
      if (pick.quick) power += 5.5;
      if (pick.back) power -= 6.5;
      power += attacking.homeBonus * 0.6;
      power += attacking.momentum * 6;

      const pBlock = U.clamp(0.058 + (blk.value - power) / 400 + (pick.quick ? -0.015 : 0.01), 0.015, 0.28);
      const pAtkErr = U.clamp(0.088 - 0.075 * (setQ - 0.5) - (P.eff(attacker, 'attack') - 60) / 900 + (exchange > 1 ? 0.02 : 0), 0.025, 0.26);
      let pKill = U.clamp(0.500 + (power - blk.value * 0.52 - def.value * 0.40) / 168 + 0.20 * (setQ - 0.5), 0.10, 0.82);
      pKill *= 1 - pBlock - pAtkErr;

      attacker.st.attacks++; attacking.stats.attacks++;
      const r = rng.next();
      ev.phases.push({ type: 'attack', player: attacker, setter, setQuality: setQ, back: pick.back, quick: pick.quick, exchange });
      if (r < pKill) {
        ev.winner = attacking; ev.reason = 'kill'; ev.attacker = attacker;
        attacker.st.kills++; attacker.st.points++; attacking.stats.kills++; attacking.stats.points++;
        setter.st.assists = (setter.st.assists || 0) + 1;
        return ev;
      }
      if (r < pKill + pBlock) {
        const blocker = rng.weighted(blk.front, (p) => Math.pow(P.eff(p, 'block'), 2.4));
        ev.winner = defending; ev.reason = 'block'; ev.attacker = attacker; ev.blocker = blocker;
        blocker.st.blocks++; blocker.st.points++; defending.stats.blocks++; defending.stats.points++;
        ev.phases.push({ type: 'block', player: blocker, on: attacker });
        return ev;
      }
      if (r < pKill + pBlock + pAtkErr) {
        ev.winner = defending; ev.reason = 'attack_error'; ev.attacker = attacker;
        attacker.st.attackErrors++; attacking.stats.attackErrors++; defending.stats.points++;
        return ev;
      }
      // мяч поднят в защите — контратака
      const digger = rng.weighted(def.pool.concat(blk.front), (p) => Math.pow(P.eff(p, 'defense'), 2) * (p.role === 'L' ? 1.6 : 1));
      digger.st.digs++; defending.stats.digs++;
      ev.digger = digger;
      ev.phases.push({ type: 'dig', player: digger });
      quality = U.clamp(0.30 + (P.eff(digger, 'defense') - 55) / 190 + rng.normal(0, 0.14), 0.05, 0.85);
      const tmp = attacking; attacking = defending; defending = tmp;
      if (exchange >= 9) { // затяжной розыгрыш обрывается ошибкой
        ev.winner = defending; ev.reason = 'long_rally'; defending.stats.points++;
        return ev;
      }
    }
  }

  /* ---------- усталость и мораль ---------- */
  function applyFatigue(side, setsPlayed, baseFacility) {
    for (const p of side.order.concat(side.libero ? [side.libero] : [])) {
      const rate = (1.25 - p.stamina / 100) * 3.2 * (1 - baseFacility * 0.12);
      p.fatigue = U.clamp(p.fatigue + rate, 0, 100);
    }
  }

  /* ---------- ИИ тайм-аута ---------- */
  function maybeTimeout(side, opponentStreak) {
    if (side.timeouts <= 0) return false;
    if (opponentStreak >= 4 && Math.random() < 0.55) { side.timeouts--; return true; }
    return false;
  }

  /* ---------- пошаговый матч ---------- */
  /**
   * Матч живёт по шагам: один вызов step() — один розыгрыш. Благодаря этому тайм-аут,
   * замена и видеопросмотр, вызванные игроком по ходу встречи, влияют на следующие розыгрыши,
   * а не остаются декорацией поверх заранее просчитанного результата.
   */
  class Match {
    constructor(rng, home, away, opts = {}) {
      this.rng = rng;
      this.home = home;
      this.away = away;
      this.opts = opts;
      const homeAdv = opts.homeBonus != null ? opts.homeBonus : 1.6;
      // «форма на день»: без неё разница в классе слишком жёстко предопределяет результат
      home.dayForm = rng.normal(0, 3.4);
      away.dayForm = rng.normal(0, 3.4);
      home.homeBonus = homeAdv + home.dayForm;
      away.homeBonus = away.dayForm;
      home.sets = 0; away.sets = 0;
      home.setScores = []; away.setScores = [];
      this.setNo = 0;
      this.finished = false;
      this.serving = rng.chance(0.5) ? home : away;
      this.firstServe = this.serving;
      this.log = {
        sets: [], home, away, winner: null, loser: null, score: [0, 0], setScores: [], mvp: null,
        lineups: { home: lineupIds(home), away: lineupIds(away) },
      };
      this.startSet();
    }
    startSet() {
      this.setNo++;
      this.target = this.setNo === 5 ? 15 : 25;
      this.home.points = 0; this.away.points = 0;
      [this.home, this.away].forEach((s) => {
        s.timeouts = 2; s.challenges = 2; s.subsLeft = 6; s.streak = 0; s.momentum = 0; s.timeoutBoost = 0;
      });
      this.setLog = { no: this.setNo, rallies: [], home: 0, away: 0 };
      this.log.sets.push(this.setLog);
    }
    /** один розыгрыш */
    step() {
      if (this.finished) return null;
      const { home, away } = this;
      const receiving = this.serving === home ? away : home;
      const ev = rally(this.rng, this.serving, receiving, this.opts);
      const winner = ev.winner;
      const loser = winner === home ? away : home;
      this.lastEvent = ev;
      this.lastWinner = winner;
      winner.points++;
      winner.streak++; loser.streak = 0;
      winner.momentum = U.clamp(Math.min(winner.streak, 6) * 0.012 + (winner.timeoutBoost > 0 ? 0.02 : 0), 0, 0.10);
      loser.momentum = 0;
      [home, away].forEach((s) => { if (s.timeoutBoost > 0) s.timeoutBoost--; });
      if (winner !== this.serving) { winner.rotate(); this.serving = winner; }
      const record = {
        h: home.points, a: away.points, winner: winner === home ? 'h' : 'a',
        reason: ev.reason, server: ev.server && ev.server.id, attacker: ev.attacker && ev.attacker.id,
        blocker: ev.blocker && ev.blocker.id, receiver: ev.receiver && ev.receiver.id,
        digger: ev.digger && ev.digger.id, length: ev.rallyLength,
        rotH: home.rot, rotA: away.rot, set: this.setNo,
      };
      this.setLog.rallies.push(record);
      this.lastRecord = record;
      // ИИ соперника берёт тайм-аут, если поплыл
      const ai = home.human ? away : home;
      const aiOpp = ai === home ? away : home;
      if (aiOpp.streak >= 4 && ai.timeouts > 0 && this.rng.chance(0.5)) this.timeout(ai);
      const done = (home.points >= this.target || away.points >= this.target) && Math.abs(home.points - away.points) >= 2;
      let setEnded = false, matchEnded = false;
      if (done) {
        setEnded = true;
        const hWon = home.points > away.points;
        (hWon ? home : away).sets++;
        this.setLog.home = home.points; this.setLog.away = away.points;
        this.log.setScores.push([home.points, away.points]);
        home.setScores.push(home.points); away.setScores.push(away.points);
        applyFatigue(home, this.setNo, this.opts.trainingLevel || 0);
        applyFatigue(away, this.setNo, this.opts.awayTrainingLevel || 0);
        onCourtPlayers(home).forEach((p) => p.st.sets++);
        onCourtPlayers(away).forEach((p) => p.st.sets++);
        if (home.sets === 3 || away.sets === 3) { matchEnded = true; this.finish(); }
        else this.startSet();
      }
      return { record, ev, setEnded, matchEnded };
    }
    /** тайм-аут: сбивает импульс соперника и даёт короткий бонус своим */
    timeout(side) {
      if (side.timeouts <= 0) return false;
      side.timeouts--;
      const opp = side === this.home ? this.away : this.home;
      opp.momentum = 0; opp.streak = 0;
      side.timeoutBoost = 2;
      return true;
    }
    /** видеопросмотр спорного момента — как в реальном волейболе, число вызовов ограничено */
    challenge(side) {
      if (side.challenges <= 0 || !this.lastRecord) return { ok: false, reason: 'Просмотры закончились.' };
      if (this.lastWinner === side) return { ok: false, reason: 'Последнее очко и так ваше.' };
      side.challenges--;
      const rec = this.lastRecord;
      // спорными бывают касание на блоке, аут и заступ — примерно четверть просмотров успешна
      const success = this.rng.chance(0.27);
      if (!success) return { ok: true, overturned: false };
      const loser = this.lastWinner;
      loser.points--;
      side.points++;
      if (this.serving !== side) { side.rotate(); this.serving = side; }
      rec.h = this.home.points; rec.a = this.away.points; rec.overturned = true;
      return { ok: true, overturned: true };
    }
    /** замена: игрок со скамейки выходит вместо игрока в расстановке */
    substitute(side, outId, inId) {
      if (side.subsLeft <= 0) return { ok: false, reason: 'Лимит замен в сете исчерпан.' };
      const idx = side.order.findIndex((p) => p.id === outId);
      const inPlayer = side.bench.find((p) => p.id === inId);
      if (idx < 0 || !inPlayer) return { ok: false, reason: 'Некого менять.' };
      if (inPlayer.role === 'L') return { ok: false, reason: 'Либеро выходит вне лимита замен и не может подавать.' };
      const outPlayer = side.order[idx];
      side.order[idx] = inPlayer;
      side.bench = side.bench.filter((p) => p.id !== inId).concat([outPlayer]);
      side.subsLeft--;
      if (!inPlayer.st) inPlayer.st = P.emptyStats();
      return { ok: true, out: outPlayer, in: inPlayer };
    }
    finish() {
      this.finished = true;
      const { home, away, log } = this;
      log.score = [home.sets, away.sets];
      log.winner = home.sets > away.sets ? home : away;
      log.loser = log.winner === home ? away : home;
      const all = onCourtPlayers(home).concat(onCourtPlayers(away));
      log.mvp = all.slice().sort((a, b) => (b.st.points || 0) - (a.st.points || 0))[0];
    }
    /** досимулировать остаток матча без показа */
    runToEnd(limit = 4000) {
      let guard = 0;
      while (!this.finished && guard++ < limit) this.step();
      return this.log;
    }
    scoreboard() {
      return {
        sets: [this.home.sets, this.away.sets],
        points: [this.home.points, this.away.points],
        setNo: this.setNo, target: this.target,
        setScores: this.log.setScores.slice(),
        serving: this.serving === this.home ? 'h' : 'a',
      };
    }
  }

  function onCourtPlayers(side) {
    return side.order.concat(side.libero ? [side.libero] : []);
  }
  function lineupIds(side) {
    return {
      order: side.order.map((p) => p.id),
      libero: side.libero ? side.libero.id : null,
      name: side.name,
    };
  }

  /** мгновенная симуляция — тот же движок, просто без показа */
  function playMatch(rng, home, away, opts = {}) {
    const m = new Match(rng, home, away, opts);
    return m.runToEnd();
  }

  S.Engine = { Side, Match, playMatch, rally, onCourtPlayers, TACTICS, DEFAULT_TACTICS, ZONE_BY_OFFSET, FRONT_ZONES, receiveValue, blockValue, defenseValue };
})(typeof window !== 'undefined' ? window : globalThis);
