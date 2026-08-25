/* Сетка — флаги сборных. Рисуются вектором прямо в коде: ни одной картинки,
   игра остаётся одним файлом и работает офлайн. Сложные гербы упрощены до узнаваемого силуэта. */
(function (global) {
  const S = global.SETKA;
  const NS = 'http://www.w3.org/2000/svg';
  const W = 30, H = 20;

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  const rect = (x, y, w, h, fill) => el('rect', { x, y, width: w, height: h, fill });
  const circle = (cx, cy, r, fill) => el('circle', { cx, cy, r, fill });

  /** пятиконечная звезда */
  function star(cx, cy, r, fill, rot) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.42 : r;
      const a = -Math.PI / 2 + (i * Math.PI) / 5 + (rot || 0);
      pts.push((cx + Math.cos(a) * rr).toFixed(2) + ',' + (cy + Math.sin(a) * rr).toFixed(2));
    }
    return el('polygon', { points: pts.join(' '), fill });
  }

  /** горизонтальные и вертикальные полосы */
  const bandsH = (g, colors) => colors.forEach((c, i) => g.appendChild(rect(0, i * (H / colors.length), W, H / colors.length + 0.02, c)));
  const bandsV = (g, colors) => colors.forEach((c, i) => g.appendChild(rect(i * (W / colors.length), 0, W / colors.length + 0.02, H, c)));

  /* Определения флагов: код → функция отрисовки. Пропорции 3:2. */
  const FLAGS = {
    RUS: (g) => bandsH(g, ['#ffffff', '#0039a6', '#d52b1e']),
    ITA: (g) => bandsV(g, ['#008c45', '#f4f5f0', '#cd212a']),
    POL: (g) => bandsH(g, ['#ffffff', '#dc143c']),
    FRA: (g) => bandsV(g, ['#002395', '#ffffff', '#ed2939']),
    SRB: (g) => { bandsH(g, ['#c6363c', '#0c4076', '#ffffff']); g.appendChild(rect(6, 5, 5, 9, '#c6363c')); g.appendChild(el('path', { d: 'M6 5h5v6l-2.5 3L6 11z', fill: '#c6363c', stroke: '#edb92e', 'stroke-width': 0.7 })); },
    SLO: (g) => {
      bandsH(g, ['#ffffff', '#0000c0', '#d50000']);
      // герб у древка: белый щит с синей горой и волной
      g.appendChild(el('path', { d: 'M4.6 3.4h5.6v4.6q0 2.4-2.8 3.4-2.8-1-2.8-3.4z', fill: '#ffffff', stroke: '#0000c0', 'stroke-width': 0.55 }));
      g.appendChild(el('path', { d: 'M5.5 8.4l1.9-2.8 1.9 2.8z', fill: '#0000c0' }));
      g.appendChild(el('path', { d: 'M5.2 9.4q1.1-0.7 2.2 0 1.1 0.7 2.2 0', fill: 'none', stroke: '#0000c0', 'stroke-width': 0.5 }));
      g.appendChild(star(7.4, 3.1, 0.7, '#f7d417'));
    },
    GER: (g) => bandsH(g, ['#000000', '#dd0000', '#ffce00']),
    TUR: (g) => {
      g.appendChild(rect(0, 0, W, H, '#e30a17'));
      g.appendChild(circle(11, 10, 4.6, '#ffffff'));
      g.appendChild(circle(12.6, 10, 3.7, '#e30a17'));
      g.appendChild(star(17.4, 10, 2.2, '#ffffff'));
    },
    NED: (g) => bandsH(g, ['#ae1c28', '#ffffff', '#21468b']),
    BUL: (g) => bandsH(g, ['#ffffff', '#00966e', '#d62612']),
    UKR: (g) => bandsH(g, ['#0057b7', '#ffd700']),
    CZE: (g) => { bandsH(g, ['#ffffff', '#d7141a']); g.appendChild(el('polygon', { points: '0,0 13,10 0,20', fill: '#11457e' })); },
    BEL: (g) => bandsV(g, ['#000000', '#fdda24', '#ef3340']),
    GRE: (g) => {
      for (let i = 0; i < 9; i++) g.appendChild(rect(0, i * (H / 9), W, H / 9 + 0.02, i % 2 ? '#ffffff' : '#0d5eaf'));
      g.appendChild(rect(0, 0, 11.2, 11.2, '#0d5eaf'));
      g.appendChild(rect(4.6, 0, 2.2, 11.2, '#ffffff'));
      g.appendChild(rect(0, 4.5, 11.2, 2.2, '#ffffff'));
    },
    FIN: (g) => { g.appendChild(rect(0, 0, W, H, '#ffffff')); g.appendChild(rect(8, 0, 4.4, H, '#003580')); g.appendChild(rect(0, 7.8, W, 4.4, '#003580')); },
    POR: (g) => { g.appendChild(rect(0, 0, W, H, '#da291c')); g.appendChild(rect(0, 0, 12, H, '#046a38')); g.appendChild(circle(12, 10, 4, '#ffe900')); g.appendChild(circle(12, 10, 2.4, '#da291c')); },
    BRA: (g) => {
      g.appendChild(rect(0, 0, W, H, '#009c3b'));
      g.appendChild(el('polygon', { points: '15,2 28,10 15,18 2,10', fill: '#ffdf00' }));
      g.appendChild(circle(15, 10, 4.2, '#002776'));
      g.appendChild(el('path', { d: 'M11 9.2q4 -2 8 0.8', fill: 'none', stroke: '#ffffff', 'stroke-width': 1.1 }));
    },
    USA: (g) => {
      for (let i = 0; i < 7; i++) g.appendChild(rect(0, i * (H / 7), W, H / 7 + 0.02, i % 2 ? '#ffffff' : '#b22234'));
      g.appendChild(rect(0, 0, 13, 11, '#3c3b6e'));
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) g.appendChild(circle(1.8 + c * 2.6, 2.2 + r * 3.4, 0.62, '#ffffff'));
    },
    ARG: (g) => { bandsH(g, ['#74acdf', '#ffffff', '#74acdf']); g.appendChild(circle(15, 10, 2.4, '#f6b40e')); },
    IRI: (g) => {
      bandsH(g, ['#239f40', '#ffffff', '#da0000']);
      // эмблема в центре упрощена до узнаваемого силуэта
      g.appendChild(el('path', { d: 'M14.6 8.2h0.8v3.4h-0.8z', fill: '#da0000' }));
      g.appendChild(el('path', { d: 'M13.2 9.1h0.7v2.1h-0.7z M16.1 9.1h0.7v2.1h-0.7z', fill: '#da0000' }));
      g.appendChild(el('path', { d: 'M13.4 11.2q1.6 1 3.2 0', fill: 'none', stroke: '#da0000', 'stroke-width': 0.6 }));
    },
    JPN: (g) => { g.appendChild(rect(0, 0, W, H, '#ffffff')); g.appendChild(circle(15, 10, 5.2, '#bc002d')); },
    CUB: (g) => {
      for (let i = 0; i < 5; i++) g.appendChild(rect(0, i * (H / 5), W, H / 5 + 0.02, i % 2 ? '#ffffff' : '#002a8f'));
      g.appendChild(el('polygon', { points: '0,0 12,10 0,20', fill: '#cf142b' }));
      g.appendChild(star(4.2, 10, 2.4, '#ffffff'));
    },
    CAN: (g) => {
      g.appendChild(rect(0, 0, W, H, '#ffffff'));
      g.appendChild(rect(0, 0, 7.5, H, '#d80621'));
      g.appendChild(rect(22.5, 0, 7.5, H, '#d80621'));
      // кленовый лист: упрощённый силуэт с черенком
      g.appendChild(el('path', {
        d: 'M15 3.6l0.9 2.6 2.2-0.5-0.6 2.2 1.9 0.3-1.4 1.5 2.4 1.9-3.4 0.8 0.4 1.3-2.2-0.3 0.2 3.2h-0.8l0.2-3.2-2.2 0.3 0.4-1.3-3.4-0.8 2.4-1.9-1.4-1.5 1.9-0.3-0.6-2.2 2.2 0.5z',
        fill: '#d80621',
      }));
    },
    CHN: (g) => {
      g.appendChild(rect(0, 0, W, H, '#de2910'));
      g.appendChild(star(5.6, 5.6, 3, '#ffde00'));
      [[10.6, 2.2], [12.8, 4.2], [12.8, 7], [10.6, 8.9]].forEach(([x, y]) => g.appendChild(star(x, y, 1.1, '#ffde00')));
    },
    EGY: (g) => {
      bandsH(g, ['#ce1126', '#ffffff', '#000000']);
      // орёл Саладина — золотым силуэтом
      g.appendChild(el('path', { d: 'M15 7.9q1.9 0.5 2.6 1.9-1.1-0.4-1.8-0.2l0.5 1.5-1.3-0.9-1.3 0.9 0.5-1.5q-0.7-0.2-1.8 0.2 0.7-1.4 2.6-1.9z', fill: '#c09300' }));
      g.appendChild(el('rect', { x: 14.4, y: 10.6, width: 1.2, height: 1.4, rx: 0.3, fill: '#c09300' }));
    },
    TUN: (g) => {
      g.appendChild(rect(0, 0, W, H, '#e70013'));
      g.appendChild(circle(15, 10, 5, '#ffffff'));
      g.appendChild(circle(15, 10, 3.6, '#e70013'));
      g.appendChild(circle(16.2, 10, 2.9, '#ffffff'));
      g.appendChild(star(16.4, 10, 1.6, '#e70013'));
    },
    AUS: (g) => {
      g.appendChild(rect(0, 0, W, H, '#00247d'));
      g.appendChild(rect(0, 0, 13, 10, '#0f2f7a'));
      g.appendChild(rect(5.4, 0, 2.2, 10, '#ffffff'));
      g.appendChild(rect(0, 3.9, 13, 2.2, '#ffffff'));
      g.appendChild(star(6.5, 15.4, 2, '#ffffff'));
      [[20, 5], [24.5, 8.5], [21.5, 13], [26, 14.5]].forEach(([x, y]) => g.appendChild(star(x, y, 1.15, '#ffffff')));
    },
    QAT: (g) => {
      g.appendChild(rect(0, 0, W, H, '#8a1538'));
      g.appendChild(rect(0, 0, 8, H, '#ffffff'));
      const pts = ['8,0'];
      for (let i = 0; i < 9; i++) { pts.push((i % 2 ? 8 : 11.4) + ',' + (i * (H / 9)).toFixed(1)); }
      pts.push('8,' + H);
      g.appendChild(el('polygon', { points: pts.join(' '), fill: '#ffffff' }));
    },
  };

  /** флаг сборной как SVG нужного размера */
  function svg(code, size) {
    const draw = FLAGS[code];
    const s = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H, width: size || 18, height: (size || 18) * H / W,
      class: 'flag',
    });
    const g = el('g', { 'clip-path': 'inset(0 round 2)' });
    if (draw) draw(g); else g.appendChild(rect(0, 0, W, H, '#39424f'));
    s.appendChild(g);
    s.appendChild(el('rect', { x: 0.4, y: 0.4, width: W - 0.8, height: H - 0.8, rx: 2, fill: 'none', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 0.8 }));
    return s;
  }

  /** флаг по названию сборной */
  function byNation(name, size) {
    const n = S.National ? S.National.nationBy(name) : null;
    return svg(n ? n.code : '', size);
  }

  /** флаг по языку игрока: у легионеров он показывает гражданство */
  const LANG_TO_CODE = { ru: 'RUS', it: 'ITA', pl: 'POL', rs: 'SRB', br: 'BRA', cu: 'CUB', fr: 'FRA', ar: 'ARG' };
  function byLang(lang, size) { return svg(LANG_TO_CODE[lang] || '', size); }

  S.Flags = { svg, byNation, byLang, FLAGS, LANG_TO_CODE };
})(typeof window !== 'undefined' ? window : globalThis);
