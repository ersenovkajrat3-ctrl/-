/* Сетка — сохранение партии в localStorage. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const KEY = 'setka.save.v3';
  const SETTINGS_KEY = 'setka.settings.v1';

  function serialize(game) {
    const clone = {};
    for (const k in game) {
      if (k === '_rng' || k === 'euroSquadsCache') continue;
      clone[k] = game[k];
    }
    clone.rngState = game._rng.save();
    clone.idSeq = S.U.peekIds();
    // логи матчей не храним — они восстанавливаются симуляцией и весят много
    clone.fixtures = (game.fixtures || []).map((f) => {
      const c = Object.assign({}, f);
      delete c.log;
      return c;
    });
    clone.results = (game.results || []).slice(0, 150);
    clone.feed = (game.feed || []).slice(0, 60);
    clone.press = (game.press || []).slice(0, 40);
    // st — черновая статистика текущего матча, её незачем хранить
    const players = {};
    for (const id in game.players) {
      const p = game.players[id];
      const c = Object.assign({}, p);
      delete c.st;
      if (c.history && !c.history.length) delete c.history;
      players[id] = c;
    }
    clone.players = players;
    return clone;
  }

  function save(game) {
    if (typeof localStorage === 'undefined') return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(serialize(game)));
      return true;
    } catch (e) {
      console.warn('Не удалось сохранить партию:', e);
      return false;
    }
  }

  function hasSave() {
    try { return typeof localStorage !== 'undefined' && !!localStorage.getItem(KEY); } catch (e) { return false; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const game = JSON.parse(raw);
      game._rng = S.RNG.load(game.rngState || { seed: game.seed || 1 });
      Object.values(game.players).forEach((p) => { if (!p.st) p.st = S.Players.emptyStats(); if (!p.history) p.history = []; });
      S.U.resetIds(game.idSeq || 100000);
      return game;
    } catch (e) {
      console.warn('Сохранение повреждено:', e);
      return null;
    }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* приватный режим */ }
  }

  function saveSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* нет доступа */ }
  }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { return null; }
  }

  S.Save = { save, load, clear, hasSave, saveSettings, loadSettings, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
