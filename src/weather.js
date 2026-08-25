/* Сетка — погода вокруг дворца спорта.
   Сезон идёт с 20 сентября по начало июня, и на улице это должно быть видно: в октябре
   дождь и жёлтая листва, в январе сугробы и метель, в мае зелень и светлый вечер.
   Модуль считает погоду детерминированно по номеру недели и по самому матчу — при
   повторном открытии того же матча за окном будет то же самое. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U } = S;

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль',
    'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const SEASON_START = Date.UTC(2025, 8, 20);   // тот же старт, что и у U.dateLabel

  /** номер недели сезона -> месяц (0…11) */
  function monthOf(week) {
    return new Date(SEASON_START + week * 7 * 86400000).getUTCMonth();
  }

  /* Типы погоды. cover — снежный покров (0…1), leaves — опавшая листва (0…1),
     foliage — состояние деревьев, night — темно ли на улице к началу матча.
     drop — что сыплется с неба и насколько густо. */
  const KINDS = {
    clear:   { id: 'clear',   name: 'ясно',            drop: null,   wind: 0.2 },
    cloud:   { id: 'cloud',   name: 'облачно',         drop: null,   wind: 0.4 },
    rain:    { id: 'rain',    name: 'дождь',           drop: 'rain', density: 1,    wind: 0.5 },
    shower:  { id: 'shower',  name: 'ливень',          drop: 'rain', density: 1.7,  wind: 0.9 },
    sleet:   { id: 'sleet',   name: 'дождь со снегом', drop: 'sleet', density: 1.2, wind: 0.8 },
    snow:    { id: 'snow',    name: 'снег',            drop: 'snow', density: 1,    wind: 0.3 },
    blizzard:{ id: 'blizzard',name: 'метель',          drop: 'snow', density: 2,    wind: 1.4 },
    frost:   { id: 'frost',   name: 'мороз и ясно',    drop: null,   wind: 0.15 },
    thaw:    { id: 'thaw',    name: 'оттепель',        drop: 'rain', density: 0.6,  wind: 0.4 },
    bloom:   { id: 'bloom',   name: 'тепло и солнечно',drop: 'petal', density: 0.7, wind: 0.35 },
  };

  /* Климат по месяцам: температура, вероятности погоды, вид деревьев и земли.
     Ключи вероятностей — id из KINDS, сумма нормируется. */
  const CLIMATE = {
    8:  { temp: [8, 17],   foliage: 'green', cover: 0,    leaves: 0.15, night: false,
          mix: { clear: 3, cloud: 3, rain: 3, shower: 1 } },                       // сентябрь
    9:  { temp: [1, 10],   foliage: 'gold',  cover: 0,    leaves: 0.85, night: true,
          mix: { cloud: 3, rain: 4, shower: 2, clear: 1 } },                       // октябрь
    10: { temp: [-4, 4],   foliage: 'bare',  cover: 0.15, leaves: 0.55, night: true,
          mix: { cloud: 3, rain: 2, sleet: 4, snow: 2 } },                          // ноябрь
    11: { temp: [-14, -3], foliage: 'snowy', cover: 0.75, leaves: 0,    night: true,
          mix: { snow: 5, blizzard: 2, frost: 2, cloud: 2 } },                      // декабрь
    0:  { temp: [-22, -8], foliage: 'snowy', cover: 1,    leaves: 0,    night: true,
          mix: { snow: 4, blizzard: 3, frost: 3, cloud: 1 } },                      // январь
    1:  { temp: [-18, -5], foliage: 'snowy', cover: 0.95, leaves: 0,    night: true,
          mix: { snow: 4, blizzard: 3, frost: 2, cloud: 2 } },                      // февраль
    2:  { temp: [-6, 5],   foliage: 'bare',  cover: 0.45, leaves: 0,    night: true,
          mix: { thaw: 3, snow: 2, cloud: 3, clear: 2, sleet: 1 } },                // март
    3:  { temp: [3, 14],   foliage: 'fresh', cover: 0.05, leaves: 0,    night: false,
          mix: { clear: 3, cloud: 3, rain: 3, thaw: 1 } },                          // апрель
    4:  { temp: [11, 23],  foliage: 'green', cover: 0,    leaves: 0,    night: false,
          mix: { clear: 4, bloom: 3, cloud: 2, shower: 1 } },                       // май
    5:  { temp: [16, 27],  foliage: 'green', cover: 0,    leaves: 0,    night: false,
          mix: { clear: 5, bloom: 2, cloud: 2, shower: 1 } },                       // июнь
    6:  { temp: [18, 29],  foliage: 'green', cover: 0, leaves: 0, night: false, mix: { clear: 5, cloud: 2 } },
    7:  { temp: [16, 28],  foliage: 'green', cover: 0, leaves: 0.1, night: false, mix: { clear: 4, cloud: 2, shower: 1 } },
  };

  /* Палитры: небо (верх/низ), земля, стволы и кроны, вода на асфальте. */
  const PALETTE = {
    green: { ground: '#2c4a33', tree: '#498f53', trunk: '#4a3524' },
    gold:  { ground: '#3f4a2e', tree: '#c47a1e', trunk: '#4a3524' },
    bare:  { ground: '#3a3d43', tree: '#6b5540', trunk: '#4a3524' },
    snowy: { ground: '#d3dfee', tree: '#3f6b4c', trunk: '#3d2e21' },
    fresh: { ground: '#3b5236', tree: '#71b34a', trunk: '#4a3524' },
  };

  /* маленький генератор от строки: погода не должна зависеть от общего ГПСЧ партии,
     иначе она поедет от любого лишнего розыгрыша */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickKind(mix, r) {
    const keys = Object.keys(mix);
    const total = keys.reduce((s, k) => s + mix[k], 0);
    let x = r * total;
    for (const k of keys) { x -= mix[k]; if (x <= 0) return k; }
    return keys[keys.length - 1];
  }

  /** Погода на неделю и конкретный матч. key — что-нибудь стабильное: id матча. */
  function make(week, key) {
    const month = monthOf(week);
    const cl = CLIMATE[month] || CLIMATE[9];
    const rnd = seeded(hash(String(key || 'x') + ':' + week));
    const kind = KINDS[pickKind(cl.mix, rnd())] || KINDS.cloud;
    const temp = Math.round(cl.temp[0] + (cl.temp[1] - cl.temp[0]) * rnd());
    // ясный морозный вечер добавляет снега на земле, оттепель — съедает
    let cover = U.clamp(cl.cover + (kind.id === 'blizzard' ? 0.2 : kind.id === 'thaw' ? -0.25 : 0), 0, 1);
    if (temp > 3) cover = Math.min(cover, 0.15);
    const foliage = cover > 0.5 && cl.foliage !== 'green' ? 'snowy' : cl.foliage;
    const pal = PALETTE[foliage] || PALETTE.bare;
    return {
      month, monthName: MONTHS[month], kind: kind.id, kindName: kind.name,
      temp, cover, leaves: cl.leaves, foliage, night: cl.night,
      drop: kind.drop, density: kind.density || 0, wind: kind.wind,
      wet: kind.drop === 'rain' || kind.drop === 'sleet',
      palette: pal,
      label: (temp > 0 ? '+' : '') + temp + '°, ' + kind.name,
    };
  }

  /** Погода конкретного матча. Ничего не хранится: id матча и неделя дают один и тот же
      результат при каждом вызове, поэтому сохранение не пухнет от 700 объектов погоды. */
  function forFixture(game, fx) {
    if (!fx) return make(game.week, 'w' + game.week);
    return make(fx.week != null ? fx.week : game.week, fx.id || (fx.h + '' + fx.a + fx.week));
  }

  /** Влияние на посещаемость: в метель дойдут не все, тёплым майским вечером придут лишние. */
  function attendanceFactor(wx) {
    if (!wx) return 1;
    const byKind = {
      blizzard: 0.88, snow: 0.96, shower: 0.93, sleet: 0.94, rain: 0.97,
      frost: 0.93, thaw: 0.98, cloud: 1, clear: 1.03, bloom: 1.05,
    };
    let f = byKind[wx.kind] != null ? byKind[wx.kind] : 1;
    if (wx.temp <= -20) f -= 0.04;                 // за двадцать градусов мороза — уже подвиг
    return U.clamp(f, 0.82, 1.06);
  }

  /** Строка для комментатора и карточки матча. */
  function line(wx) {
    return wx.monthName + ' · ' + wx.label;
  }

  S.Weather = { make, forFixture, attendanceFactor, monthOf, line, MONTHS, KINDS, CLIMATE, PALETTE };
})(typeof window !== 'undefined' ? window : globalThis);
