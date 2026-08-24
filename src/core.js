/* Сетка — ядро: ГПСЧ, утилиты, справочники имён и городов. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});

  /* ---------- ГПСЧ (детерминированный, сохраняется вместе с партией) ---------- */
  class RNG {
    constructor(seed) { this.seed = seed >>> 0; this.a = this.seed; }
    next() {
      this.a = (this.a + 0x6D2B79F5) | 0;
      let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    /** случайное целое [min, max] */
    int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
    /** случайное вещественное [min, max) */
    range(min, max) { return min + this.next() * (max - min); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    /** нормальное распределение (Бокс — Мюллер), обрезанное по ±3σ */
    normal(mean, sd) {
      let u = 0, v = 0;
      while (u === 0) u = this.next();
      while (v === 0) v = this.next();
      let n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      n = Math.max(-3, Math.min(3, n));
      return mean + n * sd;
    }
    /** взвешенный выбор: items — массив, weight — функция веса */
    weighted(items, weight) {
      let total = 0;
      const w = items.map((it) => { const x = Math.max(0, weight(it)); total += x; return x; });
      if (total <= 0) return this.pick(items);
      let r = this.next() * total;
      for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
      return items[items.length - 1];
    }
    save() { return { seed: this.seed, a: this.a }; }
    static load(st) {
      const r = new RNG(st.seed || 1);
      if (st.a != null) r.a = st.a | 0;
      return r;
    }
  }

  /* ---------- утилиты ---------- */
  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    sum: (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0),
    avg: (arr, f) => (arr.length ? U.sum(arr, f) / arr.length : 0),
    /** деньги: 1 250 000 -> «1,25 млн ₽» */
    money(v) {
      const sign = v < 0 ? '−' : '';
      const a = Math.abs(Math.round(v));
      if (a >= 1e9) return sign + (a / 1e9).toFixed(2).replace('.', ',') + ' млрд ₽';
      if (a >= 1e6) return sign + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace('.', ',') + ' млн ₽';
      if (a >= 1e3) return sign + Math.round(a / 1e3) + ' тыс ₽';
      return sign + a + ' ₽';
    },
    num(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); },
    /** склонение: plural(3, ['матч','матча','матчей']) */
    plural(n, forms) {
      const a = Math.abs(n) % 100, b = a % 10;
      if (a > 10 && a < 20) return forms[2];
      if (b > 1 && b < 5) return forms[1];
      if (b === 1) return forms[0];
      return forms[2];
    },
    dateLabel(day) { // день сезона -> «12 ноября»
      const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
      const start = new Date(Date.UTC(2025, 8, 20)); // сезон стартует 20 сентября
      const d = new Date(start.getTime() + day * 86400000);
      return d.getUTCDate() + ' ' + months[d.getUTCMonth()];
    },
    id() { return (idSeq++).toString(36); },
  };
  let idSeq = 1;
  U.resetIds = (n) => { idSeq = n || 1; };
  U.peekIds = () => idSeq;

  /* ---------- амплуа ---------- */
  const ROLES = {
    S:  { key: 'S',  short: 'СВ', name: 'Связующий',   full: 'связующий',   need: 1 },
    OP: { key: 'OP', short: 'ДИ', name: 'Диагональный', full: 'диагональный', need: 1 },
    OH: { key: 'OH', short: 'ДГ', name: 'Доигровщик',  full: 'доигровщик',  need: 2 },
    MB: { key: 'MB', short: 'ЦБ', name: 'Центральный', full: 'центральный', need: 2 },
    L:  { key: 'L',  short: 'ЛБ', name: 'Либеро',      full: 'либеро',      need: 1 },
  };
  const ROLE_ORDER = ['S', 'OP', 'OH', 'MB', 'L'];

  /** веса навыков для расчёта общего рейтинга по амплуа */
  const ROLE_WEIGHTS = {
    S:  { set: .40, serve: .18, block: .14, defense: .14, receive: .06, attack: .08 },
    OP: { attack: .46, serve: .20, block: .16, defense: .10, set: .02, receive: .06 },
    OH: { attack: .30, receive: .24, serve: .14, defense: .16, block: .12, set: .04 },
    MB: { block: .40, attack: .26, serve: .14, defense: .12, set: .04, receive: .04 },
    L:  { receive: .46, defense: .42, set: .08, attack: .0, serve: .0, block: .04 },
  };

  /* ---------- имена ---------- */
  const NAMES = {
    ru: {
      first: ['Артём','Иван','Дмитрий','Максим','Егор','Никита','Роман','Павел','Кирилл','Данил','Сергей','Илья','Антон','Виктор','Юрий','Тимур','Глеб','Матвей','Фёдор','Лев','Арсений','Игорь','Олег','Руслан','Марк','Степан','Владислав','Денис','Александр','Михаил'],
      last: ['Ковалёв','Морозов','Лебедев','Соколов','Зайцев','Гущин','Ершов','Панин','Ремизов','Тарасов','Юдин','Баранов','Шилов','Крылов','Дьяков','Носов','Голубев','Сазонов','Верещагин','Кабанов','Мельник','Титов','Устинов','Рогов','Плотников','Хромов','Щербак','Афанасьев','Лапин','Бердников','Сотников','Кулагин','Ширяев','Мосин','Демидов','Ветров','Оленин','Пахомов','Рябов','Стрельцов'],
    },
    it: { first: ['Лука','Маттиа','Симоне','Алессандро','Джанлука','Риккардо','Даниэле','Федерико','Томмазо','Энрико'], last: ['Ферраро','Мазини','Бенедетти','Скарпа','Ровелли','Кальдара','Дзанетти','Мориконе','Тревизан','Полидори'] },
    pl: { first: ['Бартош','Камиль','Якуб','Матеуш','Павел','Гжегож','Томаш','Марцин','Кацпер','Шимон'], last: ['Возняк','Ковальчик','Заремба','Мазурек','Пшибыл','Ставяж','Круликовский','Голембевский','Ясинский','Дудек'] },
    rs: { first: ['Никола','Марко','Урош','Милош','Стефан','Лазар','Огнен','Драган'], last: ['Йованович','Радич','Стоянов','Милошевич','Вукович','Тодоров','Ковачевич','Пантич'] },
    br: { first: ['Лукас','Рафаэл','Тьяго','Бруно','Матеус','Густаво','Фелипе','Кайо'], last: ['Соуза','Оливейра','Таварес','Морайс','Баррето','Кардозу','Насименту','Пиньейру'] },
    cu: { first: ['Осниэль','Хавьер','Йоандри','Роберто','Мигель','Адриан'], last: ['Эрнандес','Гутьеррес','Мендес','Кастильо','Ривера','Домингес'] },
    fr: { first: ['Тьерри','Батист','Кевин','Реми','Жюльен','Антуан'], last: ['Дюпон','Лефевр','Морель','Барре','Ренар','Гарнье'] },
    ar: { first: ['Факундо','Николас','Агустин','Мартин','Хоакин'], last: ['Гомес','Ромеро','Акоста','Морено','Сильва'] },
  };
  const FOREIGN_LANGS = ['it', 'pl', 'rs', 'br', 'cu', 'fr', 'ar'];
  const LANG_FLAG = { it: 'ITA', pl: 'POL', rs: 'SRB', br: 'BRA', cu: 'CUB', fr: 'FRA', ar: 'ARG', ru: 'RUS' };

  S.RNG = RNG;
  S.U = U;
  S.ROLES = ROLES;
  S.ROLE_ORDER = ROLE_ORDER;
  S.ROLE_WEIGHTS = ROLE_WEIGHTS;
  S.NAMES = NAMES;
  S.FOREIGN_LANGS = FOREIGN_LANGS;
  S.LANG_FLAG = LANG_FLAG;
})(typeof window !== 'undefined' ? window : globalThis);
