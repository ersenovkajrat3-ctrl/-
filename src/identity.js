/* Сетка — клубная идентичность: пара цветов, рисунок формы и эмблема.
   Один и тот же набор используется везде — майки фигурок на площадке, шарфы трибун,
   гербы в таблице и ленте, церемонии. Данные чистые, без DOM: их считает и мир, и тесты. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U } = S;

  /* Палитра подобрана так, чтобы форма читалась на синей площадке и в тёмном интерфейсе:
     ни одного «сине-синего» комплекта, у каждого — контрастная вторая краска. */
  const PALETTE = [
    { name: 'огонь',    primary: '#ff7a1a', trim: '#1b2233' },
    { name: 'изумруд',  primary: '#12a05a', trim: '#eafff4' },
    { name: 'лимон',    primary: '#f2d13c', trim: '#20242e' },
    { name: 'бирюза',   primary: '#22c7b8', trim: '#0d2b33' },
    { name: 'снег',     primary: '#e8eef7', trim: '#c0392b' },
    { name: 'коралл',   primary: '#ff5c72', trim: '#2b1a24' },
    { name: 'сталь',    primary: '#7f8c9b', trim: '#101722' },
    { name: 'лайм',     primary: '#a3e635', trim: '#1f2a10' },
    { name: 'аметист',  primary: '#c084fc', trim: '#2a1740' },
    { name: 'антрацит', primary: '#111827', trim: '#f2d13c' },
    { name: 'роза',     primary: '#fca5a5', trim: '#7f1d1d' },
  ];

  const PATTERNS = ['solid', 'stripes', 'sash', 'hoop', 'split'];
  const CRESTS = ['shield', 'circle', 'diamond', 'hex'];

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  /** монограмма: одна-две буквы из названия клуба */
  function monogram(name) {
    const clean = (name || '?').replace(/[«»"']/g, '').trim();
    const words = clean.split(/[\s-]+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }

  /** identity клуба считается один раз и живёт в сохранении */
  function build(club, pal, pattern, crest) {
    return {
      palette: pal.name,
      primary: pal.primary,
      secondary: pal.trim,
      ink: inkOn(pal.primary),
      pattern,
      crest,
      monogram: monogram(club.baseName),
    };
  }

  function make(club) {
    const h = hash(club.baseName + '|' + club.city);
    return build(club, PALETTE[h % PALETTE.length],
      PATTERNS[(h >>> 5) % PATTERNS.length], CRESTS[(h >>> 9) % CRESTS.length]);
  }

  /**
   * Раздать формы по дивизиону так, чтобы в одной лиге не было двух одинаковых комплектов:
   * цвета идут по кругу из перемешанной палитры, а повторяющийся цвет получает другой рисунок.
   */
  function assign(rng, clubs) {
    const byDivision = {};
    clubs.forEach((c) => { (byDivision[c.division] = byDivision[c.division] || []).push(c); });
    Object.values(byDivision).forEach((list) => {
      const colors = rng.shuffle(PALETTE);
      const usedPattern = {};
      list.forEach((club, i) => {
        const pal = colors[i % colors.length];
        const taken = usedPattern[pal.primary] || [];
        const free = PATTERNS.filter((x) => taken.indexOf(x) < 0);
        const pattern = free.length ? rng.pick(free) : rng.pick(PATTERNS);
        usedPattern[pal.primary] = taken.concat([pattern]);
        club.identity = build(club, pal, pattern, rng.pick(CRESTS));
      });
    });
    return clubs;
  }

  function of(club) {
    if (!club.identity) club.identity = make(club);
    return club.identity;
  }

  /* ---------- различимость соперников ---------- */
  function rgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function luminance(hex) {
    const [r, g, b] = rgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  /** насколько два цвета похожи: 0 — одинаковые, 1 — совсем разные */
  function distance(a, b) {
    const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / 441.7;
  }

  /**
   * Комплект на матч: если формы соперников похожи, гости переодеваются в запасную.
   * Возвращает {shirt, trim, ink, pattern} для каждой стороны.
   */
  function matchKits(homeClub, awayClub) {
    const home = of(homeClub);
    const away = awayClub && awayClub.identity ? awayClub.identity : (awayClub ? of(awayClub) : null);
    const homeKit = { shirt: home.primary, trim: home.secondary, ink: home.ink, pattern: home.pattern, alt: false };
    if (!away) {
      return { home: homeKit, away: { shirt: '#e8eef7', trim: '#39424f', ink: '#1b2233', pattern: 'solid', alt: true } };
    }
    let awayKit = { shirt: away.primary, trim: away.secondary, ink: away.ink, pattern: away.pattern, alt: false };
    if (distance(homeKit.shirt, awayKit.shirt) < 0.30) {
      // запасной комплект: меняем краски местами
      awayKit = { shirt: away.secondary, trim: away.primary, ink: away.ink, pattern: away.pattern, alt: true };
      if (distance(homeKit.shirt, awayKit.shirt) < 0.30) {
        awayKit = { shirt: '#f4f7ff', trim: '#1b2233', ink: '#1b2233', pattern: 'solid', alt: true };
      }
    }
    return { home: homeKit, away: awayKit };
  }

  /** цвет текста, который читается на этом фоне */
  function inkOn(bg) {
    return contrast(bg, '#0b1120') >= contrast(bg, '#ffffff') ? '#0b1120' : '#ffffff';
  }

  S.Identity = { PALETTE, PATTERNS, CRESTS, make, build, assign, of, matchKits, monogram, contrast, distance, luminance, inkOn, hash };
})(typeof window !== 'undefined' ? window : globalThis);
