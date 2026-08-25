/* Volleyball Manager — дворец спорта снаружи, в изометрии.
   Вид сверху нужен, чтобы читать расстановку, а этот кадр — чтобы видеть сам клуб:
   как растёт арена от вложений, какой в городе месяц и сколько людей идёт на матч.
   Всё рисуется вектором из клубных данных: ни одной картинки, ни одной библиотеки. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});
  const { U } = S;
  const NS = 'http://www.w3.org/2000/svg';

  const VB = { w: 340, h: 208 };
  const K = 2.85;                      // масштаб мировых единиц в пиксели
  const OX = 170, OY = 66;             // начало координат сцены на холсте

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  /** изометрия 2:1: мировые (x, y, z) -> экранные */
  function P(x, y, z) {
    return [OX + (x - y) * K, OY + (x + y) * 0.5 * K - (z || 0) * 0.86 * K];
  }
  const pts = (list) => list.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

  /* ---------- цвет ---------- */
  function hex(c) {
    const s = c.replace('#', '');
    const n = s.length === 3 ? s.split('').map((x) => x + x).join('') : s;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  function rgb(a) { return '#' + a.map((v) => Math.round(U.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) {
    const x = hex(a), y = hex(b);
    return rgb([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t));
  }
  const light = (c, t) => mix(c, '#ffffff', t);
  const dark = (c, t) => mix(c, '#000000', t);

  /* ---------- примитивы ---------- */
  /** коробка: верх светлее, правая грань средняя, левая тёмная — этого хватает для объёма */
  function box(gr, x, y, z, w, d, hgt, color, opts = {}) {
    const top = [P(x, y, z + hgt), P(x + w, y, z + hgt), P(x + w, y + d, z + hgt), P(x, y + d, z + hgt)];
    const right = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + hgt), P(x + w, y, z + hgt)];
    const left = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + hgt), P(x, y + d, z + hgt)];
    gr.appendChild(el('polygon', { points: pts(left), fill: dark(color, 0.34) }));
    gr.appendChild(el('polygon', { points: pts(right), fill: dark(color, 0.16) }));
    gr.appendChild(el('polygon', { points: pts(top), fill: opts.roof || light(color, 0.14) }));
    return { top, right, left };
  }

  /** плоская площадка на земле: асфальт, газон, разметка */
  function slab(gr, x, y, w, d, fill, opts = {}) {
    const p = el('polygon', {
      points: pts([P(x, y, 0), P(x + w, y, 0), P(x + w, y + d, 0), P(x, y + d, 0)]), fill,
    });
    if (opts.opacity) p.setAttribute('opacity', opts.opacity);
    gr.appendChild(p);
    return p;
  }

  /** дерево: ствол и крона по сезону */
  function tree(gr, x, y, scale, wx) {
    const pal = wx.palette;
    const hgt = 3.4 * scale;
    box(gr, x, y, 0, 0.5, 0.5, hgt, '#4a3524');
    const c = P(x + 0.25, y + 0.25, hgt);
    const r = 2.1 * scale * K;
    if (wx.foliage === 'bare') {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        gr.appendChild(el('line', {
          x1: c[0], y1: c[1], x2: c[0] + Math.cos(a) * r, y2: c[1] + Math.sin(a) * r * 0.9,
          stroke: pal.tree, 'stroke-width': 1.1, 'stroke-linecap': 'round',
        }));
      }
    } else {
      gr.appendChild(el('ellipse', { cx: c[0], cy: c[1] - r * 0.3, rx: r, ry: r * 0.85, fill: pal.tree }));
      gr.appendChild(el('ellipse', {
        cx: c[0] - r * 0.3, cy: c[1] - r * 0.6, rx: r * 0.5, ry: r * 0.42,
        fill: wx.foliage === 'snowy' ? '#ffffff' : wx.foliage === 'gold' ? '#eab543' : light(pal.tree, 0.25),
        opacity: wx.foliage === 'snowy' ? 0.9 : 0.75,
      }));
    }
  }

  /** жилой дом: этажи с окнами, вечером часть окон горит */
  function house(gr, x, y, w, d, floors, wx, rng, tint) {
    const fh = 2.6;
    const hgt = floors * fh;
    const wall = tint || '#6b7385';
    box(gr, x, y, 0, w, d, hgt, wall, { roof: wx.cover > 0.4 ? '#e9f0fa' : dark(wall, 0.05) });
    // окна на левой (фасадной) грани
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < Math.max(1, Math.floor(w / 1.6)); i++) {
        const lit = wx.night && rng() > 0.45;
        const wx0 = x + 0.5 + i * 1.6, wz = 0.8 + f * fh;
        const q = [P(wx0, y + d, wz), P(wx0 + 0.9, y + d, wz), P(wx0 + 0.9, y + d, wz + 1.3), P(wx0, y + d, wz + 1.3)];
        gr.appendChild(el('polygon', {
          points: pts(q), fill: lit ? '#ffd782' : '#243043', opacity: lit ? 0.95 : 0.8,
        }));
      }
    }
  }

  /** болельщик, идущий ко входу */
  function walker(gr, x, y, color, delay, wx) {
    const p = P(x, y, 0);
    const g2 = el('g', { class: 'ex-walker' });
    g2.style.setProperty('--d', delay.toFixed(2) + 's');
    g2.appendChild(el('ellipse', { cx: p[0], cy: p[1], rx: 2.2, ry: 1.1, fill: 'rgba(0,0,0,.22)' }));
    g2.appendChild(el('rect', { x: p[0] - 1.5, y: p[1] - 7.4, width: 3, height: 5.4, rx: 1.2, fill: color }));
    g2.appendChild(el('circle', { cx: p[0], cy: p[1] - 8.6, r: 1.5, fill: '#e2b183' }));
    if (wx.temp < 2) g2.appendChild(el('rect', { x: p[0] - 1.7, y: p[1] - 10.2, width: 3.4, height: 1.4, rx: 0.7, fill: light(color, 0.3) }));
    gr.appendChild(g2);
  }

  /* ---------- сцена ---------- */
  /**
   * Кадр «дворец спорта снаружи».
   * opts: { weather, fill (заполняемость 0..1), width, title }
   */
  function scene(game, club, opts = {}) {
    const wx = opts.weather || (S.Weather ? S.Weather.make(game.week || 0, 'ex' + club.id) : null);
    const fill = opts.fill != null ? opts.fill : 0.6;
    // нейтральная площадка «Финала четырёх»: чужой город, чужие цвета, большой зал
    const id = opts.accent
      ? { primary: opts.accent, secondary: '#e8eef7', crest: 'shield' }
      : S.Identity.of(club);
    const arena = opts.arena || club.arena;
    const cap = opts.capacity || S.World.arenaCapacity(club);
    const cityName = opts.city || (S.Economy ? S.Economy.arenaShort(club) : club.city);
    const title = opts.title || club.name;
    let seed = 2166136261;
    const str = (opts.city || '') + club.id + club.baseName;
    for (let i = 0; i < str.length; i++) { seed ^= str.charCodeAt(i); seed = Math.imul(seed, 16777619); }
    let a = seed >>> 0;
    const rng = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

    const svg = el('svg', { viewBox: '0 0 ' + VB.w + ' ' + VB.h, class: 'exterior' });
    const defs = el('defs', {});
    svg.appendChild(defs);

    // ---- небо: в изометрии оно видно, в отличие от вида сверху ----
    const dl = wx.daylight || (wx.night ? 'night' : 'day');
    const clearSky = wx.kind === 'clear' || wx.kind === 'bloom' || wx.kind === 'frost';
    const SKY = {
      night: ['#0a1024', '#1b2440'],
      dusk:  clearSky ? ['#1e3566', '#e08a52'] : ['#28324f', '#8a6a70'],
      day:   clearSky ? ['#2f5f96', '#7fa8cd'] : ['#3a4a63', '#697a91'],
    };
    const sky = el('linearGradient', { id: 'exSky' + club.id, x1: 0, y1: 0, x2: 0, y2: 1 });
    sky.appendChild(el('stop', { offset: 0, 'stop-color': SKY[dl][0] }));
    sky.appendChild(el('stop', { offset: 1, 'stop-color': SKY[dl][1] }));
    defs.appendChild(sky);
    svg.appendChild(el('rect', { x: 0, y: 0, width: VB.w, height: VB.h, fill: 'url(#exSky' + club.id + ')' }));

    // ночью — звёзды, днём и в сумерках — солнце у горизонта
    if (dl === 'night') {
      for (let i = 0; i < 26; i++) {
        svg.appendChild(el('circle', {
          cx: (rng() * VB.w).toFixed(1), cy: (rng() * 66).toFixed(1),
          r: (0.5 + rng() * 0.9).toFixed(2), fill: '#dfe7f5', opacity: (0.35 + rng() * 0.5).toFixed(2),
        }));
      }
      if (clearSky) svg.appendChild(el('circle', { cx: 286, cy: 30, r: 8, fill: '#dfe7f5', opacity: 0.9 }));
    } else if (clearSky || dl === 'dusk') {
      svg.appendChild(el('circle', {
        cx: 286, cy: dl === 'dusk' ? 62 : 30, r: dl === 'dusk' ? 15 : 13,
        fill: dl === 'dusk' ? '#ff9d5c' : '#ffd479', opacity: 0.9,
      }));
    }
    // облака
    if (wx.kind !== 'clear' && wx.kind !== 'frost') {
      [[54, 26, 26], [140, 18, 20], [252, 34, 22]].forEach((c, i) => {
        const cg = el('g', { opacity: 0.5 + i * 0.06 });
        [[0, 0, 1], [c[2] * 0.5, -4, 0.8], [c[2], 1, 0.7]].forEach((o) => {
          cg.appendChild(el('ellipse', {
            cx: c[0] + o[0], cy: c[1] + o[1], rx: c[2] * 0.62 * o[2], ry: c[2] * 0.3 * o[2],
            fill: wx.night ? '#26314a' : '#c3cede',
          }));
        });
        svg.appendChild(cg);
      });
    }

    const world = el('g', {});
    svg.appendChild(world);

    // ---- земля ----
    const ground = wx.cover > 0.4 ? '#d7e2f0' : wx.palette.ground;
    slab(world, -30, -26, 96, 90, ground);
    // дорога вдоль дальней стороны
    slab(world, -30, -26, 96, 6, wx.cover > 0.4 ? '#b9c6d8' : '#3b414a');

    // ---- дома на заднем плане ----
    const tints = ['#6b7385', '#7a6f68', '#5f6d7a', '#77707f'];
    let hx = -22;
    while (hx < 56) {
      const w = 7 + rng() * 6;
      house(world, hx, -22, w, 7, 2 + Math.floor(rng() * 3), wx, rng, tints[Math.floor(rng() * tints.length)]);
      hx += w + 2 + rng() * 3;
    }
    for (let i = 0; i < 6; i++) tree(world, -20 + i * 13, -13 + rng() * 2, 0.85 + rng() * 0.25, wx);

    // ---- арена ----
    // размер зала растёт от вложений в трибуны: это видно, а не только в цифрах
    const grow = arena.stands * 1.6;
    const AX = 0, AY = 0, AW = 26 + grow, AD = 18 + grow * 0.7;
    const wallH = 8 + arena.stands * 0.55;
    const wall = '#8d97a8';
    // тень здания
    world.appendChild(el('polygon', {
      points: pts([P(AX + 1.5, AY + 1.5, 0), P(AX + AW + 4, AY + 1.5, 0), P(AX + AW + 4, AY + AD + 4, 0), P(AX + 1.5, AY + AD + 4, 0)]),
      fill: 'rgba(0,0,0,.28)',
    }));
    box(world, AX, AY, 0, AW, AD, wallH, wall, { roof: wx.cover > 0.4 ? '#eef4fc' : '#5d6675' });
    // крыша зала: конёк и световые фонари, чтобы читалась не коробка, а спортивный корпус
    [0.32, 0.5, 0.68].forEach((t) => {
      const ry = AY + AD * t;
      world.appendChild(el('polygon', {
        points: pts([P(AX + 2, ry, wallH), P(AX + AW - 2, ry, wallH), P(AX + AW - 2, ry + 1.4, wallH), P(AX + 2, ry + 1.4, wallH)]),
        fill: wx.night ? '#3c4a63' : '#aab6c8', opacity: 0.75,
      }));
    });

    // фасад ярусами: внизу вход, над ним клубная полоса с названием, сверху остекление
    const glassZ = wallH - 2.1;
    world.appendChild(el('polygon', {
      points: pts([P(AX, AY + AD, glassZ), P(AX + AW, AY + AD, glassZ), P(AX + AW, AY + AD, glassZ + 1.5), P(AX, AY + AD, glassZ + 1.5)]),
      fill: wx.night ? '#ffdc96' : '#a9cbe8', opacity: wx.night ? 0.85 : 0.7,
    }));
    // клубная полоса с названием города — выше козырька, поэтому не перекрывается
    world.appendChild(el('polygon', {
      points: pts([P(AX, AY + AD, 4.6), P(AX + AW, AY + AD, 4.6), P(AX + AW, AY + AD, 7.1), P(AX, AY + AD, 7.1)]),
      fill: id.primary, opacity: 0.94,
    }));
    const nameAnchor = P(AX + AW * 0.5, AY + AD, 5.2);
    // текст лежит на фасадной грани: скос на угол изометрии вокруг точки крепления
    const label = el('text', {
      x: 0, y: 0, 'text-anchor': 'middle',
      'font-size': cityName.length > 17 ? 4.5 : cityName.length > 13 ? 5.4 : cityName.length > 9 ? 6.4 : 7.6, 'font-weight': 800, 'letter-spacing': 0.4, fill: S.Identity.inkOn(id.primary),
      transform: 'translate(' + nameAnchor[0].toFixed(1) + ' ' + nameAnchor[1].toFixed(1) + ') skewY(26.57)',
    }, cityName.toUpperCase().slice(0, 22));
    world.appendChild(label);

    // козырёк входа
    const ex = AX + AW * 0.5 - 4;
    box(world, ex, AY + AD, 0, 8, 3.4, 3.4, dark(wall, 0.1));
    world.appendChild(el('polygon', {
      points: pts([P(ex - 1, AY + AD, 3.9), P(ex + 9, AY + AD, 3.9), P(ex + 9, AY + AD + 5, 3.9), P(ex - 1, AY + AD + 5, 3.9)]),
      fill: id.primary, opacity: 0.9,
    }));

    // мачты освещения и медиа-экран — от уровня «Освещение и медиа»
    const mastSpots = [[AX - 3, AY + AD + 2], [AX + AW + 2, AY + AD + 2], [AX - 3, AY - 3]];
    for (let i = 0; i < arena.media; i++) {
      const mx = mastSpots[i % 3][0], my = mastSpots[i % 3][1];
      box(world, mx, my, 0, 0.7, 0.7, wallH + 6, '#4f596b');
      const lampP = P(mx + 0.35, my + 0.35, wallH + 6.4);
      world.appendChild(el('rect', { x: lampP[0] - 3, y: lampP[1] - 2, width: 6, height: 2.4, rx: 1, fill: wx.night ? '#ffe6ab' : '#93a0b3' }));
      if (wx.night) world.appendChild(el('circle', { cx: lampP[0], cy: lampP[1], r: 11, fill: 'rgba(255,226,160,.20)' }));
    }
    if (arena.media >= 2) {
      const sz = wallH + 0.6;
      world.appendChild(el('polygon', {
        points: pts([P(AX + AW - 9, AY + AD, sz), P(AX + AW - 1, AY + AD, sz), P(AX + AW - 1, AY + AD, sz + 4), P(AX + AW - 9, AY + AD, sz + 4)]),
        fill: '#0b1120', stroke: '#2a3448', 'stroke-width': 0.6,
      }));
    }

    // VIP-надстройка, тренировочная база, кафе и магазин — каждый апгрейд виден отдельным объёмом
    if (arena.vip) box(world, AX + AW * 0.55, AY + 2, wallH, AW * 0.4, AD * 0.5, 1.6 + arena.vip * 1.1, light(wall, 0.12));
    if (arena.base) box(world, AX + AW + 3, AY + 2, 0, 9, 11, 4.5 + arena.base * 0.6, '#79808f',
      { roof: wx.cover > 0.4 ? '#e9f0fa' : '#5b6270' });
    if (arena.service) {
      box(world, AX - 8, AY + AD - 6, 0, 6, 5, 3.2, '#7d6a56');
      world.appendChild(el('polygon', {
        points: pts([P(AX - 9, AY + AD - 6, 3.6), P(AX - 1, AY + AD - 6, 3.6), P(AX - 1, AY + AD + 1, 3.6), P(AX - 9, AY + AD + 1, 3.6)]),
        fill: '#c8563f', opacity: 0.9,
      }));
    }
    if (arena.shop) {
      box(world, AX + AW + 1, AY + AD - 2, 0, 5, 4.5, 3, id.secondary);
      const sp = P(AX + AW + 3.5, AY + AD + 2.5, 3);
      world.appendChild(el('rect', { x: sp[0] - 5, y: sp[1] - 3, width: 10, height: 2.6, rx: 0.8, fill: id.primary }));
    }

    // ---- парковка перед ареной ----
    slab(world, AX - 5, AY + AD + 6, AW + 12, 10, wx.cover > 0.4 ? '#c3d0e0' : '#3c434d');
    const carInk = ['#5d6b88', '#8a5252', '#456a71', '#77775a', '#6d6f76'];
    const cars = Math.min(14, 3 + Math.round(fill * 11));
    for (let i = 0; i < cars; i++) {
      const cx = AX - 4 + (i % 7) * ((AW + 10) / 7);
      const cy = AY + AD + 7.4 + Math.floor(i / 7) * 4.8;
      box(world, cx, cy, 0, 3.6, 2, 1.2, carInk[i % carInk.length]);
      box(world, cx + 0.7, cy + 0.3, 1.2, 2.2, 1.4, 0.9, '#243043');
      if (wx.cover > 0.4) box(world, cx, cy, 2.1, 3.6, 2, 0.35, '#f2f7fd');
    }

    // ---- улица перед ареной: тротуар, проезжая часть и разметка ----
    const roadY = AY + AD + 17;
    slab(world, AX - 26, roadY, AW + 42, 2.5, wx.cover > 0.4 ? '#cbd8e8' : '#4a515c');
    slab(world, AX - 26, roadY + 2.5, AW + 42, 8, wx.cover > 0.4 ? '#b6c4d6' : '#33383f');
    for (let i = 0; i < 9; i++) {
      slab(world, AX - 24 + i * 5, roadY + 6.2, 2.6, 0.5, wx.cover > 0.4 ? '#8fa2ba' : '#8e939b', { opacity: 0.75 });
    }

    // ---- деревья и фонари по периметру ----
    for (let i = 0; i < 4; i++) tree(world, AX - 9, AY + 2 + i * 5, 0.8 + rng() * 0.25, wx);
    for (let i = 0; i < 3; i++) tree(world, AX - 20 + i * 4, AY + AD + 9 + i * 3, 0.75 + rng() * 0.2, wx);
    for (let i = 0; i < 4; i++) {
      const lx = AX - 5 + i * ((AW + 10) / 4), ly = AY + AD + 17;
      box(world, lx, ly, 0, 0.5, 0.5, 7, '#5a6474');
      const lp = P(lx + 0.25, ly + 0.25, 7.4);
      if (wx.night) world.appendChild(el('circle', { cx: lp[0], cy: lp[1], r: dl === 'dusk' ? 10 : 14, fill: dl === 'dusk' ? 'rgba(255,214,140,.13)' : 'rgba(255,214,140,.22)' }));
      world.appendChild(el('circle', { cx: lp[0], cy: lp[1], r: 1.8, fill: wx.night ? '#ffd98a' : '#93a0b3' }));
    }

    // ---- новогодняя ёлка у входа: декабрь и первые недели января ----
    if (wx.month === 11 || wx.month === 0) {
      const tx = AX + AW * 0.5 + 11, ty = AY + AD + 8;
      // ярусы кроны от широкого к узкому
      const tiers = [[0, 3.6, 4.2], [1.2, 2.6, 3.4], [2.2, 1.7, 2.6]];
      box(world, tx - 0.4, ty - 0.4, 0, 0.8, 0.8, 1.2, '#4a3524');
      tiers.forEach((t, i) => {
        const c = P(tx, ty, 1.2 + t[0] * 2);
        world.appendChild(el('polygon', {
          points: [
            [c[0] - t[1] * K, c[1] + t[1] * 0.5 * K],
            [c[0] + t[1] * K, c[1] + t[1] * 0.5 * K],
            [c[0], c[1] - t[2] * 2.6],
          ].map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '),
          fill: i === 0 ? '#1f5c37' : i === 1 ? '#24693f' : '#2a7647',
        }));
        // огни гирлянды
        for (let k = 0; k < 5; k++) {
          const lx = c[0] + (k - 2) * t[1] * 0.42 * K;
          const ly = c[1] + t[1] * 0.28 * K - Math.abs(k - 2) * 1.6;
          world.appendChild(el('circle', {
            cx: lx.toFixed(1), cy: ly.toFixed(1), r: 1.05,
            fill: ['#ffd166', '#ff6b6b', '#4ecdc4', '#f7f7f7'][(i + k) % 4],
            class: 'ex-light', style: '--d:' + ((i * 5 + k) * 0.17).toFixed(2) + 's',
          }));
        }
      });
      // звезда на макушке
      const star = P(tx, ty, 1.2 + 2.2 * 2);
      world.appendChild(el('circle', { cx: star[0], cy: star[1] - 8.5, r: 2, fill: '#ffd166', class: 'ex-light' }));
      // гирлянда по козырьку входа
      const g1 = P(ex - 1, AY + AD + 5, 4.1), g2 = P(ex + 9, AY + AD + 5, 4.1);
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        world.appendChild(el('circle', {
          cx: (g1[0] + (g2[0] - g1[0]) * t).toFixed(1),
          cy: (g1[1] + (g2[1] - g1[1]) * t + Math.sin(t * Math.PI) * 3).toFixed(1),
          r: 0.9, fill: ['#ffd166', '#ff6b6b', '#4ecdc4'][k % 3], class: 'ex-light',
          style: '--d:' + (k * 0.13).toFixed(2) + 's',
        }));
      }
    }

    // ---- телевидение: передвижная телестанция с тарелкой ----
    if (opts.tv) {
      const vx = AX - 13, vy = AY + AD - 1;
      box(world, vx, vy, 0, 8, 3.6, 3.4, '#e8edf5', { roof: '#dfe6f0' });
      box(world, vx + 8, vy + 0.4, 0, 2.6, 2.8, 2.4, '#c9d3e0');
      const dish = P(vx + 3.5, vy + 1.8, 3.4);
      world.appendChild(el('line', { x1: dish[0], y1: dish[1], x2: dish[0], y2: dish[1] - 9, stroke: '#8c97a8', 'stroke-width': 1.4 }));
      world.appendChild(el('ellipse', { cx: dish[0], cy: dish[1] - 11, rx: 4.2, ry: 2.6, fill: '#f2f6fb', stroke: '#9aa6b8', 'stroke-width': 0.6, transform: 'rotate(-18 ' + dish[0].toFixed(1) + ' ' + (dish[1] - 11).toFixed(1) + ')' }));
      const badge = P(vx + 4, vy + 3.6, 2.2);
      world.appendChild(el('text', { x: badge[0], y: badge[1], 'text-anchor': 'middle', 'font-size': 4.4, 'font-weight': 800, fill: '#1d2536' }, 'ПТС'));
    }

    // ---- зрители идут ко входу: чем полнее зал, тем плотнее поток ----
    const fanColors = [id.primary, id.secondary, '#e2e8f0', id.primary];
    const walkers = Math.round(4 + fill * 16);
    for (let i = 0; i < walkers; i++) {
      const t = rng();
      const wx0 = AX + AW * 0.5 - 6 + rng() * 12;
      const wy0 = AY + AD + 4.5 + t * 12;
      walker(world, wx0, wy0, fanColors[Math.floor(rng() * fanColors.length)], rng() * 3.2, wx);
    }

    // ---- осадки поверх всей сцены ----
    if (wx.drop) {
      const layer = el('g', { class: 'ex-drops' });
      const n = Math.round((wx.drop === 'rain' ? 70 : wx.drop === 'snow' ? 60 : 50) * (0.6 + wx.density * 0.5));
      for (let i = 0; i < n; i++) {
        const x = rng() * VB.w;
        const fast = 0.55 + rng() * 0.6;
        const dur = (wx.drop === 'rain' ? 0.85 : wx.drop === 'sleet' ? 1.5 : wx.drop === 'snow' ? 6 : 7) / fast;
        let d;
        if (wx.drop === 'rain' || (wx.drop === 'sleet' && i % 2 === 0)) {
          d = el('line', { x1: 0, y1: 0, x2: -wx.wind * 4.5, y2: 8 + fast * 7, stroke: 'rgba(206,230,255,.75)', 'stroke-width': (0.6 + fast * 0.6).toFixed(2), 'stroke-linecap': 'round' });
        } else if (wx.drop === 'petal') {
          d = el('ellipse', { rx: 1.5 + fast, ry: 0.9 + fast * 0.5, fill: rng() > 0.5 ? '#f7d7e4' : '#fdf3e0', opacity: 0.8 });
        } else {
          d = el('circle', { r: (0.8 + fast * 1.2).toFixed(2), fill: '#ffffff', stroke: 'rgba(96,138,192,.5)', 'stroke-width': 0.3, opacity: 0.85 });
        }
        d.setAttribute('class', 'wx-drop' + (wx.drop === 'petal' ? ' spin' : ''));
        d.style.setProperty('--x', x.toFixed(1) + 'px');
        d.style.setProperty('--dx', (-wx.wind * (wx.drop === 'rain' ? 26 : 60) * (0.6 + rng() * 0.8)).toFixed(1) + 'px');
        d.style.setProperty('--dy', (VB.h + 40) + 'px');
        d.style.animationDuration = dur.toFixed(2) + 's';
        d.style.animationDelay = (-rng() * dur).toFixed(2) + 's';
        layer.appendChild(d);
      }
      svg.appendChild(layer);
    }

    // ---- подпись ----
    if (opts.caption !== false) {
      const capText = U.num(cap) + ' мест · ' + (S.Weather ? S.Weather.line(wx) : '');
      svg.appendChild(el('rect', { x: 0, y: VB.h - 18, width: VB.w, height: 18, fill: 'rgba(8,13,23,.72)' }));
      let tx = 10;
      if (opts.flagCode && S.Flags) {
        const fl = S.Flags.svg(opts.flagCode, 13);
        fl.setAttribute('x', 8); fl.setAttribute('y', VB.h - 14);
        svg.appendChild(fl);
        tx = 26;
      }
      svg.appendChild(el('text', { x: tx, y: VB.h - 5.5, 'font-size': 9.5, 'font-weight': 700, fill: '#e9eefa' }, title));
      svg.appendChild(el('text', { x: VB.w - 10, y: VB.h - 5.5, 'text-anchor': 'end', 'font-size': 9, fill: '#9fb0c8' }, capText));
    }
    return svg;
  }

  S.Exterior = { scene, VB };
})(typeof window !== 'undefined' ? window : globalThis);
